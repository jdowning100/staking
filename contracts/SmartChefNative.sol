// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * Sliding-window vesting via accTokenPerShare checkpoints.
 * - Users have a "baseline" per-share (debtClaimablePS). What's claimable now is
 *   E * (accPS_at(block - delay) - baseline). No writes are needed to *view* it.
 * - We keep a small ring of checkpoints and integrate piece-wise between them.
 * - Early exits are DISALLOWED. Unlocked exits move stake into an exit queue; rewards
 *   already streamed but inside the delay window keep vesting "virtually" and are captured
 *   at request time into (delayedReward, delayedUnlockBlock) so users can still claim them
 *   after they unlock, even though their stake stopped earning further.
 */
contract SmartChefNative is Ownable, ReentrancyGuard, Pausable {
  // ---------------------------
  // User data
  // ---------------------------
  struct UserInfo {
    uint256 amount;              // principal
    uint256 effectiveAmount;     // amount * multiplier
    uint256 rewardDebt;          // for pendingReward()
    uint256 debtClaimablePS;     // baseline for sliding-window claimable view
    uint256 lockStartBlock;
    uint256 lockDuration;        // seconds
    uint256 lockDurationBlocks;  // derived from blockTime
    uint256 withdrawRequestBlock;
    uint256 withdrawalAmount;

    // exiting portion's delayed pipeline snapshot (for unlocked exits)
    uint256 delayedReward;       // fixed sum that unlocks later
    uint256 delayedUnlockBlock;  // when delayedReward becomes claimable
  }

  // ---------------------------
  // Config
  // ---------------------------
  uint256 public REWARD_DELAY_PERIOD = 10 minutes;
  uint256 public EXIT_PERIOD         = 10 minutes;
  uint256 public rewardPerBlock;
  uint256 public startBlock;
  uint256 public lastRewardBlock;
  uint256 public blockTime = 5; // seconds

  bool     public hasUserLimit;
  uint256  public poolLimitPerUser;
  uint256  public PRECISION_FACTOR; // internal scale for per-share math (1e12 here)

  // Timelock for parameter changes (24 hours)
  uint256 public constant PARAM_CHANGE_DELAY = 24 hours;

  struct PendingChange {
    uint256 value;
    uint256 executeAfter;
  }

  mapping(bytes32 => PendingChange) public pendingChanges;

  // ---------------------------
  // Pool state
  // ---------------------------
  uint256 public accTokenPerShare;      // scaled by PRECISION_FACTOR
  uint256 public totalStaked;           // principal (includes exit)
  uint256 public totalActiveEffective;  // active effective (denominator)
  uint256 public totalInExitPeriod;     // principal in exit queue (not earning)
  uint256 public totalAccruedRewards;   // sum streamed into accPS
  uint256 public totalClaimedRewards;   // sum paid out

  mapping(address => UserInfo) public userInfo;

  // ---------------------------
  // Checkpoint ring for sliding window (accTokenPerShare timeline)
  // ---------------------------
  struct Checkpoint { 
    uint64 blockNum; 
    uint256 acc;
    uint256 rate; // accrual rate per block (rewardPerBlock * PRECISION_FACTOR / totalActiveEffective, or 0 if zero active)
  }
  uint16 internal constant MAX_CHECKPOINTS = 256;
  mapping(uint16 => Checkpoint) internal _checkpoints;
  uint16 internal _cpHead;        // last written index
  uint16 internal _cpSize;        // number of valid checkpoints

  // Permanent freeze flag
  bool private _permanentlyFrozen;

  // ---------------------------
  // Events
  // ---------------------------
  event Deposit(address indexed user, uint256 amount, uint256 duration);
  event WithdrawRequested(address indexed user, uint256 amount, uint256 availableTime);
  event WithdrawExecuted(address indexed user, uint256 amount);
  event RewardClaimed(address indexed user, uint256 amount);
  event NewPoolLimit(uint256 poolLimitPerUser);
  event AdminTokenRecovery(address tokenRecovered, uint256 amount);
  event RewardsFunded(uint256 amount);
  event PeriodsUpdated(uint256 rewardDelayPeriod, uint256 exitPeriod);
  event NewRewardPerBlock(uint256 newRate);
  event BlockTimeUpdated(uint256 oldBlockTime, uint256 newBlockTime);
  event ParameterChangeScheduled(bytes32 indexed paramHash, uint256 value, uint256 executeAfter);
  event ParameterChangeExecuted(bytes32 indexed paramHash, uint256 value);
  event ParameterChangeCancelled(bytes32 indexed paramHash);
  event FrozenPermanently();

  constructor(
    uint256 _poolLimitPerUser,
    uint256 _rewardDelayPeriod,
    uint256 _exitPeriod,
    uint256 _rewardPerBlock,
    uint256 _startBlock
  ) Ownable(msg.sender) {
    if (_poolLimitPerUser > 0) {
      hasUserLimit = true;
      poolLimitPerUser = _poolLimitPerUser;
    }
    REWARD_DELAY_PERIOD = _rewardDelayPeriod;
    EXIT_PERIOD         = _exitPeriod;

    // Use 1e12 internal precision (native 18 decimals => overall ~1e30 resolution if needed)
    PRECISION_FACTOR = 1e12;

    rewardPerBlock  = _rewardPerBlock;
    startBlock      = _startBlock > block.number ? _startBlock : block.number;
    lastRewardBlock = startBlock;

    uint256 initRate = totalActiveEffective == 0 ? 0 : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
    _pushCheckpoint(uint64(block.number), 0, initRate); // initial
  }

  // ---------------------------
  // Freeze Controls (Irreversible Pause)
  // ---------------------------
  function freezePermanently() external onlyOwner {
    _pause();
    _permanentlyFrozen = true;
    emit FrozenPermanently();
  }

  function _unpause() internal override {
    require(!_permanentlyFrozen, "Contract is permanently frozen");
    super._unpause();
  }

  // ---------------------------
  // Internals: helpers
  // ---------------------------
  function _getBoostMultiplier(uint256 _duration) internal pure returns (uint256) {
    if (_duration == 10 minutes) return 1e18;
    if (_duration == 20 minutes) return 1500000000000000000; // 1.5e18
    revert("Invalid duration");
  }

  function _activePrincipal() internal view returns (uint256) {
    return totalStaked - totalInExitPeriod;
  }

  function _activeEffective() internal view returns (uint256) {
    return totalActiveEffective;
  }

  function _rewardBalance() internal view returns (uint256) {
    uint256 bal = address(this).balance;
    return bal > totalStaked ? bal - totalStaked : 0;
  }

  function _safeTransferNative(address _to, uint256 _amount) internal {
    (bool success, ) = _to.call{ value: _amount }("");
    require(success, "Native transfer failed");
  }

  // ---------------------------
  // Core staking
  // ---------------------------
  function deposit(uint256 _duration) external payable nonReentrant whenNotPaused {
    require(_duration == 10 minutes || _duration == 20 minutes, "Invalid duration");
    UserInfo storage user = userInfo[msg.sender];
    uint256 _amount = msg.value;
    require(_amount > 0, "Zero deposit");
    require(user.withdrawRequestBlock == 0, "In exit period");

    if (hasUserLimit) {
      require(_amount + user.amount <= poolLimitPerUser, "Above limit");
    }

    _updatePool();

    if (user.amount > 0) {
      _claimRewardsInternal(msg.sender, 0);
      require(_duration == user.lockDuration, "Duration mismatch");
    } else {
      user.lockDuration = _duration;
      // Set baseline to current accPS to prevent claiming pre-existing rewards
      user.debtClaimablePS = accTokenPerShare;
    }

    uint256 mult = _getBoostMultiplier(_duration);
    uint256 addEff = Math.mulDiv(_amount, mult, 1e18);

    user.effectiveAmount += addEff;
    totalActiveEffective += addEff;

    user.amount += _amount;
    totalStaked += _amount;

    user.lockStartBlock     = block.number;
    user.lockDurationBlocks = _duration / blockTime;

    user.rewardDebt = Math.mulDiv(user.effectiveAmount, accTokenPerShare, PRECISION_FACTOR);

    // rate changed (denominator changed) -> push checkpoint
    uint256 newRate = totalActiveEffective == 0 ? 0 : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
    _pushCheckpoint(uint64(block.number), accTokenPerShare, newRate);

    emit Deposit(msg.sender, _amount, _duration);
  }

  // Only allow withdrawal request when unlocked (NO EARLY EXITS)
  function requestWithdraw(uint256 _amount) external nonReentrant whenNotPaused {
    UserInfo storage user = userInfo[msg.sender];
    require(_amount > 0 && user.amount >= _amount, "Bad amount");
    require(user.lockStartBlock > 0, "No stake");
    require(user.withdrawRequestBlock == 0, "Already requested");
    require(block.number >= user.lockStartBlock + user.lockDurationBlocks, "Stake locked");

    _updatePool();

    // Claim matured pipeline up to now BEFORE removing effective from denominator
    _claimRewardsInternal(msg.sender, 0);

    // Snapshot the delayed portion for the exiting amount
    uint256 exitEffective = Math.mulDiv(_amount, _getBoostMultiplier(user.lockDuration), 1e18);

    uint256 delayBlocks = REWARD_DELAY_PERIOD / blockTime;
    uint256 tBlock = block.number > delayBlocks ? block.number - delayBlocks : 0;
    uint256 accPast = _accPSAtBlock(uint64(tBlock));
    uint256 deltaPS = accTokenPerShare - accPast;
    if (deltaPS > 0) {
      uint256 exitLocked = Math.mulDiv(exitEffective, deltaPS, PRECISION_FACTOR);
      user.delayedReward += exitLocked;
      user.delayedUnlockBlock = block.number + delayBlocks;
    }

    // Remove from active
    user.effectiveAmount -= exitEffective;
    totalActiveEffective -= exitEffective;

    // Move principal into exit queue
    user.withdrawRequestBlock = block.number;
    user.withdrawalAmount     = _amount;
    totalInExitPeriod        += _amount;

    user.rewardDebt = Math.mulDiv(user.effectiveAmount, accTokenPerShare, PRECISION_FACTOR);

    // rate changed (denominator changed) -> push checkpoint
    uint256 newRate = totalActiveEffective == 0 ? 0 : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
    _pushCheckpoint(uint64(block.number), accTokenPerShare, newRate);

    uint256 availableTime = block.timestamp + EXIT_PERIOD;
    emit WithdrawRequested(msg.sender, _amount, availableTime);
  }

  function executeWithdraw() external nonReentrant whenNotPaused {
    // Auto-claim any matured rewards (unlocked snapshot and sliding-window portion)
    _claimRewardsInternal(msg.sender, 0);
    UserInfo storage user = userInfo[msg.sender];
    require(user.withdrawRequestBlock > 0, "No request");
    uint256 exitBlocks = EXIT_PERIOD / blockTime;
    require(block.number >= user.withdrawRequestBlock + exitBlocks, "Exit not finished");

    uint256 amt = user.withdrawalAmount;
    require(amt > 0, "No amount");

    // Effects
    user.amount       -= amt;
    totalStaked       -= amt;
    totalInExitPeriod -= amt;

    user.withdrawRequestBlock = 0;
    user.withdrawalAmount     = 0;

    if (user.amount == 0) {
      user.lockStartBlock     = 0;
      user.lockDurationBlocks = 0;
      user.lockDuration       = 0;
      user.effectiveAmount    = 0;
      user.rewardDebt         = 0;
      user.debtClaimablePS    = 0;
    } else {
      user.rewardDebt = Math.mulDiv(user.effectiveAmount, accTokenPerShare, PRECISION_FACTOR);
    }

    _safeTransferNative(msg.sender, amt);
    emit WithdrawExecuted(msg.sender, amt);
  }

  function cancelWithdraw() external nonReentrant whenNotPaused {
    UserInfo storage user = userInfo[msg.sender];
    require(user.withdrawRequestBlock > 0, "No request");

    _updatePool();
    _claimRewardsInternal(msg.sender, 0);

    uint256 addEff = Math.mulDiv(user.withdrawalAmount, _getBoostMultiplier(user.lockDuration), 1e18);
    user.effectiveAmount += addEff;
    totalActiveEffective += addEff;

    totalInExitPeriod        -= user.withdrawalAmount;
    user.withdrawRequestBlock = 0;
    user.withdrawalAmount     = 0;

    user.delayedReward       = 0;
    user.delayedUnlockBlock  = 0;

    user.rewardDebt = Math.mulDiv(user.effectiveAmount, accTokenPerShare, PRECISION_FACTOR);

    // rate changed (denominator changed) -> push checkpoint
    uint256 newRate = totalActiveEffective == 0 ? 0 : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
    _pushCheckpoint(uint64(block.number), accTokenPerShare, newRate);
  }

  /**
   * Emergency withdrawal: Allows users to withdraw their principal (native tokens) without rewards
   * when the contract is paused. Does not claim rewards or respect locks/exits.
   */
  function emergencyWithdraw() external nonReentrant whenPaused {
    UserInfo storage user = userInfo[msg.sender];
    uint256 amt = user.amount + user.withdrawalAmount; // Include any in-exit amount
    require(amt > 0, "No funds to withdraw");

    // Reset user state
    totalStaked        -= user.amount;
    totalActiveEffective -= user.effectiveAmount;
    totalInExitPeriod  -= user.withdrawalAmount;

    user.amount = 0;
    user.effectiveAmount = 0;
    user.rewardDebt = 0;
    user.debtClaimablePS = 0;
    user.lockStartBlock = 0;
    user.lockDuration = 0;
    user.lockDurationBlocks = 0;
    user.withdrawRequestBlock = 0;
    user.withdrawalAmount = 0;
    user.delayedReward = 0;
    user.delayedUnlockBlock = 0;

    // rate changed (denominator changed) -> push checkpoint
    uint256 newRate = totalActiveEffective == 0 ? 0 : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
    _pushCheckpoint(uint64(block.number), accTokenPerShare, newRate);

    _safeTransferNative(msg.sender, amt);
    emit WithdrawExecuted(msg.sender, amt);
  }

  // ---------------------------
  // Rewards
  // ---------------------------
  function claimRewards() external nonReentrant whenNotPaused {
    _claimRewardsInternal(msg.sender, 0);
  }

  function claimRewardsWithSlippage(uint256 minReward) external nonReentrant whenNotPaused {
    _claimRewardsInternal(msg.sender, minReward);
  }

  function _claimRewardsInternal(address _user, uint256 minReward) internal {
    UserInfo storage user = userInfo[_user];

    // Compute VESTED frontier: accPS at (block - delay)
    uint256 delayBlocks = REWARD_DELAY_PERIOD / blockTime;
    uint256 tBlock = block.number > delayBlocks ? block.number - delayBlocks : 0;
    uint256 accPast = _accPSAtBlock(uint64(tBlock));

    // Virtual owed since last claim baseline
    uint256 baseline = user.debtClaimablePS;
    uint256 virtualOwed = 0;
    if (accPast > baseline && user.effectiveAmount > 0) {
      virtualOwed = Math.mulDiv(user.effectiveAmount, (accPast - baseline), PRECISION_FACTOR);
    }

    _updatePool();

    uint256 owed = virtualOwed;

    // Add snapshot from exiting portion if unlocked
    if (user.delayedUnlockBlock > 0 && block.number >= user.delayedUnlockBlock) {
      owed += user.delayedReward;
      user.delayedReward = 0;
      user.delayedUnlockBlock = 0;
    }

    uint256 budget = _rewardBalance();
    uint256 pay = owed <= budget ? owed : budget;

    // Slippage protection
    require(pay >= minReward, "Slippage: reward too low");

    if (pay > 0) {
      _safeTransferNative(_user, pay);
      totalClaimedRewards += pay;
      emit RewardClaimed(_user, pay);
    }

    // Advance baseline proportionally for partial payments with improved precision
    if (owed > 0) {
      if (pay >= owed) {
        user.debtClaimablePS = accPast;
      } else {
        uint256 delta = accPast > baseline ? accPast - baseline : 0;
        if (delta > 0) {
          uint256 advance = Math.mulDiv(pay, delta, owed);
          user.debtClaimablePS = baseline + advance;
        }
      }
    } else {
      user.debtClaimablePS = accPast;
    }

    // Keep rewardDebt synced for pending view
    user.rewardDebt = Math.mulDiv(user.effectiveAmount, accTokenPerShare, PRECISION_FACTOR);
  }

  // ---------------------------
  // Views
  // ---------------------------
  function pendingReward(address _user) public view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    if (user.withdrawRequestBlock != 0) return 0;

    uint256 active = _activeEffective();
    if (active == 0) return 0;

    uint256 adjusted = _accPSNowView();
    uint256 earned = Math.mulDiv(user.effectiveAmount, adjusted, PRECISION_FACTOR);
    if (earned >= user.rewardDebt) {
        return earned - user.rewardDebt;
    }
    return 0;
  }

  // Pure read-only: what's claimable now from the sliding window + unlocked delayed snapshot
  function claimableView(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    uint256 owed = 0;

    // Unlocked snapshot from exiting portion
    if (user.delayedUnlockBlock > 0 && block.number >= user.delayedUnlockBlock) {
      owed += user.delayedReward;
    }

    // sliding window for current effective
    uint256 E = user.effectiveAmount;
    if (E == 0) return owed;

    uint256 delayBlocks = REWARD_DELAY_PERIOD / blockTime;
    uint256 tBlock = block.number > delayBlocks ? block.number - delayBlocks : 0;
    uint256 accPast = _accPSAtBlock(uint64(tBlock));
    uint256 baseline = user.debtClaimablePS;
    if (accPast > baseline) {
      owed += Math.mulDiv(E, (accPast - baseline), PRECISION_FACTOR);
    }
    return owed;
  }

  // How much has streamed but is still locked (inside the delay window) + locked snapshot
  function lockedView(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    uint256 locked = 0;

    // Locked snapshot from exiting portion
    if (user.delayedUnlockBlock > 0 && block.number < user.delayedUnlockBlock) {
      locked += user.delayedReward;
    }

    uint256 E = user.effectiveAmount;
    if (E == 0) return locked;

    uint256 accNow = _accPSNowView();
    uint256 delayBlocks = REWARD_DELAY_PERIOD / blockTime;
    uint256 tBlock = block.number > delayBlocks ? block.number - delayBlocks : 0;
    uint256 accPast = _accPSAtBlock(uint64(tBlock));
    if (accNow > accPast) {
      locked += Math.mulDiv(E, (accNow - accPast), PRECISION_FACTOR);
    }
    return locked;
  }

  function isLocked(address _user) external view returns (bool) {
    UserInfo storage user = userInfo[_user];
    if (user.lockStartBlock == 0) return false;
    return block.number < user.lockStartBlock + user.lockDurationBlocks;
  }

  function isInExitPeriod(address _user) external view returns (bool) {
    return userInfo[_user].withdrawRequestBlock > 0;
  }

  function getUserInfo(address _user)
    external
    view
    returns (
      uint256 stakedAmount,
      uint256 lockStartTime,
      uint256 lockEndTime,
      uint256 lockDuration,
      uint256 withdrawRequestTime,
      uint256 withdrawalAmount,
      uint256 withdrawalAvailableTime,
      bool isLocked_,
      bool inExitPeriod,
      bool canRequestWithdraw,
      bool canExecuteWithdraw
    )
  {
    UserInfo storage user = userInfo[_user];
    stakedAmount     = user.amount;
    lockDuration     = user.lockDuration;
    withdrawalAmount = user.withdrawalAmount;

    lockStartTime       = user.lockStartBlock == 0 ? 0 : (block.timestamp - (block.number - user.lockStartBlock) * blockTime);
    withdrawRequestTime = user.withdrawRequestBlock == 0 ? 0 : (block.timestamp - (block.number - user.withdrawRequestBlock) * blockTime);

    if (user.lockStartBlock > 0) {
      lockEndTime        = lockStartTime + lockDuration;
      isLocked_          = block.number < user.lockStartBlock + user.lockDurationBlocks;
      canRequestWithdraw = !isLocked_ && user.withdrawRequestBlock == 0;
    }

    if (user.withdrawRequestBlock > 0) {
      inExitPeriod = true;
      uint256 exitBlocks = EXIT_PERIOD / blockTime;
      withdrawalAvailableTime = withdrawRequestTime + EXIT_PERIOD;
      canExecuteWithdraw      = block.number >= user.withdrawRequestBlock + exitBlocks;
    }
  }

  function timeUntilUnlock(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    if (user.lockStartBlock == 0) return 0;
    if (block.number >= user.lockStartBlock + user.lockDurationBlocks) return 0;
    uint256 remaining = user.lockStartBlock + user.lockDurationBlocks - block.number;
    return remaining * blockTime;
  }

  function timeUntilWithdrawalAvailable(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    if (user.withdrawRequestBlock == 0) return 0;
    uint256 exitBlocks = EXIT_PERIOD / blockTime;
    if (block.number >= user.withdrawRequestBlock + exitBlocks) return 0;
    uint256 remaining = user.withdrawRequestBlock + exitBlocks - block.number;
    return remaining * blockTime;
  }

  function getUserStatus(address _user) external view returns (string memory) {
    UserInfo storage user = userInfo[_user];
    if (user.amount == 0) return "No stake";
    if (user.withdrawRequestBlock > 0) {
      uint256 exitBlocks = EXIT_PERIOD / blockTime;
      if (block.number >= user.withdrawRequestBlock + exitBlocks) return "Withdrawal ready";
      return "In exit period";
    }
    if (block.number < user.lockStartBlock + user.lockDurationBlocks) return "Locked";
    return "Unlocked";
  }

  function getRewardBalance() external view returns (uint256) {
    return _rewardBalance();
  }

  function getEstimatedAPY(uint256 _duration) public view returns (uint256) {
    if (_duration != 10 minutes && _duration != 20 minutes) return 0;
    uint256 activePrincipal = _activePrincipal();
    if (activePrincipal == 0) return 0;
    uint256 mult = _getBoostMultiplier(_duration);
    uint256 blocksPerYear = 365 days / blockTime;
    uint256 annualRewards = rewardPerBlock * blocksPerYear;
    uint256 base = Math.mulDiv(annualRewards, 10000, activePrincipal); // basis points
    return Math.mulDiv(base, mult, 1e18);
  }

  function getBaseAPY() public view returns (uint256) {
    uint256 activePrincipal = _activePrincipal();
    if (activePrincipal == 0) return 0;
    uint256 blocksPerYear = 365 days / blockTime;
    uint256 annualRewards = rewardPerBlock * blocksPerYear;
    return Math.mulDiv(annualRewards, 10000, activePrincipal);
  }

  function isPermanentlyFrozen() external view returns (bool) {
    return _permanentlyFrozen;
  }

  // ---------------------------
  // Reward accounting + checkpoints
  // ---------------------------
  function _updatePool() internal {
    if (block.number <= lastRewardBlock) return;

    uint256 active = _activeEffective();
    if (active == 0) {
      lastRewardBlock = block.number;
      if (_cpSize == 0 || _checkpoints[_cpHead].rate != 0) {
        _pushCheckpoint(uint64(block.number), accTokenPerShare, 0);
      }
      return;
    }

    uint256 mult = block.number - lastRewardBlock;
    uint256 toAlloc = 0;
    while (mult > 0 && rewardPerBlock > 0) {
        uint256 safeMult = mult > (type(uint256).max / rewardPerBlock) ? (type(uint256).max / rewardPerBlock) : mult;
        toAlloc += safeMult * rewardPerBlock;
        mult -= safeMult;
        lastRewardBlock += safeMult;
    }

    uint256 undistributed = totalAccruedRewards > totalClaimedRewards ? totalAccruedRewards - totalClaimedRewards : 0;
    uint256 currentRewards = _rewardBalance();
    uint256 allocCap = currentRewards > undistributed ? currentRewards - undistributed : 0;
    if (toAlloc > allocCap) toAlloc = allocCap;

    if (toAlloc > 0) {
        uint256 prec = PRECISION_FACTOR;
        while (toAlloc > 0 && prec > 0 && toAlloc > type(uint256).max / prec) {
            prec /= 10;  // Reduce precision if needed to avoid overflow
        }
        accTokenPerShare += Math.mulDiv(toAlloc, prec, active);
        totalAccruedRewards += toAlloc;
    }
    lastRewardBlock = block.number;
  }

  function _accPSNowView() internal view returns (uint256) {
    if (_cpSize == 0) return accTokenPerShare;

    (bool ok, /*Checkpoint memory prev*/ ) = _findPrevCp(uint64(block.number));
    if (!ok) return accTokenPerShare;

    uint256 active = _activeEffective();
    if (active == 0) return accTokenPerShare;

    if (block.number <= lastRewardBlock) return accTokenPerShare;

    uint256 deltaBlocks = block.number - lastRewardBlock;
    if (deltaBlocks == 0) return accTokenPerShare;

    // Ideal emission ignoring budget:
    uint256 toAlloc = rewardPerBlock * deltaBlocks;

    // Apply the same budget cap as _updatePool()
    uint256 undistributed = totalAccruedRewards > totalClaimedRewards ? (totalAccruedRewards - totalClaimedRewards) : 0;
    uint256 currentRewards = _rewardBalance();
    uint256 allocCap = currentRewards > undistributed ? (currentRewards - undistributed) : 0;
    if (toAlloc > allocCap) toAlloc = allocCap;
    if (toAlloc == 0) return accTokenPerShare;

    uint256 prec = PRECISION_FACTOR;
    while (toAlloc > 0 && prec > 0 && toAlloc > type(uint256).max / prec) { prec /= 10; }

    return accTokenPerShare + Math.mulDiv(toAlloc, prec, active);
  }

  function _findPrevCp(uint64 target) internal view returns (bool, Checkpoint memory) {
    uint16 idx = _cpHead;
    uint16 count = 0;
    Checkpoint memory best;
    bool ok = false;
    while (count < _cpSize) {
      Checkpoint memory cp = _checkpoints[idx];
      if (cp.blockNum != 0 && cp.blockNum <= target && (!ok || cp.blockNum > best.blockNum)) {
        best = cp; ok = true;
      }
      if (idx == 0) idx = MAX_CHECKPOINTS - 1; else idx--;
      count++;
    }
    return (ok, best);
  }

  function _findNextCp(uint64 afterBlock) internal view returns (bool, Checkpoint memory) {
    if (_cpSize == 0) return (false, Checkpoint(0,0,0));
    // walk forward oldest -> head
    uint16 count = 0;
    uint16 oldest = (_cpHead + MAX_CHECKPOINTS + 1 - _cpSize) % MAX_CHECKPOINTS;
    uint16 i = oldest;
    while (true) {
        Checkpoint memory cp = _checkpoints[i];
        if (cp.blockNum > afterBlock) return (true, cp);
        if (i == _cpHead) break;
        i = (i + 1) % MAX_CHECKPOINTS;
        count++;
        if (count >= _cpSize) break;
    }
    return (false, Checkpoint(0,0,0));
  }

  // Piece-wise integration across checkpoints up to targetBlock
  function _accPSAtBlock(uint64 targetBlock) internal view returns (uint256) {
    if (_cpSize == 0) return accTokenPerShare;

    (bool okPrev, Checkpoint memory prev) = _findPrevCp(targetBlock);
    if (!okPrev) return 0;

    uint256 acc = prev.acc;
    uint64 cursor = prev.blockNum;

    while (true) {
        (bool okNext, Checkpoint memory next_) = _findNextCp(cursor);
        uint64 end = okNext && next_.blockNum < targetBlock ? next_.blockNum : targetBlock;

        if (end > cursor && prev.rate > 0) {
            acc += uint256(end - cursor) * prev.rate;
        }
        if (!okNext || next_.blockNum >= targetBlock) break;

        prev = next_;
        cursor = prev.blockNum;
    }

    return acc;
  }

  function _pushCheckpoint(uint64 blockNum, uint256 acc, uint256 rate) internal {
    uint16 next = _cpHead + 1;
    if (next >= MAX_CHECKPOINTS) next = 0;
    _checkpoints[next] = Checkpoint({ blockNum: blockNum, acc: acc, rate: rate });
    _cpHead = next;
    if (_cpSize < MAX_CHECKPOINTS) _cpSize++;
  }

  // ---------------------------
  // Admin with Timelock
  // ---------------------------
  function scheduleRewardPerBlockChange(uint256 _newRate) external onlyOwner {
    bytes32 paramHash = keccak256("rewardPerBlock");
    pendingChanges[paramHash] = PendingChange({
      value: _newRate,
      executeAfter: block.timestamp + PARAM_CHANGE_DELAY
    });
    emit ParameterChangeScheduled(paramHash, _newRate, block.timestamp + PARAM_CHANGE_DELAY);
  }

  function executeRewardPerBlockChange() external onlyOwner {
    bytes32 paramHash = keccak256("rewardPerBlock");
    PendingChange memory change = pendingChanges[paramHash];
    require(change.executeAfter > 0, "No pending change");
    require(block.timestamp >= change.executeAfter, "Timelock not expired");
    _updatePool();
    rewardPerBlock = change.value;
    delete pendingChanges[paramHash];

    // push checkpoint on rate change
    uint256 newRate = totalActiveEffective == 0 ? 0 : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
    _pushCheckpoint(uint64(block.number), accTokenPerShare, newRate);

    emit NewRewardPerBlock(change.value);
    emit ParameterChangeExecuted(paramHash, change.value);
  }

  function cancelRewardPerBlockChange() external onlyOwner {
    bytes32 paramHash = keccak256("rewardPerBlock");
    delete pendingChanges[paramHash];
    emit ParameterChangeCancelled(paramHash);
  }

  function updatePeriods(uint256 _rewardDelayPeriod, uint256 _exitPeriod) external onlyOwner {
    _updatePool();
    require(_rewardDelayPeriod > 0 && _exitPeriod > 0, "Invalid periods");
    REWARD_DELAY_PERIOD = _rewardDelayPeriod;
    EXIT_PERIOD         = _exitPeriod;
    emit PeriodsUpdated(_rewardDelayPeriod, _exitPeriod);
  }

  function recoverWrongTokens(address _tokenAddress, uint256 _tokenAmount) external onlyOwner {
    require(_tokenAddress != address(0), "native not recoverable");
    (bool success, ) = _tokenAddress.call(
      abi.encodeWithSignature("transfer(address,uint256)", msg.sender, _tokenAmount)
    );
    require(success, "Token transfer failed");
    emit AdminTokenRecovery(_tokenAddress, _tokenAmount);
  }

  function updatePoolLimitPerUser(bool _hasUserLimit, uint256 _poolLimitPerUser) external onlyOwner {
    _updatePool();
    if (_hasUserLimit) {
      require(!hasUserLimit || _poolLimitPerUser > poolLimitPerUser, "Limit must increase");
      hasUserLimit = true;
      poolLimitPerUser = _poolLimitPerUser;
    } else {
      hasUserLimit = false;
      poolLimitPerUser = 0;
    }
    emit NewPoolLimit(poolLimitPerUser);
  }

  function emergencyRewardWithdraw(uint256 _amount) external onlyOwner {
    _updatePool(); // settle accTokenPerShare and accrued accounting
    uint256 rb = _rewardBalance();
    require(_amount <= rb, "Cannot withdraw principal");

    _safeTransferNative(msg.sender, _amount);
  }

  // Set rewardPerBlock based on target APY (basis points) over active principal.
  function setBaseAPY(uint256 _apyBps) external onlyOwner {
    _updatePool();
    require(_apyBps <= 1_000_000, "APY too high"); // <= 10,000% APR in bps

    uint256 activePrincipal = _activePrincipal();
    uint256 blocksPerYear   = 365 days / blockTime;

    if (activePrincipal == 0) {
        revert("No active principal - use setRewardPerBlock instead");
    }

    // rewardPerBlock = activePrincipal * apyBps / (blocksPerYear * 10000)
    rewardPerBlock = Math.mulDiv(activePrincipal, _apyBps, (blocksPerYear * 10000));

    uint256 newRate = totalActiveEffective == 0 ? 0
        : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
    _pushCheckpoint(uint64(block.number), accTokenPerShare, newRate);

    emit NewRewardPerBlock(rewardPerBlock);
  }

  function setRewardPerBlock(uint256 _rewardPerBlock) external onlyOwner {
    _updatePool();
    rewardPerBlock = _rewardPerBlock;

    uint256 newRate = totalActiveEffective == 0 ? 0
        : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
    _pushCheckpoint(uint64(block.number), accTokenPerShare, newRate);

    emit NewRewardPerBlock(_rewardPerBlock);
  }

  function updateBlockTime(uint256 _newBlockTime) external onlyOwner {
    require(_newBlockTime > 0 && _newBlockTime <= 60, "Bad blockTime");
    uint256 old = blockTime;
    blockTime = _newBlockTime;
    emit BlockTimeUpdated(old, _newBlockTime);
  }

  // ---------------------------
  // Misc
  // ---------------------------
  function updatePool() external { _updatePool(); }

  receive() external payable {
    if (msg.value > 0) {
      emit RewardsFunded(msg.value);
    }
  }
  fallback() external payable {
    if (msg.value > 0) {
      emit RewardsFunded(msg.value);
    }
  }
}