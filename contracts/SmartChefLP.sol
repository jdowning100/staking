// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * SmartChefLP — Sliding-window vesting (no per-user queues) + lock boosts.
 *
 * - Rewards stream into accTokenPerShare each block (capped by available rewards).
 * - Claimable now = E * (accPS_at(block - delayBlocks) - user.debtClaimablePS) / PRECISION.
 * - Compact ring of accTokenPerShare checkpoints + interpolation for smooth reads.
 * - Boosts: 1.0x for 10 minutes; 1.5x for 20 minutes (you can later set 30d/90d).
 * - NO EARLY EXIT: withdraw can be requested only after the user’s chosen lock duration ends.
 * - On unlocked withdraw request, the exiting slice’s still-delayed amount is snapshotted
 *   as (delayedReward, delayedUnlockBlock) and unlocks later; the stake stops earning.
 * - On cancelWithdraw, that snapshot is **voided** to prevent double counting.
 * - Rewards are paid in native token (e.g., ETH).
 */
contract SmartChefLP is Ownable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  // ---------------------------
  // User data
  // ---------------------------
  struct UserInfo {
    uint256 amount;               // LP principal currently earning (excludes amount moved to exit)
    uint256 effectiveAmount;      // amount * boost / 1e18
    uint256 rewardDebt;           // for pendingReward() view
    uint256 debtClaimablePS;      // baseline for sliding-window claimable

    uint256 lockStartTime;        // timestamp when current lock began
    uint256 lockDuration;         // chosen lock duration in seconds (e.g., 10m or 20m now; 30d/90d later)

    // Exit flow
    uint256 withdrawRequestTime;  // timestamp when exit requested (0 if none)
    uint256 withdrawalAmount;     // principal requested to withdraw (LP)

    // Snapshot of still-delayed rewards for exiting slice
    uint256 delayedReward;        // fixed sum unlocking at delayedUnlockBlock
    uint256 delayedUnlockBlock;   // block when delayedReward becomes claimable
  }

  struct Checkpoint { uint64 blockNum; uint256 acc; uint256 activeEffective; }

  // ---------------------------
  // Config
  // ---------------------------

  // Global periods (seconds)
  uint256 public REWARD_DELAY_PERIOD = 30 days;
  uint256 public EXIT_PERIOD         = 30 days;

  IERC20  public lpToken;

  // Streaming rate and timeline
  uint256 public rewardPerBlock;
  uint256 public startBlock;
  uint256 public lastRewardBlock;

  // Accounting
  bool    public hasUserLimit;
  uint256 public poolLimitPerUser;
  uint256 public PRECISION_FACTOR = 10 ** 12; // Assume 18 decimals for native → 30 - 18 = 12
  uint256 public accTokenPerShare;        // accumulated rewards per effective share
  uint256 public totalStaked;             // total LP principal (includes exit)
  uint256 public totalActiveEffective;    // sum of effective amounts currently earning
  uint256 public totalInExitPeriod;       // principal requested for withdraw (not earning)
  uint256 public totalAccruedRewards;     // streamed into accPS (tokens)
  uint256 public totalClaimedRewards;     // paid out (tokens)

  // Block time (seconds) to translate REWARD_DELAY_PERIOD into blocks for the sliding window
  uint256 public blockTime = 5;

  // Timelock for parameter changes (24 hours)
  uint256 public constant PARAM_CHANGE_DELAY = 24 hours;
  
  struct PendingChange {
    uint256 value;
    uint256 executeAfter;
  }
  
  mapping(bytes32 => PendingChange) public pendingChanges;

  mapping(address => UserInfo) public userInfo;

  // ---------------------------
  // Checkpoints (ring buffer)
  // ---------------------------
  uint16 internal constant MAX_CHECKPOINTS = 256;
  mapping(uint16 => Checkpoint) internal _checkpoints;
  uint16 internal _cpHead;                 // last written index
  uint16 internal _cpSize;                 // number of valid checkpoints
  uint64 public  checkpointInterval = 60;   // ~5 minutes at 5s/block
  uint64 internal lastCheckpointBlock;

  // ---------------------------
  // Events
  // ---------------------------
  event Deposit(address indexed user, uint256 amount, uint256 duration);
  event WithdrawRequested(address indexed user, uint256 amount, uint256 availableTime);
  event WithdrawExecuted(address indexed user, uint256 amount);
  event RewardClaimed(address indexed user, uint256 amount);
  event NewRewardPerBlock(uint256 rewardPerBlock);
  event NewPoolLimit(uint256 poolLimitPerUser);
  event AdminTokenRecovery(address tokenRecovered, uint256 amount);
  event RewardsFunded(uint256 amount);
  event BlockTimeUpdated(uint256 oldBlockTime, uint256 newBlockTime);
  event PeriodsUpdated(uint256 rewardDelayPeriod, uint256 exitPeriod);
  event ParameterChangeScheduled(bytes32 indexed paramHash, uint256 value, uint256 executeAfter);
  event ParameterChangeExecuted(bytes32 indexed paramHash, uint256 value);
  event ParameterChangeCancelled(bytes32 indexed paramHash);

  // ---------------------------
  // Constructor
  // ---------------------------

  constructor(
    IERC20 _lpToken,
    uint256 _rewardPerBlock,
    uint256 _startBlock,
    uint256 _poolLimitPerUser,
    uint256 _rewardDelayPeriod,
    uint256 _exitPeriod
  ) Ownable(msg.sender) {
    lpToken = _lpToken;

    rewardPerBlock  = _rewardPerBlock;
    startBlock      = _startBlock > block.number ? _startBlock : block.number;
    lastRewardBlock = startBlock;

    if (_poolLimitPerUser > 0) {
      hasUserLimit = true;
      poolLimitPerUser = _poolLimitPerUser;
    }

    REWARD_DELAY_PERIOD = _rewardDelayPeriod;
    EXIT_PERIOD         = _exitPeriod;

    // Initial checkpoint
    lastCheckpointBlock = uint64(block.number);
    _pushCheckpoint(uint64(block.number), 0, 0);
  }

  // ---------------------------
  // Internals: helpers
  // ---------------------------

  // Allowed boosts: 10 minutes → 1.0x, 20 minutes → 1.5x (you can change to 30d/90d later)
  function _getBoostMultiplier(uint256 _duration) internal pure returns (uint256) {
    if (_duration == 10 minutes) return 1e18;                // 1.0x
    if (_duration == 20 minutes) return 1500000000000000000; // 1.5x
    revert("Invalid duration");
  }

  function _rewardBalance() internal view returns (uint256) {
    return address(this).balance;
  }

  function _safeTransferNative(address _to, uint256 _amount) internal {
    (bool success, ) = _to.call{ value: _amount }("");
    require(success, "Native transfer failed");
  }

  // ---------------------------
  // Core staking
  // ---------------------------

  /**
   * Deposit LP with a chosen lock duration (must be one of the allowed durations).
   * If already staked, duration must match the existing one.
   */
  function deposit(uint256 _amount, uint256 _duration) external nonReentrant {
    UserInfo storage user = userInfo[msg.sender];
    require(_amount > 0, "Zero deposit");
    require(user.withdrawRequestTime == 0, "In exit period");

    // Validate/keep duration consistent
    uint256 mult = _getBoostMultiplier(_duration);
    if (user.amount > 0) {
      require(_duration == user.lockDuration, "Duration mismatch");
    }

    if (hasUserLimit) {
      require(_amount + user.amount <= poolLimitPerUser, "Above limit");
    }

    _updatePool();

    if (user.amount > 0) {
      // Pay matured pipeline for current effective before changing it
      _claimRewardsInternal(msg.sender, 0);
    } else {
      // First deposit: set claimable baseline to current accTokenPerShare
      user.debtClaimablePS = accTokenPerShare;
      user.lockDuration = _duration;
    }

    // Update principal and effective
    user.amount += _amount;
    totalStaked += _amount;

    uint256 addEff = (_amount * mult) / 1e18;
    user.effectiveAmount += addEff;
    totalActiveEffective += addEff;

    // Reset lock start
    user.lockStartTime = block.timestamp;

    // Update debt for pending view
    user.rewardDebt = (user.effectiveAmount * accTokenPerShare) / PRECISION_FACTOR;

    lpToken.safeTransferFrom(msg.sender, address(this), _amount);
    emit Deposit(msg.sender, _amount, _duration);
  }

  /**
   * Request withdrawal — only after lock has ended. Removes the exiting slice from the
   * effective denominator immediately, and snapshots its still-delayed pipeline.
   */
  function requestWithdraw(uint256 _amount) external nonReentrant {
    UserInfo storage user = userInfo[msg.sender];
    require(_amount > 0 && user.amount >= _amount, "Bad amount");
    require(user.lockStartTime > 0, "No active stake");
    require(user.withdrawRequestTime == 0, "Already requested");
    require(block.timestamp >= user.lockStartTime + user.lockDuration, "Stake locked"); // NO EARLY EXIT

    _updatePool();

    // Settle matured for current active slice
    _claimRewardsInternal(msg.sender, 0);

    // Snapshot the still-delayed portion for the exiting amount (note: voided if cancelWithdraw)
    uint256 delayBlocks = REWARD_DELAY_PERIOD / blockTime;
    uint256 tBlock = block.number > delayBlocks ? block.number - delayBlocks : 0;
    uint256 accPast = _accPSAtBlock(uint64(tBlock));
    uint256 deltaPS = accTokenPerShare - accPast;
    if (deltaPS > 0) {
      uint256 exitEff = (_amount * _getBoostMultiplier(user.lockDuration)) / 1e18;
      uint256 exitLocked = (exitEff * deltaPS) / PRECISION_FACTOR;
      user.delayedReward += exitLocked;
      user.delayedUnlockBlock = block.number + delayBlocks;
    }

    // Remove from effective denominator now
    uint256 exitEffective = (_amount * _getBoostMultiplier(user.lockDuration)) / 1e18;
    user.effectiveAmount -= exitEffective;
    totalActiveEffective -= exitEffective;

    // Book the principal as "in exit"; leave user.amount as-is until execute (principal safety)
    user.withdrawRequestTime = block.timestamp;
    user.withdrawalAmount    = _amount;
    totalInExitPeriod       += _amount;

    // Sync rewardDebt for remaining active effective
    user.rewardDebt = (user.effectiveAmount * accTokenPerShare) / PRECISION_FACTOR;

    uint256 availableTime = block.timestamp + EXIT_PERIOD;
    emit WithdrawRequested(msg.sender, _amount, availableTime);
  }

  /**
   * Execute withdrawal after exit period — transfers principal and clears the exit entry.
   */
  function executeWithdraw() external nonReentrant {
    // Auto-claim any matured rewards (unlocked snapshot and sliding-window portion)
    // so users receive vested rewards alongside principal withdrawal.
    _claimRewardsInternal(msg.sender, 0);
    UserInfo storage user = userInfo[msg.sender];
    require(user.withdrawRequestTime > 0, "No withdrawal requested");
    require(block.timestamp >= user.withdrawRequestTime + EXIT_PERIOD, "Exit not finished");

    uint256 amt = user.withdrawalAmount;
    require(amt > 0, "No amount");

    // Effects: principal leaves
    totalInExitPeriod -= amt;
    totalStaked       -= amt;

    // Reset request
    user.withdrawRequestTime = 0;
    user.withdrawalAmount    = 0;

    // If user has exactly this principal left, zero principal; otherwise reduce
    if (user.amount == amt) {
      user.amount = 0;
      user.lockStartTime = 0;
      user.lockDuration  = 0;
      user.debtClaimablePS = 0;
    } else {
      user.amount -= amt;
    }

    // rewardDebt already based on effective (which was reduced at request time)
    user.rewardDebt = (user.effectiveAmount * accTokenPerShare) / PRECISION_FACTOR;

    lpToken.safeTransfer(msg.sender, amt);
    emit WithdrawExecuted(msg.sender, amt);
  }

  /**
   * Cancel withdrawal request — returns principal to active, restores effective,
   * and **voids the exit snapshot** to prevent double counting.
   */
  function cancelWithdraw() external nonReentrant {
    UserInfo storage user = userInfo[msg.sender];
    require(user.withdrawRequestTime > 0, "No withdrawal requested");

    _updatePool();

    // Settle matured on current active slice
    _claimRewardsInternal(msg.sender, 0);

    // Restore effective for the canceled amount
    uint256 addEff = (user.withdrawalAmount * _getBoostMultiplier(user.lockDuration)) / 1e18;
    user.effectiveAmount += addEff;
    totalActiveEffective += addEff;

    totalInExitPeriod       -= user.withdrawalAmount;
    user.withdrawRequestTime = 0;
    user.withdrawalAmount    = 0;

    user.delayedReward      = 0;
    user.delayedUnlockBlock = 0;

    user.rewardDebt = (user.effectiveAmount * accTokenPerShare) / PRECISION_FACTOR;
  }

  // ---------------------------
  // Rewards
  // ---------------------------

  function claimRewards() external nonReentrant {
    _claimRewardsInternal(msg.sender, 0);
  }

  function claimRewardsWithSlippage(uint256 minReward) external nonReentrant {
    _claimRewardsInternal(msg.sender, minReward);
  }

  function _claimRewardsInternal(address _user, uint256 minReward) internal {
    UserInfo storage user = userInfo[_user];

    // Sliding-window frontier at (block - delay)
    uint256 delayBlocks = REWARD_DELAY_PERIOD / blockTime;
    uint256 tBlock = block.number > delayBlocks ? block.number - delayBlocks : 0;
    uint256 accPast = _accPSAtBlock(uint64(tBlock));

    // Virtual owed since last baseline
    uint256 baseline = user.debtClaimablePS;
    uint256 virtualOwed = 0;
    if (accPast > baseline && user.effectiveAmount > 0) {
      virtualOwed = (user.effectiveAmount * (accPast - baseline)) / PRECISION_FACTOR;
    }

    _updatePool();

    uint256 owed = virtualOwed;

    // Add exiting snapshot if it has unlocked
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

    // Advance baseline proportionally if partially paid
    if (owed > 0) {
      if (pay >= owed) {
        user.debtClaimablePS = accPast;
      } else {
        uint256 delta = accPast - baseline;
        uint256 advance = (pay * delta) / owed;
        user.debtClaimablePS = baseline + advance;
      }
    } else {
      user.debtClaimablePS = accPast;
    }

    // Keep pending baseline in sync
    user.rewardDebt = (user.effectiveAmount * accTokenPerShare) / PRECISION_FACTOR;
  }

  // ---------------------------
  // Views
  // ---------------------------

  // Pending since last action (not yet past the sliding window).
  function pendingReward(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];

    uint256 activeEff = totalActiveEffective;
    if (activeEff == 0) return 0;

    uint256 adjusted = accTokenPerShare;
    if (block.number > lastRewardBlock) {
      uint256 mult = block.number - lastRewardBlock;
      uint256 toAlloc = mult * rewardPerBlock;

      uint256 undistributed  = totalAccruedRewards - totalClaimedRewards;
      uint256 currentRewards = _rewardBalance();
      uint256 allocCap       = currentRewards > undistributed ? (currentRewards - undistributed) : 0;
      if (toAlloc > allocCap) toAlloc = allocCap;

      if (toAlloc > 0) {
        adjusted += (toAlloc * PRECISION_FACTOR) / activeEff;
      }
    }

    return ((user.effectiveAmount * adjusted) / PRECISION_FACTOR) - user.rewardDebt;
  }

  // Pure read-only: what’s claimable now from the sliding window + unlocked exit snapshot
  function claimableView(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    uint256 owed = 0;

    if (user.delayedUnlockBlock > 0 && block.number >= user.delayedUnlockBlock) {
      owed += user.delayedReward;
    }

    uint256 E = user.effectiveAmount;
    if (E == 0) return owed;

    uint256 delayBlocks = REWARD_DELAY_PERIOD / blockTime;
    uint256 tBlock = block.number > delayBlocks ? block.number - delayBlocks : 0;
    uint256 accPast = _accPSAtBlock(uint64(tBlock));
    uint256 baseline = user.debtClaimablePS;
    if (accPast > baseline) {
      owed += (E * (accPast - baseline)) / PRECISION_FACTOR;
    }
    return owed;
  }

  // How much has streamed but is still locked (inside the delay) + locked exit snapshot
  function lockedView(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    uint256 locked = 0;

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
      locked += (E * (accNow - accPast)) / PRECISION_FACTOR;
    }
    return locked;
  }

  function isInExitPeriod(address _user) external view returns (bool) {
    return userInfo[_user].withdrawRequestTime > 0;
  }

  function getUserInfo(address _user)
    external
    view
    returns (
      uint256 stakedAmount,
      uint256 effectiveAmount,
      uint256 lockStartTime,
      uint256 lockDuration,
      uint256 withdrawRequestTime,
      uint256 withdrawalAmount,
      uint256 withdrawalAvailableTime,
      bool inExitPeriod,
      bool canRequestWithdraw,
      bool canExecuteWithdraw
    )
  {
    UserInfo storage user = userInfo[_user];
    stakedAmount        = user.amount;
    effectiveAmount     = user.effectiveAmount;
    lockStartTime       = user.lockStartTime;
    lockDuration        = user.lockDuration;
    withdrawRequestTime = user.withdrawRequestTime;
    withdrawalAmount    = user.withdrawalAmount;

    bool unlocked = (lockStartTime > 0 && block.timestamp >= lockStartTime + lockDuration);
    canRequestWithdraw = unlocked && (withdrawRequestTime == 0);

    if (withdrawRequestTime > 0) {
      inExitPeriod = true;
      withdrawalAvailableTime = withdrawRequestTime + EXIT_PERIOD;
      canExecuteWithdraw      = block.timestamp >= withdrawalAvailableTime;
    }
  }

  function timeUntilUnlock(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    if (user.lockStartTime == 0) return 0;
    uint256 end = user.lockStartTime + user.lockDuration;
    if (block.timestamp >= end) return 0;
    return end - block.timestamp;
  }

  function timeUntilWithdrawalAvailable(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    if (user.withdrawRequestTime == 0) return 0;
    uint256 available = user.withdrawRequestTime + EXIT_PERIOD;
    if (block.timestamp >= available) return 0;
    return available - block.timestamp;
  }

  // ---------------------------
  // Reward accounting + checkpoints
  // ---------------------------

  function _updatePool() internal {
    if (block.number <= lastRewardBlock) return;

    uint256 activeEff = totalActiveEffective;
    if (activeEff == 0) { lastRewardBlock = block.number; return; }

    uint256 mult = block.number - lastRewardBlock;
    uint256 toAlloc = mult * rewardPerBlock;

    // Cap by available rewards to avoid over-accrual
    uint256 undistributed  = totalAccruedRewards - totalClaimedRewards;
    uint256 currentRewards = _rewardBalance();
    uint256 allocCap       = currentRewards > undistributed ? (currentRewards - undistributed) : 0;
    if (toAlloc > allocCap) toAlloc = allocCap;

    if (toAlloc > 0) {
      accTokenPerShare += (toAlloc * PRECISION_FACTOR) / activeEff;
      totalAccruedRewards += toAlloc;
    }
    lastRewardBlock = block.number;

    // Periodic checkpoint
    if (uint64(block.number) - lastCheckpointBlock >= checkpointInterval) {
      _pushCheckpoint(uint64(block.number), accTokenPerShare, totalActiveEffective);
      lastCheckpointBlock = uint64(block.number);
    }
  }

  function _accPSNowView() internal view returns (uint256) {
    uint256 activeEff = totalActiveEffective;
    if (activeEff == 0) return accTokenPerShare;
    if (block.number <= lastRewardBlock) return accTokenPerShare;

    uint256 mult = block.number - lastRewardBlock;
    if (mult == 0) return accTokenPerShare;

    uint256 toAlloc = mult * rewardPerBlock;
    uint256 undistributed  = totalAccruedRewards - totalClaimedRewards;
    uint256 currentRewards = _rewardBalance();
    uint256 allocCap       = currentRewards > undistributed ? (currentRewards - undistributed) : 0;
    if (toAlloc > allocCap) toAlloc = allocCap;
    if (toAlloc == 0) return accTokenPerShare;

    return accTokenPerShare + (toAlloc * PRECISION_FACTOR) / activeEff;
  }

  // Interpolated accPS at a past block (sliding-window)
  function _accPSAtBlock(uint64 targetBlock) internal view returns (uint256) {
    if (_cpSize == 0) return 0;

    (bool hasPrev, Checkpoint memory prev) = _findPrevCp(targetBlock);
    (bool hasNext, Checkpoint memory next_) = _findNextCp(prev.blockNum);

    if (!hasPrev) return 0;

    // Handle zero active
    if (prev.activeEffective == 0) return prev.acc;

    if (!hasNext || targetBlock >= next_.blockNum) {
      // No next: prorate from prev to target using current projected acc
      if (targetBlock > prev.blockNum) {
        uint256 currentAcc = _accPSNowView();
        uint256 prorataDeltaAcc = currentAcc - prev.acc;
        uint256 fullSpan = uint256(block.number) - prev.blockNum;
        if (fullSpan == 0) return prev.acc;

        uint256 prorataInto = uint256(targetBlock) - prev.blockNum;
        if (prorataInto > fullSpan) prorataInto = fullSpan;

        return prev.acc + (prorataDeltaAcc * prorataInto) / fullSpan;
      }
      return prev.acc;
    }

    // Linear interpolation between prev and next
    if (next_.blockNum == prev.blockNum) return prev.acc;
    uint256 span = next_.blockNum - prev.blockNum;
    uint256 into = targetBlock - prev.blockNum;
    uint256 deltaAcc = next_.acc - prev.acc;
    return prev.acc + (deltaAcc * into) / span;
  }

  function _findPrevCp(uint64 target) internal view returns (bool, Checkpoint memory) {
    uint16 idx = _cpHead;
    uint16 count = 0;
    Checkpoint memory best;
    bool ok = false;
    while (count < _cpSize) {
      Checkpoint memory cp = _checkpoints[idx];
      if (cp.blockNum != 0 && cp.blockNum <= target && (!ok || cp.blockNum >= best.blockNum)) {
        best = cp; ok = true;
      }
      if (idx == 0) idx = MAX_CHECKPOINTS - 1; else idx--;
      count++;
    }
    return (ok, best);
  }

  function _findNextCp(uint64 prevBlock) internal view returns (bool, Checkpoint memory) {
    // Calculate oldest index in the ring buffer
    uint16 count = 0;
    uint16 oldest;
    if (_cpSize >= _cpHead + 1) {
      oldest = (_cpHead + MAX_CHECKPOINTS + 1 - _cpSize) % MAX_CHECKPOINTS;
    } else {
      oldest = _cpHead + 1 - _cpSize;
    }
    
    // Walk forward oldest → head
    uint16 i = oldest;
    while (count < _cpSize) {
      Checkpoint memory cp = _checkpoints[i];
      if (cp.blockNum > prevBlock) return (true, cp);
      if (i == _cpHead) break;
      i = (i + 1) % MAX_CHECKPOINTS;
      count++;
    }
    return (false, Checkpoint({blockNum: 0, acc: 0, activeEffective: 0}));
  }

  function _pushCheckpoint(uint64 blockNum, uint256 acc, uint256 activeEff) internal {
    uint16 next = _cpHead + 1;
    if (next >= MAX_CHECKPOINTS) next = 0;
    _checkpoints[next] = Checkpoint({ blockNum: blockNum, acc: acc, activeEffective: activeEff });
    _cpHead = next;
    if (_cpSize < MAX_CHECKPOINTS) _cpSize++;
  }

  // ---------------------------
  // Admin
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
    
    emit NewRewardPerBlock(change.value);
    emit ParameterChangeExecuted(paramHash, change.value);
  }

  function cancelRewardPerBlockChange() external onlyOwner {
    bytes32 paramHash = keccak256("rewardPerBlock");
    delete pendingChanges[paramHash];
    emit ParameterChangeCancelled(paramHash);
  }

  function updatePeriods(uint256 _rewardDelayPeriod, uint256 _exitPeriod) external onlyOwner {
    require(_rewardDelayPeriod > 0 && _exitPeriod > 0, "Invalid periods");
    _updatePool();
    REWARD_DELAY_PERIOD = _rewardDelayPeriod;
    EXIT_PERIOD         = _exitPeriod;
    emit PeriodsUpdated(_rewardDelayPeriod, _exitPeriod);
  }

  function recoverWrongTokens(address _tokenAddress, uint256 _tokenAmount) external onlyOwner {
    require(_tokenAddress != address(lpToken), "Cannot recover LP");
    IERC20(_tokenAddress).safeTransfer(msg.sender, _tokenAmount);
    emit AdminTokenRecovery(_tokenAddress, _tokenAmount);
  }

  // APY helper: set rewardPerBlock from APY (bps) on active effective
  function updateRewardPerBlock(uint256 _newAPYBasisPoints) external onlyOwner {
    require(_newAPYBasisPoints <= 1000000, "APY too high"); // up to 10000%
    _updatePool();

    uint256 blocksPerYear = (365 days) / blockTime;
    uint256 activeEff     = totalActiveEffective;

    if (activeEff > 0) {
      rewardPerBlock = (activeEff * _newAPYBasisPoints) / (blocksPerYear * 10000);
    } else {
      revert("No active effective - use setRewardPerBlock instead");
    }

    emit NewRewardPerBlock(rewardPerBlock);
  }

  // Direct control
  function setRewardPerBlock(uint256 _rewardPerBlock) external onlyOwner {
    _updatePool();
    rewardPerBlock = _rewardPerBlock;
    emit NewRewardPerBlock(_rewardPerBlock);
  }

  function updateBlockTime(uint256 _newBlockTime) external onlyOwner {
    require(_newBlockTime > 0 && _newBlockTime <= 3600, "Invalid blockTime");
    uint256 old = blockTime;
    blockTime = _newBlockTime;
    emit BlockTimeUpdated(old, _newBlockTime);
  }

  function updatePoolLimitPerUser(bool _hasUserLimit, uint256 _poolLimitPerUser) external onlyOwner {
    if (_hasUserLimit) {
      require(!hasUserLimit || _poolLimitPerUser > poolLimitPerUser, "Must increase");
      hasUserLimit = true;
      poolLimitPerUser = _poolLimitPerUser;
    } else {
      hasUserLimit = false;
      poolLimitPerUser = 0;
    }
    emit NewPoolLimit(poolLimitPerUser);
  }

  // Fund rewards pool with native tokens
  function fundRewards() external payable onlyOwner {
    require(msg.value > 0, "Must send tokens");
    emit RewardsFunded(msg.value);
  }

  // Owner can withdraw excess reward tokens (doesn't affect LP principal)
  function emergencyRewardWithdraw(uint256 _amount) external onlyOwner {
    require(_rewardBalance() >= _amount, "Insufficient reward balance");
    _safeTransferNative(msg.sender, _amount);
  }

  function updateCheckpointInterval(uint64 _newInterval) external onlyOwner {
    require(_newInterval >= 6 && _newInterval <= 1000, "Invalid interval");
    checkpointInterval = _newInterval;
  }

  // ---------------------------
  // Misc
  // ---------------------------

  function updatePool() external { _updatePool(); }

  receive() external payable {}
  fallback() external payable {}
}
