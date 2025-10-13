// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SmartChefLP is Ownable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  // Info of each user
  struct UserInfo {
    uint256 amount; // Staked LP tokens (principal)
    uint256 rewardDebt; // Reward debt
    uint256 lockStartTime; // When the lock period began
    uint256 withdrawRequestTime; // When withdrawal was requested (0 if none)
    uint256 withdrawalAmount; // Amount requested for withdrawal
  }

  // Reward tracking for delayed claims
  struct RewardEntry {
    uint256 amount;
    uint256 unlockTime;
  }

  // Configurable periods (default 30 days)
  uint256 public LOCK_PERIOD = 30 days;
  uint256 public REWARD_DELAY_PERIOD = 30 days;
  uint256 public EXIT_PERIOD = 30 days;

  // The LP token to be staked
  IERC20 public lpToken;
  // The reward token
  IERC20 public rewardToken;

  // Whether a limit is set for users
  bool public hasUserLimit;
  // Accrued token per share
  uint256 public accTokenPerShare;
  // The block number when mining starts
  uint256 public startBlock;
  // The block number of the last pool update
  uint256 public lastRewardBlock;
  // The pool limit (0 if none)
  uint256 public poolLimitPerUser;
  // Tokens created per block
  uint256 public rewardPerBlock;
  // Precision factor for reward calculations
  uint256 public PRECISION_FACTOR;
  // Total amount staked (includes amounts in exit)
  uint256 public totalStaked;
  // Block time in seconds (configurable)
  uint256 public blockTime = 5;

  // User info
  mapping(address => UserInfo) public userInfo;
  // Delayed rewards per user
  mapping(address => RewardEntry[]) public userDelayedRewards;

  // Total amount in exit period (requested withdrawals not yet executed)
  uint256 public totalInExitPeriod;

  event Deposit(address indexed user, uint256 amount);
  event WithdrawRequested(address indexed user, uint256 amount, uint256 availableTime);
  event WithdrawExecuted(address indexed user, uint256 amount);
  event RewardClaimed(address indexed user, uint256 amount);
  event RewardDelayed(address indexed user, uint256 amount, uint256 unlockTime);
  event NewRewardPerBlock(uint256 rewardPerBlock);
  event NewPoolLimit(uint256 poolLimitPerUser);
  event AdminTokenRecovery(address tokenRecovered, uint256 amount);
  event RewardsFunded(uint256 amount);
  event BlockTimeUpdated(uint256 oldBlockTime, uint256 newBlockTime);
  event PeriodsUpdated(uint256 lockPeriod, uint256 rewardDelayPeriod, uint256 exitPeriod);

  constructor(
    IERC20 _lpToken,
    IERC20 _rewardToken,
    uint256 _rewardPerBlock,
    uint256 _startBlock,
    uint256 _poolLimitPerUser,
    uint256 _lockPeriod,
    uint256 _rewardDelayPeriod,
    uint256 _exitPeriod
  ) Ownable(msg.sender) {
    lpToken = _lpToken;
    rewardToken = _rewardToken;
    rewardPerBlock = _rewardPerBlock;
    startBlock = _startBlock > block.number ? _startBlock : block.number;
    lastRewardBlock = startBlock;

    if (_poolLimitPerUser > 0) {
      hasUserLimit = true;
      poolLimitPerUser = _poolLimitPerUser;
    }

    LOCK_PERIOD = _lockPeriod;
    REWARD_DELAY_PERIOD = _rewardDelayPeriod;
    EXIT_PERIOD = _exitPeriod;

    // Assume both tokens have 18 decimals
    PRECISION_FACTOR = 10 ** (30 - 18);
  }

  // ---------------------------
  // Internal helpers
  // ---------------------------

  function _activeStaked() internal view returns (uint256) {
    // Only stake NOT in exit should accrue rewards / be in denominator
    return totalStaked - totalInExitPeriod;
  }

  function _pushOrAggregateDelayed(address _user, uint256 _amount, uint256 _unlockTime) internal {
    RewardEntry[] storage r = userDelayedRewards[_user];
    if (r.length > 0 && r[r.length - 1].unlockTime == _unlockTime) {
      r[r.length - 1].amount += _amount;
    } else {
      r.push(RewardEntry({amount: _amount, unlockTime: _unlockTime}));
    }
    emit RewardDelayed(_user, _amount, _unlockTime);
  }

  // ---------------------------
  // Core staking logic
  // ---------------------------

  // Deposit LP tokens and delay rewards
  function deposit(uint256 _amount) external nonReentrant {
    UserInfo storage user = userInfo[msg.sender];
    require(_amount > 0, "Deposit amount must be greater than 0");
    require(user.withdrawRequestTime == 0, "Cannot deposit during exit period");

    if (hasUserLimit) {
      require(_amount + user.amount <= poolLimitPerUser, "User amount above limit");
    }

    _updatePool();

    if (user.amount > 0) {
      uint256 pending = (user.amount * accTokenPerShare) / PRECISION_FACTOR - user.rewardDebt;
      if (pending > 0) {
        uint256 unlockTime = block.timestamp + REWARD_DELAY_PERIOD;
        _pushOrAggregateDelayed(msg.sender, pending, unlockTime);
      }
    }

    user.amount = user.amount + _amount;
    totalStaked = totalStaked + _amount;
    user.lockStartTime = block.timestamp; // Reset lock on deposit/top-up

    user.rewardDebt = (user.amount * accTokenPerShare) / PRECISION_FACTOR;
    lpToken.safeTransferFrom(msg.sender, address(this), _amount);
    emit Deposit(msg.sender, _amount);
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

    bool userIsLocked = block.timestamp < user.lockStartTime + LOCK_PERIOD;
    uint256 pending = (user.amount * accTokenPerShare) / PRECISION_FACTOR - user.rewardDebt;

    if (!userIsLocked) {
      if (pending > 0) {
        uint256 unlockTime = block.timestamp + REWARD_DELAY_PERIOD;
        _pushOrAggregateDelayed(msg.sender, pending, unlockTime);
      }
    }
    // Early withdrawal: pending not added (forfeited by design)

    // Move requested amount into "exit" so it no longer counts in denominator
    user.withdrawRequestTime = block.timestamp;
    user.withdrawalAmount = _amount;
    totalInExitPeriod += _amount;

    // Stop earning rewards going forward
    user.rewardDebt = (user.amount * accTokenPerShare) / PRECISION_FACTOR;

    uint256 availableTime = block.timestamp + EXIT_PERIOD;
    emit WithdrawRequested(msg.sender, _amount, availableTime);
  }

  // Execute withdrawal after exit period (principal only)
  function executeWithdraw() external nonReentrant {
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

    // If user withdraws everything, reset lock time
    if (user.amount == 0) {
      user.lockStartTime = 0;
    }

    // Interaction (LP principal only)
    lpToken.safeTransfer(msg.sender, withdrawAmount);
    emit WithdrawExecuted(msg.sender, withdrawAmount);
  }

  // Cancel withdrawal request: move back from exit to active stake (starts earning again)
  function cancelWithdraw() external {
    UserInfo storage user = userInfo[msg.sender];
    require(user.withdrawRequestTime > 0, "No withdrawal requested");

    // Distribute up to now for the previous active set (excludes this user's exiting amount)
    _updatePool();

    totalInExitPeriod -= user.withdrawalAmount;
    user.withdrawRequestTime = 0;
    user.withdrawalAmount = 0;

    // Resume earning from this point forward
    user.rewardDebt = (user.amount * accTokenPerShare) / PRECISION_FACTOR;
  }

  // ---------------------------
  // Rewards: fully separate from withdrawals
  // ---------------------------

  // Claim unlocked delayed rewards (partial payout if underfunded; never reverts for lack of rewards)
  function claimRewards() external nonReentrant {
    UserInfo storage user = userInfo[msg.sender];

    // If not in exit period, realize current pending into delayed (then pay unlocked)
    if (user.withdrawRequestTime == 0) {
      _updatePool();
      uint256 pending = (user.amount * accTokenPerShare) / PRECISION_FACTOR - user.rewardDebt;
      if (pending > 0) {
        uint256 unlockTime = block.timestamp + REWARD_DELAY_PERIOD;
        _pushOrAggregateDelayed(msg.sender, pending, unlockTime);
        user.rewardDebt = (user.amount * accTokenPerShare) / PRECISION_FACTOR;
      }
    }

    RewardEntry[] storage rewards = userDelayedRewards[msg.sender];
    uint256 budget = rewardToken.balanceOf(address(this));
    uint256 paid = 0;

    // Sweep unlocked entries up to available rewardToken budget
    for (uint256 i = 0; i < rewards.length && budget > 0; ) {
      if (rewards[i].unlockTime <= block.timestamp) {
        uint256 pay = rewards[i].amount;
        if (pay > budget) {
          // Partial pay: reduce entry and exhaust budget
          rewards[i].amount = pay - budget;
          paid += budget;
          budget = 0;
          break;
        } else {
          paid += pay;
          budget -= pay;
          // swap & pop
          rewards[i] = rewards[rewards.length - 1];
          rewards.pop();
          continue; // do not i++
        }
      }
      i++;
    }

    if (paid > 0) {
      rewardToken.safeTransfer(msg.sender, paid);
      emit RewardClaimed(msg.sender, paid);
    }
  }

  // ---------------------------
  // Admin / params
  // ---------------------------

  // Update periods (only owner)
  function updatePeriods(
    uint256 _lockPeriod,
    uint256 _rewardDelayPeriod,
    uint256 _exitPeriod
  ) external onlyOwner {
    require(_lockPeriod > 0, "Lock period must be positive");
    require(_rewardDelayPeriod > 0, "Reward delay period must be positive");
    require(_exitPeriod > 0, "Exit period must be positive");

    LOCK_PERIOD = _lockPeriod;
    REWARD_DELAY_PERIOD = _rewardDelayPeriod;
    EXIT_PERIOD = _exitPeriod;

    emit PeriodsUpdated(_lockPeriod, _rewardDelayPeriod, _exitPeriod);
  }

  // Recover wrong tokens sent to the contract (cannot touch LP or reward token)
  function recoverWrongTokens(address _tokenAddress, uint256 _tokenAmount) external onlyOwner {
    require(_tokenAddress != address(lpToken), "Cannot recover LP token");
    require(_tokenAddress != address(rewardToken), "Cannot recover reward token");
    IERC20(_tokenAddress).safeTransfer(msg.sender, _tokenAmount);
    emit AdminTokenRecovery(_tokenAddress, _tokenAmount);
  }

  // Update reward per block (APY is in basis points, e.g., 1000 = 10%).
  // Use active stake so the implied APY matches the set used for distribution.
  function updateRewardPerBlock(uint256 _newAPYBasisPoints) external onlyOwner {
    require(_newAPYBasisPoints <= 10000, "APY too high"); // Max 100%
    _updatePool(); // Lock in past rewards before changing rate

    // Calculate reward per block based on APY
    uint256 blocksPerYear = (365 * 24 * 3600) / blockTime;
    uint256 active = _activeStaked();

    if (active > 0) {
      // rewardPerBlock = (activeStaked * APY) / (blocksPerYear * 10000)
      rewardPerBlock = (active * _newAPYBasisPoints) / (blocksPerYear * 10000);
    } else {
      // If nothing active, set a default based on one token unit benchmark
      rewardPerBlock = (_newAPYBasisPoints * 1e18) / (blocksPerYear * 10000);
    }

    emit NewRewardPerBlock(rewardPerBlock);
  }

  // Alternative: Set reward per block directly (for precise control)
  function setRewardPerBlock(uint256 _rewardPerBlock) external onlyOwner {
    _updatePool(); // Lock in past rewards before changing rate
    rewardPerBlock = _rewardPerBlock;
    emit NewRewardPerBlock(rewardPerBlock);
  }

  // Update block time (in seconds)
  function updateBlockTime(uint256 _newBlockTime) external onlyOwner {
    require(_newBlockTime > 0, "Block time must be positive");
    require(_newBlockTime <= 3600, "Block time too large"); // Max 1 hour for sanity
    uint256 oldBlockTime = blockTime;
    blockTime = _newBlockTime;
    emit BlockTimeUpdated(oldBlockTime, _newBlockTime);
  }

  // Update pool limit per user
  function updatePoolLimitPerUser(bool _hasUserLimit, uint256 _poolLimitPerUser) external onlyOwner {
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

  // Fund rewards pool with reward tokens
  function fundRewards(uint256 _amount) external onlyOwner {
    require(_amount > 0, "Must send tokens");
    rewardToken.safeTransferFrom(msg.sender, address(this), _amount);
    emit RewardsFunded(_amount);
  }

  // Owner can withdraw excess reward tokens (doesn't affect LP principal)
  function emergencyRewardWithdraw(uint256 _amount) external onlyOwner {
    require(rewardToken.balanceOf(address(this)) >= _amount, "Insufficient reward balance");
    rewardToken.safeTransfer(msg.sender, _amount);
  }

  // ---------------------------
  // Views
  // ---------------------------

  // View pending rewards (current only; excludes delayed)
  function pendingReward(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];

    uint256 currentPending = 0;
    if (user.withdrawRequestTime == 0) {
      uint256 adjustedTokenPerShare = accTokenPerShare;
      uint256 active = _activeStaked();
      if (block.number > lastRewardBlock && active != 0) {
        uint256 multiplier = _getMultiplier(lastRewardBlock, block.number);
        uint256 reward = multiplier * rewardPerBlock;
        adjustedTokenPerShare = accTokenPerShare + ((reward * PRECISION_FACTOR) / active);
      }
      currentPending = ((user.amount * adjustedTokenPerShare) / PRECISION_FACTOR) - user.rewardDebt;
    }

    return currentPending;
  }

  // View claimable delayed rewards (doesn't account for current rewardToken balance)
  function claimableRewards(address _user) external view returns (uint256) {
    RewardEntry[] storage rewards = userDelayedRewards[_user];
    uint256 claimable = 0;

    for (uint256 i = 0; i < rewards.length; i++) {
      if (rewards[i].unlockTime <= block.timestamp) {
        claimable += rewards[i].amount;
      }
    }

    return claimable;
  }

  // View total delayed rewards (claimable + locked)
  function totalDelayedRewards(address _user) external view returns (uint256) {
    RewardEntry[] storage rewards = userDelayedRewards[_user];
    uint256 total = 0;

    for (uint256 i = 0; i < rewards.length; i++) {
      total += rewards[i].amount;
    }

    return total;
  }

  // View delayed rewards details
  function getDelayedRewards(address _user) external view returns (RewardEntry[] memory) {
    return userDelayedRewards[_user];
  }

  // View function to check if user is in lock period
  function isLocked(address _user) external view returns (bool) {
    UserInfo storage user = userInfo[_user];
    if (user.lockStartTime == 0) return false;
    return block.timestamp < user.lockStartTime + LOCK_PERIOD;
  }

  // View function to check if user is in exit period
  function isInExitPeriod(address _user) external view returns (bool) {
    UserInfo storage user = userInfo[_user];
    return user.withdrawRequestTime > 0;
  }

  // View function to get user info
  function getUserInfo(
    address _user
  )
    external
    view
    returns (
      uint256 stakedAmount,
      uint256 lockStartTime,
      uint256 lockEndTime,
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
    withdrawRequestTime = user.withdrawRequestTime;
    withdrawalAmount = user.withdrawalAmount;

    if (lockStartTime > 0) {
      lockEndTime = lockStartTime + LOCK_PERIOD;
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

    uint256 lockEndTime = user.lockStartTime + LOCK_PERIOD;
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
    if (block.timestamp < user.lockStartTime + LOCK_PERIOD) {
      return "Locked";
    }
    return "Unlocked";
  }

  // ---------------------------
  // Reward accounting internals
  // ---------------------------

  function _updatePool() internal {
    if (block.number <= lastRewardBlock) {
      return;
    }
    uint256 active = _activeStaked();
    if (active == 0) {
      lastRewardBlock = block.number;
      return;
    }
    uint256 multiplier = _getMultiplier(lastRewardBlock, block.number);
    uint256 reward = multiplier * rewardPerBlock;
    accTokenPerShare = accTokenPerShare + ((reward * PRECISION_FACTOR) / active);
    lastRewardBlock = block.number;
  }

  function _getMultiplier(uint256 _from, uint256 _to) internal pure returns (uint256) {
    return _to - _from;
  }
}
