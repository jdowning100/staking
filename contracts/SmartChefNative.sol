// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * Sliding-window vesting via accTokenPerShare checkpoints.
 * - Users have a "baseline" per-share (debtClaimablePS). What’s claimable now is
 *   E * (accPS_at(block - delay) - baseline). No writes are needed to *view* it.
 * - We keep a small ring of checkpoints and INTERPOLATE between them for smooth vesting.
 * - Early exits are DISALLOWED. Unlocked exits move stake into an exit queue; rewards
 *   already streamed but inside the delay window keep vesting "virtually" and are captured
 *   at request time into (delayedReward, delayedUnlockBlock) so users can still claim them
 *   after they unlock, even though their stake stopped earning further.
 */
contract SmartChefNative is Ownable, ReentrancyGuard {
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
  uint256  public PRECISION_FACTOR; // 1e12+ scale for per-share math (here 1e12)

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
  struct Checkpoint { uint64 blockNum; uint256 acc; }
  uint16 internal constant MAX_CHECKPOINTS = 256;
  mapping(uint16 => Checkpoint) internal _checkpoints;
  uint16 internal _cpHead;        // last written index
  uint16 internal _cpSize;        // number of valid checkpoints
  uint64 public  checkpointInterval = 6; // ~30s at 5s/block
  uint64 internal lastCheckpointBlock;

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

    // Native has 18 decimals; target 30-decimal internal precision
    PRECISION_FACTOR = 10 ** (30 - 18);

    rewardPerBlock  = _rewardPerBlock;
    startBlock      = _startBlock > block.number ? _startBlock : block.number;
    lastRewardBlock = startBlock;

    lastCheckpointBlock = uint64(block.number);
    _pushCheckpoint(uint64(block.number), 0); // initial
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

  // ---------------------------
  // Core staking
  // ---------------------------
  function deposit(uint256 _duration) external payable nonReentrant {
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
      _claimRewardsInternal(msg.sender); // pay any matured pipeline + move baseline
      require(_duration == user.lockDuration, "Duration mismatch");
    } else {
      user.lockDuration = _duration;
      // set baseline to delayed frontier now
      uint256 delayBlocks = REWARD_DELAY_PERIOD / blockTime;
      uint256 tBlock = block.number > delayBlocks ? block.number - delayBlocks : 0;
      user.debtClaimablePS = _accPSAtBlock(uint64(tBlock));
    }

    uint256 mult = _getBoostMultiplier(_duration);
    uint256 addEff = (_amount * mult) / 1e18;

    user.effectiveAmount += addEff;
    totalActiveEffective += addEff;

    user.amount += _amount;
    totalStaked += _amount;

    user.lockStartBlock     = block.number;
    user.lockDurationBlocks = _duration / blockTime;

    user.rewardDebt = (user.effectiveAmount * accTokenPerShare) / PRECISION_FACTOR;
    emit Deposit(msg.sender, _amount, _duration);
  }

  // Only allow withdrawal request when unlocked (NO EARLY EXITS)
  function requestWithdraw(uint256 _amount) external nonReentrant {
    UserInfo storage user = userInfo[msg.sender];
    require(_amount > 0 && user.amount >= _amount, "Bad amount");
    require(user.lockStartBlock > 0, "No stake");
    require(user.withdrawRequestBlock == 0, "Already requested");
    require(block.number >= user.lockStartBlock + user.lockDurationBlocks, "Stake locked");

    _updatePool();

    // Claim matured pipeline up to now BEFORE removing effective from denominator
    _claimRewardsInternal(msg.sender);

    // Snapshot the delayed portion for the exiting amount so it can still mature and be claimed later.
    uint256 exitEffective = (_amount * _getBoostMultiplier(user.lockDuration)) / 1e18;

    uint256 delayBlocks = REWARD_DELAY_PERIOD / blockTime;
    uint256 tBlock = block.number > delayBlocks ? block.number - delayBlocks : 0;
    uint256 accPast = _accPSAtBlock(uint64(tBlock));
    uint256 deltaPS = accTokenPerShare - accPast;
    if (deltaPS > 0) {
      uint256 exitLocked = (exitEffective * deltaPS) / PRECISION_FACTOR;
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

    user.rewardDebt = (user.effectiveAmount * accTokenPerShare) / PRECISION_FACTOR;

    uint256 availableTime = block.timestamp + EXIT_PERIOD;
    emit WithdrawRequested(msg.sender, _amount, availableTime);
  }

  function executeWithdraw() external nonReentrant {
    _updatePool();
    // Auto-claim any matured rewards (unlocked snapshot and sliding-window portion)
    // so users receive vested rewards alongside principal withdrawal.
    _claimRewardsInternal(msg.sender);
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
    } else {
      user.rewardDebt = (user.effectiveAmount * accTokenPerShare) / PRECISION_FACTOR;
    }

    _safeTransferNative(msg.sender, amt);
    emit WithdrawExecuted(msg.sender, amt);
  }

  function cancelWithdraw() external {
    UserInfo storage user = userInfo[msg.sender];
    require(user.withdrawRequestBlock > 0, "No request");

    _updatePool();

    // Claim matured before restoring effective
    _claimRewardsInternal(msg.sender);

    uint256 addEff = (user.withdrawalAmount * _getBoostMultiplier(user.lockDuration)) / 1e18;
    user.effectiveAmount += addEff;
    totalActiveEffective += addEff;

    totalInExitPeriod       -= user.withdrawalAmount;
    user.withdrawRequestBlock = 0;
    user.withdrawalAmount     = 0;

    user.rewardDebt = (user.effectiveAmount * accTokenPerShare) / PRECISION_FACTOR;
  }

  // ---------------------------
  // Rewards
  // ---------------------------
  function claimRewards() external nonReentrant {
    _claimRewardsInternal(msg.sender);
  }

  function _claimRewardsInternal(address _user) internal {
    UserInfo storage user = userInfo[_user];

    // Compute VESTED frontier: accPS at (block - delay)
    uint256 delayBlocks = REWARD_DELAY_PERIOD / blockTime;
    uint256 tBlock = block.number > delayBlocks ? block.number - delayBlocks : 0;
    uint256 accPast = _accPSAtBlock(uint64(tBlock));

    // Virtual owed since last claim baseline
    uint256 baseline = user.debtClaimablePS;
    uint256 virtualOwed = 0;
    if (accPast > baseline && user.effectiveAmount > 0) {
      virtualOwed = (user.effectiveAmount * (accPast - baseline)) / PRECISION_FACTOR;
    }

    _updatePool();

    uint256 owed = virtualOwed;

    // Add snapshot from exiting portion if unlocked now
    if (user.delayedUnlockBlock > 0 && block.number >= user.delayedUnlockBlock) {
      owed += user.delayedReward;
      user.delayedReward = 0;
      user.delayedUnlockBlock = 0;
    }

    uint256 budget = _rewardBalance();
    uint256 pay = owed <= budget ? owed : budget;

    if (pay > 0) {
      _safeTransferNative(_user, pay);
      totalClaimedRewards += pay;
      emit RewardClaimed(_user, pay);
    }

    // Advance claim baseline proportionally if underpaid
    if (owed > 0) {
      uint256 paidRatio = (pay * PRECISION_FACTOR) / owed;
      uint256 delta = accPast - baseline;
      uint256 advance = (paidRatio * delta) / PRECISION_FACTOR;
      user.debtClaimablePS = baseline + advance;
    } else {
      user.debtClaimablePS = accPast;
    }

    // Keep rewardDebt synced for pending view
    user.rewardDebt = (user.effectiveAmount * accTokenPerShare) / PRECISION_FACTOR;
  }

  // ---------------------------
  // Views
  // ---------------------------
  function pendingReward(address _user) public view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    if (user.withdrawRequestBlock != 0) return 0;

    uint256 active = _activeEffective();
    if (active == 0) return 0;

    uint256 adjusted = accTokenPerShare;
    if (block.number > lastRewardBlock) {
      uint256 mult = block.number - lastRewardBlock;
      uint256 toAlloc = mult * rewardPerBlock;

      uint256 undistributed = totalAccruedRewards - totalClaimedRewards;
      uint256 currentRewards = _rewardBalance();
      uint256 allocCap = currentRewards > undistributed ? (currentRewards - undistributed) : 0;
      if (toAlloc > allocCap) toAlloc = allocCap;

      if (toAlloc > 0) {
        adjusted += (toAlloc * PRECISION_FACTOR) / active;
      }
    }

    return ((user.effectiveAmount * adjusted) / PRECISION_FACTOR) - user.rewardDebt;
  }

  // Pure read-only: what's claimable now from the sliding window + unlocked delayed snapshot
  function claimableView(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    uint256 owed = 0;

    // unlocked snapshot from exiting portion
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
      owed += (E * (accPast - baseline)) / PRECISION_FACTOR;
    }
    return owed;
  }

  // How much has streamed but is still locked (inside the delay window) + locked snapshot
  function lockedView(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    uint256 locked = 0;

    // locked snapshot from exiting portion
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
    uint256 base = (annualRewards * 10000) / activePrincipal; // basis points
    return (base * mult) / 1e18;
  }

  function getBaseAPY() public view returns (uint256) {
    uint256 activePrincipal = _activePrincipal();
    if (activePrincipal == 0) return 0;
    uint256 blocksPerYear = 365 days / blockTime;
    uint256 annualRewards = rewardPerBlock * blocksPerYear;
    return (annualRewards * 10000) / activePrincipal;
  }

  // ---------------------------
  // Reward accounting + checkpoints
  // ---------------------------
  function _updatePool() internal {
    if (block.number <= lastRewardBlock) return;

    uint256 active = _activeEffective();
    if (active == 0) { lastRewardBlock = block.number; return; }

    uint256 mult = block.number - lastRewardBlock;
    uint256 toAlloc = mult * rewardPerBlock;

    uint256 undistributed = totalAccruedRewards - totalClaimedRewards;
    uint256 currentRewards = _rewardBalance();
    uint256 allocCap = currentRewards > undistributed ? (currentRewards - undistributed) : 0;
    if (toAlloc > allocCap) toAlloc = allocCap;

    if (toAlloc > 0) {
      accTokenPerShare += (toAlloc * PRECISION_FACTOR) / active;
      totalAccruedRewards += toAlloc;
    }
    lastRewardBlock = block.number;

    // periodic checkpoint
    if (uint64(block.number) - lastCheckpointBlock >= checkpointInterval) {
      _pushCheckpoint(uint64(block.number), accTokenPerShare);
      lastCheckpointBlock = uint64(block.number);
    }
  }

  function _accPSNowView() internal view returns (uint256) {
    uint256 active = _activeEffective();
    if (active == 0) return accTokenPerShare;
    if (block.number <= lastRewardBlock) return accTokenPerShare;

    uint256 mult = block.number - lastRewardBlock;
    if (mult == 0) return accTokenPerShare;

    uint256 toAlloc = mult * rewardPerBlock;
    uint256 undistributed = totalAccruedRewards - totalClaimedRewards;
    uint256 currentRewards = _rewardBalance();
    uint256 allocCap = currentRewards > undistributed ? (currentRewards - undistributed) : 0;
    if (toAlloc > allocCap) toAlloc = allocCap;
    if (toAlloc == 0) return accTokenPerShare;

    return accTokenPerShare + (toAlloc * PRECISION_FACTOR) / active;
  }

  // Interpolated accPS at a past block (for sliding-window vesting)
  function _accPSAtBlock(uint64 targetBlock) internal view returns (uint256) {
    if (_cpSize == 0) return 0;

    // Find bracketing checkpoints: prev <= target < next
    (bool hasPrev, Checkpoint memory prev) = _findPrevCp(targetBlock);
    (bool hasNext, Checkpoint memory next_) = _findNextCp(prev.blockNum);

    if (!hasPrev) return 0;
    if (!hasNext || targetBlock >= next_.blockNum) {
      // no next (or target beyond next) → just prev
      // If target > lastRewardBlock we also need to pro-rate dormant batch
      if (targetBlock > lastRewardBlock) {
        // prorate since lastRewardBlock
        uint256 active = _activeEffective();
        if (active == 0) return prev.acc;
        uint256 fullDelta = uint256(block.number) - lastRewardBlock;
        if (fullDelta == 0) return prev.acc;

        uint256 blockToTarget = uint256(targetBlock) - lastRewardBlock;
        if (blockToTarget > fullDelta) blockToTarget = fullDelta;

        uint256 undistributed = totalAccruedRewards - totalClaimedRewards;
        uint256 currentRewards = _rewardBalance();
        uint256 allocCap = currentRewards > undistributed ? (currentRewards - undistributed) : 0;

        uint256 fullToAlloc = rewardPerBlock * fullDelta;
        if (fullToAlloc > allocCap) fullToAlloc = allocCap;

        uint256 prorata = (fullToAlloc * blockToTarget) / fullDelta;
        return prev.acc + (prorata * PRECISION_FACTOR) / active;
      }
      return prev.acc;
    }

    // interpolate between prev and next
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
    // Scan forward from oldest to newest to find the next > prevBlock
    uint16 count = 0;
    // First, find oldest index
    uint16 oldest = _cpHead + MAX_CHECKPOINTS + 1 - _cpSize;
    oldest %= MAX_CHECKPOINTS;
    // Walk forward oldest → head
    uint16 i = oldest;
    while (count < _cpSize) {
      Checkpoint memory cp = _checkpoints[i];
      if (cp.blockNum > prevBlock) return (true, cp);
      if (i == _cpHead) break;
      i = (i + 1) % MAX_CHECKPOINTS;
      count++;
    }
    return (false, Checkpoint({blockNum:0, acc:0}));
  }

  function _pushCheckpoint(uint64 blockNum, uint256 acc) internal {
    uint16 next = _cpHead + 1;
    if (next >= MAX_CHECKPOINTS) next = 0;
    _checkpoints[next] = Checkpoint({ blockNum: blockNum, acc: acc });
    _cpHead = next;
    if (_cpSize < MAX_CHECKPOINTS) _cpSize++;
  }

  // ---------------------------
  // Admin
  // ---------------------------
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

  function fundRewards() external payable onlyOwner {
    require(msg.value > 0, "No value");
    emit RewardsFunded(msg.value);
  }

  function emergencyRewardWithdraw(uint256 _amount) external onlyOwner {
    _updatePool();
    uint256 rb = _rewardBalance();
    require(_amount <= rb, "Cannot withdraw principal");
    _safeTransferNative(msg.sender, _amount);
  }

  function setBaseAPY(uint256 _apyBps) external onlyOwner {
    _updatePool();
    require(_apyBps <= 1000000, "APY too high"); // up to 10000%
    uint256 activePrincipal = _activePrincipal();
    uint256 blocksPerYear   = 365 days / blockTime;
    if (activePrincipal > 0) {
      rewardPerBlock = (activePrincipal * _apyBps) / (blocksPerYear * 10000);
    } else {
      rewardPerBlock = (1e18 * _apyBps) / (blocksPerYear * 10000);
    }
    emit NewRewardPerBlock(rewardPerBlock);
  }

  function setRewardPerBlock(uint256 _rewardPerBlock) external onlyOwner {
    _updatePool();
    rewardPerBlock = _rewardPerBlock;
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

  function _safeTransferNative(address _to, uint256 _amount) internal {
    (bool success, ) = _to.call{ value: _amount }("");
    require(success, "Native transfer failed");
  }

  receive() external payable {}
  fallback() external payable {}
}
