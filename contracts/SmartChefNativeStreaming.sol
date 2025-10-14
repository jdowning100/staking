// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SmartChefNative is Ownable, ReentrancyGuard {
  // Info of each user
  struct UserInfo {
    uint256 amount; // Staked native tokens (principal)
    uint256 effectiveAmount; // Effective amount for rewards (amount * multiplier)
    uint256 rewardDebt; // Reward debt
    uint256 debtClaimablePS; // Baseline acc per share for claimable view
    uint256 lockStartTime; // When the lock period began
    uint256 lockDuration; // User's chosen lock duration (10 or 20 minutes)
    uint256 withdrawRequestTime; // When withdrawal was requested (0 if none)
    uint256 withdrawalAmount; // Amount requested for withdrawal
    uint256 delayedReward; // Delayed reward for exiting portion
    uint256 delayedUnlockTime; // Unlock time for delayed reward
  }

  // Configurable periods
  uint256 public REWARD_DELAY_PERIOD = 10 minutes;
  uint256 public EXIT_PERIOD = 10 minutes;

  // Emission rate (tokens per second) streamed to stakers
  uint256 public emissionRate; // QUAI per second

  // Whether a limit is set for users
  bool public hasUserLimit;
  // Accrued token per share
  uint256 public accTokenPerShare;
  // The pool limit (0 if none)
  uint256 public poolLimitPerUser;
  // Precision factor for reward calculations
  uint256 public PRECISION_FACTOR;
  // Total amount staked (includes amounts in exit) - principal
  uint256 public totalStaked;
  // Total active effective amount for reward distribution
  uint256 public totalActiveEffective;
  // Cumulative rewards accrued to accTokenPerShare (unscaled)
  uint256 public totalAccruedRewards;
  // Cumulative rewards claimed by users
  uint256 public totalClaimedRewards;
  // Last time the pool was updated
  uint256 public lastUpdateTimestamp;

  // Info of each user that stakes tokens
  mapping(address => UserInfo) public userInfo;

  // Total amount in exit period (requested withdrawals not yet executed) - principal
  uint256 public totalInExitPeriod;

  // ---------------------------
  // Virtual delayed via checkpoints (Option B)
  // ---------------------------
  struct Checkpoint { uint64 ts; uint256 acc; }
  uint16 internal constant MAX_CHECKPOINTS = 256;
  mapping(uint16 => Checkpoint) internal _checkpoints;
  uint16 internal _cpHead; // last written index
  uint16 internal _cpSize; // number of valid checkpoints
  uint64 public checkpointInterval = 30; // seconds
  uint64 internal lastCheckpointTs;

  event Deposit(address indexed user, uint256 amount, uint256 duration);
  event WithdrawRequested(address indexed user, uint256 amount, uint256 availableTime);
  event WithdrawExecuted(address indexed user, uint256 amount);
  event RewardClaimed(address indexed user, uint256 amount);
  event NewPoolLimit(uint256 poolLimitPerUser);
  event AdminTokenRecovery(address tokenRecovered, uint256 amount);
  event RewardsFunded(uint256 amount);
  event PeriodsUpdated(uint256 rewardDelayPeriod, uint256 exitPeriod);
  event EmissionRateUpdated(uint256 newRate);

  constructor(
    uint256 _poolLimitPerUser,
    uint256 _rewardDelayPeriod,
    uint256 _exitPeriod
  ) Ownable(msg.sender) {
    if (_poolLimitPerUser > 0) {
      hasUserLimit = true;
      poolLimitPerUser = _poolLimitPerUser;
    }
    // Set configurable periods
    REWARD_DELAY_PERIOD = _rewardDelayPeriod;
    EXIT_PERIOD = _exitPeriod;
    // Native token has 18 decimals
    PRECISION_FACTOR = 10 ** (30 - 18);
    lastUpdateTimestamp = block.timestamp;
    lastCheckpointTs = uint64(block.timestamp);
    // Initial checkpoint
    _pushCheckpoint(uint64(block.timestamp), 0);
  }

  // ---------------------------
  // Internal helpers
  // ---------------------------

  // Get boost multiplier based on duration (1x for 10min, 1.5x for 20min)
  function _getBoostMultiplier(uint256 _duration) internal pure returns (uint256) {
    if (_duration == 10 minutes) return 1e18;
    if (_duration == 20 minutes) return 1500000000000000000; // 1.5e18
    revert("Invalid duration");
  }

  // Only principal NOT in exit (for APY calculations)
  function _activePrincipal() internal view returns (uint256) {
    return totalStaked - totalInExitPeriod;
  }

  // Active effective for denominator in reward accrual
  function _activeEffective() internal view returns (uint256) {
    return totalActiveEffective;
  }

  // Reward balance = contract balance minus principal reserves (totalStaked)
  function _rewardBalance() internal view returns (uint256) {
    uint256 bal = address(this).balance;
    return bal > totalStaked ? bal - totalStaked : 0;
  }

  // ---------------------------
  // Core staking logic
  // ---------------------------

  // Deposit native tokens with chosen duration and delay rewards
  function deposit(uint256 _duration) external payable nonReentrant {
    require(_duration == 10 minutes || _duration == 20 minutes, "Invalid duration: must be 10 or 20 minutes");
    UserInfo storage user = userInfo[msg.sender];
    uint256 _amount = msg.value;
    require(_amount > 0, "Deposit amount must be greater than 0");
    require(user.withdrawRequestTime == 0, "Cannot deposit during exit period");

    if (hasUserLimit) {
      require(_amount + user.amount <= poolLimitPerUser, "User amount above limit");
    }

    _updatePool();

    // Claim any available rewards before adjusting effective amount
    if (user.amount > 0) {
      _claimRewards(msg.sender);
      require(_duration == user.lockDuration, "Duration must match existing lock");
    } else {
      user.lockDuration = _duration;
      // Initialize claimable baseline to avoid gifting historical rewards
      user.debtClaimablePS = _accPSAt(uint64(block.timestamp - REWARD_DELAY_PERIOD));
    }

    uint256 multiplier = _getBoostMultiplier(user.lockDuration);
    uint256 addEffective = (_amount * multiplier) / 1e18;
    user.effectiveAmount += addEffective;
    totalActiveEffective += addEffective;
    user.amount += _amount;
    totalStaked += _amount;
    user.lockStartTime = block.timestamp; // Reset lock on deposit/top-up

    user.rewardDebt = (user.effectiveAmount * accTokenPerShare) / PRECISION_FACTOR;
    emit Deposit(msg.sender, _amount, _duration);
  }

  // Request withdrawal - starts exit period (stake stops earning and moves out of denominator)
  function requestWithdraw(uint256 _amount) external nonReentrant {
    UserInfo storage user = userInfo[msg.sender];
    require(user.amount >= _amount, "Amount to withdraw too high");
    require(user.lockStartTime > 0, "No active stake");
    require(user.withdrawRequestTime == 0, "Withdrawal already requested");
    require(_amount > 0, "Amount must be greater than 0");

    // Distribute up to now with current active set
    _updatePool();

    bool userIsLocked = block.timestamp < user.lockStartTime + user.lockDuration;

    uint256 exitEffective = (_amount * _getBoostMultiplier(user.lockDuration)) / 1e18;

    if (!userIsLocked) {
      // Claim available rewards before reducing effective
      _claimRewards(msg.sender);
      // Capture the locked rewards for the exiting portion
      uint256 accPast = _accPSAt(uint64(block.timestamp - REWARD_DELAY_PERIOD));
      uint256 delta = accTokenPerShare - accPast;
      uint256 exitLocked = (exitEffective * delta) / PRECISION_FACTOR;
      user.delayedReward += exitLocked;
      user.delayedUnlockTime = block.timestamp + REWARD_DELAY_PERIOD;
    }
    // Early withdrawal: rewards forfeited by design

    // Remove from active
    user.effectiveAmount -= exitEffective;
    totalActiveEffective -= exitEffective;

    // Move requested amount into "exit" so it no longer counts in denominator
    user.withdrawRequestTime = block.timestamp;
    user.withdrawalAmount = _amount;
    totalInExitPeriod += _amount;

    // Stop earning rewards by setting rewardDebt to current accumulated for remaining
    user.rewardDebt = (user.effectiveAmount * accTokenPerShare) / PRECISION_FACTOR;

    uint256 availableTime = block.timestamp + EXIT_PERIOD;
    emit WithdrawRequested(msg.sender, _amount, availableTime);
  }

  // Execute withdrawal after exit period (principal only)
  function executeWithdraw() external nonReentrant {
    _updatePool();
    UserInfo storage user = userInfo[msg.sender];
    require(user.withdrawRequestTime > 0, "No withdrawal requested");
    require(block.timestamp >= user.withdrawRequestTime + EXIT_PERIOD, "Exit period not finished");

    uint256 withdrawAmount = user.withdrawalAmount;
    require(withdrawAmount > 0, "No amount to withdraw");

    // Effects
    user.amount -= withdrawAmount;
    totalStaked -= withdrawAmount;
    totalInExitPeriod -= withdrawAmount;

    // Reset withdrawal request
    user.withdrawRequestTime = 0;
    user.withdrawalAmount = 0;

    // If user withdraws everything, reset lock
    if (user.amount == 0) {
      user.lockStartTime = 0;
      user.lockDuration = 0;
      user.effectiveAmount = 0; // Should already be 0, but ensure
    }

    // Interaction (principal is always reserved; this should not fail)
    _safeTransferNative(msg.sender, withdrawAmount);
    emit WithdrawExecuted(msg.sender, withdrawAmount);
  }

  // Cancel withdrawal request (move back from exit to active; starts earning again)
  function cancelWithdraw() external {
    UserInfo storage user = userInfo[msg.sender];
    require(user.withdrawRequestTime > 0, "No withdrawal requested");

    // Distribute up to now for the previous active set (excludes this user's exiting amount)
    _updatePool();

    uint256 addBackEffective = (user.withdrawalAmount * _getBoostMultiplier(user.lockDuration)) / 1e18;
    user.effectiveAmount += addBackEffective;
    totalActiveEffective += addBackEffective;
    totalInExitPeriod -= user.withdrawalAmount;
    // If canceling, revoke the delayed reward since resuming earning
    user.delayedReward = 0;
    user.delayedUnlockTime = 0;
    user.withdrawRequestTime = 0;
    user.withdrawalAmount = 0;

    // Resume earning from this point forward
    user.rewardDebt = (user.effectiveAmount * accTokenPerShare) / PRECISION_FACTOR;
  }

  // ---------------------------
  // Rewards: fully separate from withdrawals
  // ---------------------------

  // Claim unlocked (virtual) delayed rewards (partial payout if underfunded; never reverts for lack of rewards)
  function claimRewards() external nonReentrant {
    _claimRewards(msg.sender);
  }

  function _claimRewards(address _user) internal {
    UserInfo storage user = userInfo[_user];

    // Compute virtual claimable before update (matches views)
    uint256 accPast = _accPSAt(uint64(block.timestamp - REWARD_DELAY_PERIOD));
    uint256 baseline = user.debtClaimablePS;
    uint256 virtualOwed = 0;
    if (accPast > baseline && user.effectiveAmount > 0) {
      virtualOwed = (user.effectiveAmount * (accPast - baseline)) / PRECISION_FACTOR;
    }

    _updatePool();

    uint256 owed = 0;

    // Add delayed reward if unlocked
    if (user.delayedUnlockTime > 0 && block.timestamp >= user.delayedUnlockTime) {
      owed += user.delayedReward;
      user.delayedReward = 0;
      user.delayedUnlockTime = 0;
    }

    owed += virtualOwed;

    uint256 budget = _rewardBalance();
    uint256 pay = owed <= budget ? owed : budget;
    if (pay > 0) {
      _safeTransferNative(_user, pay);
      totalClaimedRewards += pay;
      emit RewardClaimed(_user, pay);
    }

    // Proportional advance for virtual part
    if (owed > 0) {
      uint256 paidRatio = (pay * PRECISION_FACTOR) / owed;
      uint256 delta = accPast - baseline;
      uint256 advance = (paidRatio * delta) / PRECISION_FACTOR;
      user.debtClaimablePS = baseline + advance;
    } else {
      user.debtClaimablePS = accPast;
    }

    // Keep rewardDebt in sync for pending view
    user.rewardDebt = (user.effectiveAmount * accTokenPerShare) / PRECISION_FACTOR;
  }

  // ---------------------------
  // Admin / params
  // ---------------------------

  // Update periods (only owner, no lock period)
  function updatePeriods(
    uint256 _rewardDelayPeriod,
    uint256 _exitPeriod
  ) external onlyOwner {
    _updatePool();
    require(_rewardDelayPeriod > 0, "Reward delay period must be positive");
    require(_exitPeriod > 0, "Exit period must be positive");

    REWARD_DELAY_PERIOD = _rewardDelayPeriod;
    EXIT_PERIOD = _exitPeriod;

    emit PeriodsUpdated(_rewardDelayPeriod, _exitPeriod);
  }

  // Recover wrong tokens sent to the contract (not native tokens)
  function recoverWrongTokens(address _tokenAddress, uint256 _tokenAmount) external onlyOwner {
    require(_tokenAddress != address(0), "Cannot recover native tokens");
    (bool success, ) = _tokenAddress.call(
      abi.encodeWithSignature("transfer(address,uint256)", msg.sender, _tokenAmount)
    );
    require(success, "Token transfer failed");
    emit AdminTokenRecovery(_tokenAddress, _tokenAmount);
  }

  // Update pool limit per user
  function updatePoolLimitPerUser(bool _hasUserLimit, uint256 _poolLimitPerUser) external onlyOwner {
    _updatePool();
    if (_hasUserLimit) {
      require(!hasUserLimit || _poolLimitPerUser > poolLimitPerUser, "New limit must be higher");
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

  // Withdraw excess rewards (emergency) — cannot touch principal liquidity
  function emergencyRewardWithdraw(uint256 _amount) external onlyOwner {
    _updatePool();
    uint256 rb = _rewardBalance();
    require(_amount <= rb, "Cannot withdraw user stakes or exit liquidity");
    _safeTransferNative(msg.sender, _amount);
  }

  // ---------------------------
  // Views
  // ---------------------------

  // View pending rewards (streamed since last update; excludes delayed)
  function pendingReward(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    if (user.withdrawRequestTime != 0) {
      return 0;
    }

    uint256 active = _activeEffective();
    if (active == 0) {
      return 0;
    }

    // Simulate streaming allocation since last update
    uint256 timeDelta = block.timestamp - lastUpdateTimestamp;
    uint256 undistributed = totalAccruedRewards - totalClaimedRewards;
    uint256 currentRewards = _rewardBalance();
    uint256 allocCap = 0;
    if (currentRewards > undistributed) {
      allocCap = currentRewards - undistributed;
    }
    uint256 toAllocate = emissionRate * timeDelta;
    if (toAllocate > allocCap) {
      toAllocate = allocCap;
    }

    uint256 adjustedTokenPerShare = accTokenPerShare;
    if (toAllocate > 0) {
      adjustedTokenPerShare += (toAllocate * PRECISION_FACTOR) / active;
    }

    uint256 currentPending = ((user.effectiveAmount * adjustedTokenPerShare) / PRECISION_FACTOR) - user.rewardDebt;
    return currentPending;
  }

  // View function to check if user is in lock period
  function isLocked(address _user) external view returns (bool) {
    UserInfo storage user = userInfo[_user];
    if (user.lockStartTime == 0) return false;
    return block.timestamp < user.lockStartTime + user.lockDuration;
  }

  // View function to check if user is in exit period
  function isInExitPeriod(address _user) external view returns (bool) {
    UserInfo storage user = userInfo[_user];
    return user.withdrawRequestTime > 0;
  }

  // View function to get user info (added lockDuration)
  function getUserInfo(
    address _user
  )
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
    stakedAmount = user.amount;
    lockStartTime = user.lockStartTime;
    lockDuration = user.lockDuration;
    withdrawRequestTime = user.withdrawRequestTime;
    withdrawalAmount = user.withdrawalAmount;

    if (lockStartTime > 0) {
      lockEndTime = lockStartTime + lockDuration;
      isLocked_ = block.timestamp < lockEndTime;
      canRequestWithdraw = !isLocked_ && withdrawRequestTime == 0;
    }

    if (withdrawRequestTime > 0) {
      inExitPeriod = true;
      withdrawalAvailableTime = withdrawRequestTime + EXIT_PERIOD;
      canExecuteWithdraw = block.timestamp >= withdrawalAvailableTime;
    }
  }

  // View function to get time until unlock
  function timeUntilUnlock(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    if (user.lockStartTime == 0) return 0;

    uint256 lockEndTime = user.lockStartTime + user.lockDuration;
    if (block.timestamp >= lockEndTime) return 0;

    return lockEndTime - block.timestamp;
  }

  // View function to get time until withdrawal available
  function timeUntilWithdrawalAvailable(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    if (user.withdrawRequestTime == 0) return 0;

    uint256 availableTime = user.withdrawRequestTime + EXIT_PERIOD;
    if (block.timestamp >= availableTime) return 0;

    return availableTime - block.timestamp;
  }

  // View function to get current status
  function getUserStatus(address _user) external view returns (string memory) {
    UserInfo storage user = userInfo[_user];

    if (user.amount == 0) return "No stake";
    if (user.withdrawRequestTime > 0) {
      if (block.timestamp >= user.withdrawRequestTime + EXIT_PERIOD) {
        return "Withdrawal ready";
      } else {
        return "In exit period";
      }
    }
    if (block.timestamp < user.lockStartTime + user.lockDuration) {
      return "Locked";
    }
    return "Unlocked";
  }

  // View function to get contract reward balance (excess over principal)
  function getRewardBalance() external view returns (uint256) {
    return _rewardBalance();
  }

  // Get estimated APY for a given duration (in basis points, e.g., 500 = 5%)
  function getEstimatedAPY(uint256 _duration) public view returns (uint256) {
    if (_duration != 10 minutes && _duration != 20 minutes) return 0;
    uint256 activePrincipal = _activePrincipal();
    if (activePrincipal == 0) return 0;

    uint256 multiplier = _getBoostMultiplier(_duration);
    uint256 annualRewards = emissionRate * 365 days;
    uint256 baseApyBasisPoints = (annualRewards * 10000) / activePrincipal;
    return (baseApyBasisPoints * multiplier) / 1e18;
  }

  // ---------------------------
  // Reward accounting internals
  // ---------------------------

  // Update pool variables
  function _updatePool() internal {
    uint256 active = _activeEffective();
    uint256 timeDelta = block.timestamp - lastUpdateTimestamp;
    uint256 undistributed = totalAccruedRewards - totalClaimedRewards;
    uint256 currentRewards = _rewardBalance();
    if (active > 0 && timeDelta > 0) {
      // Rewards to allocate this interval, capped by available reward budget minus already undistributed
      uint256 allocCap = 0;
      if (currentRewards > undistributed) {
        allocCap = currentRewards - undistributed;
      }
      uint256 toAllocate = emissionRate * timeDelta;
      if (toAllocate > allocCap) {
        toAllocate = allocCap;
      }
      if (toAllocate > 0) {
        accTokenPerShare += (toAllocate * PRECISION_FACTOR) / active;
        totalAccruedRewards += toAllocate;
      }
    }
    lastUpdateTimestamp = block.timestamp;

    // Push checkpoint periodically for virtual delayed views
    if (uint64(block.timestamp) - lastCheckpointTs >= checkpointInterval) {
      _pushCheckpoint(uint64(block.timestamp), accTokenPerShare);
      lastCheckpointTs = uint64(block.timestamp);
    }
  }

  function _pushCheckpoint(uint64 ts, uint256 acc) internal {
    uint16 next = _cpHead + 1;
    if (next >= MAX_CHECKPOINTS) next = 0;
    _checkpoints[next] = Checkpoint({ ts: ts, acc: acc });
    _cpHead = next;
    if (_cpSize < MAX_CHECKPOINTS) {
      _cpSize++;
    }
  }

  function _accPSNowView() internal view returns (uint256) {
    uint256 active = _activeEffective();
    if (active == 0) return accTokenPerShare;
    uint256 timeDelta = block.timestamp - lastUpdateTimestamp;
    if (timeDelta == 0) return accTokenPerShare;
    uint256 undistributed = totalAccruedRewards - totalClaimedRewards;
    uint256 currentRewards = _rewardBalance();
    uint256 allocCap = 0;
    if (currentRewards > undistributed) allocCap = currentRewards - undistributed;
    uint256 toAllocate = emissionRate * timeDelta;
    if (toAllocate > allocCap) toAllocate = allocCap;
    if (toAllocate == 0) return accTokenPerShare;
    return accTokenPerShare + (toAllocate * PRECISION_FACTOR) / active;
  }

  function _accPSAt(uint64 ts) internal view returns (uint256) {
    if (_cpSize == 0) return 0;
    // Find newest checkpoint with cp.ts <= ts
    uint16 idx = _cpHead;
    uint16 count = 0;
    uint256 bestAcc = 0;
    uint64 bestTs = 0;
    while (count < _cpSize) {
      Checkpoint memory cp = _checkpoints[idx];
      if (cp.ts != 0 && cp.ts <= ts && cp.ts >= bestTs) {
        bestTs = cp.ts;
        bestAcc = cp.acc;
      }
      if (idx == 0) idx = MAX_CHECKPOINTS - 1; else idx--;
      count++;
    }
    if (bestTs == 0) return 0;

    // No forward needed if exact match or ts <= lastUpdateTimestamp (no pending batch to pro-rate)
    if (bestTs == ts || ts <= lastUpdateTimestamp) return bestAcc;

    // Pro-rate the pending batch for ts > lastUpdateTimestamp (assume uniform accrual over dormant period)
    uint256 active = _activeEffective();
    if (active == 0) return bestAcc;

    uint256 fullDelta = block.timestamp - lastUpdateTimestamp;
    uint256 timeToTs = uint256(ts) - lastUpdateTimestamp;

    uint256 undistributed = totalAccruedRewards - totalClaimedRewards;
    uint256 currentRewards = _rewardBalance();
    uint256 allocCap = currentRewards > undistributed ? (currentRewards - undistributed) : 0;

    uint256 fullToAllocate = emissionRate * fullDelta;
    if (fullToAllocate > allocCap) fullToAllocate = allocCap;

    uint256 prorataToAllocate = (fullToAllocate * timeToTs) / fullDelta;

    return bestAcc + (prorataToAllocate * PRECISION_FACTOR) / active;
  }

  // View: claimable streamed amount (unlocked by delay)
  function claimableView(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    uint256 owed = 0;
    if (user.delayedUnlockTime > 0 && block.timestamp >= user.delayedUnlockTime) {
      owed += user.delayedReward;
    }
    uint256 E = user.effectiveAmount;
    if (E == 0) return owed;
    uint256 accPast = _accPSAt(uint64(block.timestamp - REWARD_DELAY_PERIOD));
    uint256 baseline = user.debtClaimablePS;
    if (baseline > accPast) return owed;
    owed += (E * (accPast - baseline)) / PRECISION_FACTOR;
    return owed;
  }

  // View: locked (delayed) amount (streamed but not yet unlocked)
  function lockedView(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    uint256 locked = 0;
    if (user.delayedUnlockTime > 0 && block.timestamp < user.delayedUnlockTime) {
      locked += user.delayedReward;
    }
    uint256 E = user.effectiveAmount;
    if (E == 0) return locked;
    uint256 accNow = _accPSNowView();
    uint256 accPast = _accPSAt(uint64(block.timestamp - REWARD_DELAY_PERIOD));
    if (accNow <= accPast) return locked;
    locked += (E * (accNow - accPast)) / PRECISION_FACTOR;
    return locked;
  }

  // ---------------------------
  // Emission configuration
  // ---------------------------
  function setEmissionRate(uint256 _ratePerSecond) external onlyOwner {
    _updatePool();
    emissionRate = _ratePerSecond;
    emit EmissionRateUpdated(_ratePerSecond);
  }

  // Convenience: set emission rate to deplete current reward balance over target duration
  function setEmissionRateByDuration(uint256 _duration) external onlyOwner {
    _updatePool();
    require(_duration > 0, "Duration must be > 0");
    uint256 budget = _rewardBalance();
    emissionRate = budget / _duration;
    emit EmissionRateUpdated(emissionRate);
  }

  // Safe transfer native tokens
  function _safeTransferNative(address _to, uint256 _amount) internal {
    (bool success, ) = _to.call{ value: _amount }("");
    require(success, "Native token transfer failed");
  }

  // Public poke function to update pool without other actions
  function updatePool() external {
    _updatePool();
  }

  // ---------------------------
  // Fallbacks
  // ---------------------------

  // Receive function to accept native token transfers
  receive() external payable {
    // Accept native tokens for rewards funding
  }

  // Fallback function
  fallback() external payable {
    // Accept native tokens for rewards funding
  }
}