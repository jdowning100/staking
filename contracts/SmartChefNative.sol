// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

contract SmartChefNative is Ownable, ReentrancyGuard {
  // Info of each user
  struct UserInfo {
    uint256 amount; // Staked native tokens
    uint256 rewardDebt; // Reward debt
    uint256 lockStartTime; // When the lock period began
  }

  // Lockup and withdrawal settings
  uint256 public constant LOCK_PERIOD = 30 days;
  uint256 public constant GRACE_PERIOD = 24 hours;

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
  // Total amount staked
  uint256 public totalStaked;
  // Block time in seconds (configurable)
  uint256 public blockTime = 5;
  // Info of each user that stakes tokens
  mapping(address => UserInfo) public userInfo;

  event Deposit(address indexed user, uint256 amount);
  event Withdraw(address indexed user, uint256 amount);
  event EmergencyWithdraw(address indexed user, uint256 amount);
  event RewardClaimed(address indexed user, uint256 amount);
  event NewRewardPerBlock(uint256 rewardPerBlock);
  event NewPoolLimit(uint256 poolLimitPerUser);
  event AdminTokenRecovery(address tokenRecovered, uint256 amount);
  event RewardsFunded(uint256 amount);
  event BlockTimeUpdated(uint256 oldBlockTime, uint256 newBlockTime);

  constructor(uint256 _rewardPerBlock, uint256 _startBlock, uint256 _poolLimitPerUser) Ownable(msg.sender) {
    rewardPerBlock = _rewardPerBlock;
    startBlock = _startBlock > block.number ? _startBlock : block.number;
    lastRewardBlock = startBlock;
    if (_poolLimitPerUser > 0) {
      hasUserLimit = true;
      poolLimitPerUser = _poolLimitPerUser;
    }
    // Native token has 18 decimals
    PRECISION_FACTOR = 10 ** (30 - 18);
  }

  // Deposit native tokens and collect rewards
  function deposit() external payable nonReentrant {
    UserInfo storage user = userInfo[msg.sender];
    uint256 _amount = msg.value;
    require(_amount > 0, 'Deposit amount must be greater than 0');

    if (hasUserLimit) {
      require(_amount + user.amount <= poolLimitPerUser, 'User amount above limit');
    }

    _updatePool();

    if (user.amount > 0) {
      uint256 pending = (user.amount * accTokenPerShare) / PRECISION_FACTOR - user.rewardDebt;
      if (pending > 0) {
        // Check solvency: ensure we don't use the new deposit (msg.value) to pay old rewards
        // Available rewards = (balance before deposit) - totalStaked
        uint256 balanceBeforeDeposit = address(this).balance - msg.value;
        require(balanceBeforeDeposit >= totalStaked, 'Contract invariant violated');
        uint256 rewardBalance = balanceBeforeDeposit - totalStaked;
        
        // Pay what we can, skip if insufficient rewards to prevent bricking
        if (pending <= rewardBalance) {
          _safeTransferNative(msg.sender, pending);
          emit RewardClaimed(msg.sender, pending);
        }
        // If insufficient rewards, silently skip payout to keep contract functional
      }
    }

    user.amount = user.amount + _amount;
    totalStaked = totalStaked + _amount;
    user.lockStartTime = block.timestamp; // Reset lock on deposit/top-up

    user.rewardDebt = (user.amount * accTokenPerShare) / PRECISION_FACTOR;
    emit Deposit(msg.sender, _amount);
  }

  // Withdraw staked tokens and collect rewards
  function withdraw(uint256 _amount) external nonReentrant {
    UserInfo storage user = userInfo[msg.sender];
    require(user.amount >= _amount, 'Amount to withdraw too high');
    require(user.lockStartTime > 0, 'No active stake');

    // Calculate which lock cycle we're in and if we're in a grace period
    uint256 timeSinceStart = block.timestamp - user.lockStartTime;
    uint256 fullCycleLength = LOCK_PERIOD + GRACE_PERIOD;
    uint256 timeInCurrentCycle = timeSinceStart % fullCycleLength;

    // Check if we're in a grace period of any cycle
    bool inGracePeriod = timeInCurrentCycle >= LOCK_PERIOD;

    require(inGracePeriod, 'Still locked - not in grace period');

    _updatePool();
    uint256 pending = (user.amount * accTokenPerShare) / PRECISION_FACTOR - user.rewardDebt;
    if (pending > 0) {
      // Check solvency: ensure we don't dip into staked funds
      // Must check against current balance minus ALL staked funds (not adjusting for withdrawal)
      uint256 rewardBalance = address(this).balance - totalStaked;
      
      // Pay what we can, skip if insufficient rewards to prevent bricking
      if (pending <= rewardBalance) {
        _safeTransferNative(msg.sender, pending);
        emit RewardClaimed(msg.sender, pending);
      }
      // If insufficient rewards, silently skip payout to keep contract functional
    }

    if (_amount > 0) {
      user.amount = user.amount - _amount;
      totalStaked = totalStaked - _amount;
      _safeTransferNative(msg.sender, _amount);

      // If user withdraws everything, reset lock time
      if (user.amount == 0) {
        user.lockStartTime = 0;
      }
      // Otherwise, lock timing continues unchanged from original deposit
    }

    user.rewardDebt = (user.amount * accTokenPerShare) / PRECISION_FACTOR;
    emit Withdraw(msg.sender, _amount);
  }

  // Claim rewards without withdrawing stake
  function claimRewards() external nonReentrant {
    UserInfo storage user = userInfo[msg.sender];
    _updatePool();
    uint256 pending = (user.amount * accTokenPerShare) / PRECISION_FACTOR - user.rewardDebt;
    if (pending > 0) {
      // Check solvency: ensure we don't dip into staked funds
      uint256 rewardBalance = address(this).balance - totalStaked;
      
      // Pay what we can, skip if insufficient rewards to prevent bricking
      if (pending <= rewardBalance) {
        _safeTransferNative(msg.sender, pending);
        emit RewardClaimed(msg.sender, pending);
      }
      // If insufficient rewards, silently skip payout to keep contract functional
    }
    user.rewardDebt = (user.amount * accTokenPerShare) / PRECISION_FACTOR;
  }

  // Withdraw staked tokens without rewards (emergency)
  function emergencyWithdraw() external nonReentrant {
    UserInfo storage user = userInfo[msg.sender];
    require(user.amount > 0, 'No tokens staked');
    // Emergency withdraw is always available - no lock restrictions
    uint256 amountToTransfer = user.amount;
    totalStaked = totalStaked - amountToTransfer;
    user.amount = 0;
    user.rewardDebt = 0;
    user.lockStartTime = 0;
    if (amountToTransfer > 0) {
      _safeTransferNative(msg.sender, amountToTransfer);
    }
    emit EmergencyWithdraw(msg.sender, amountToTransfer);
  }

  // Recover wrong tokens sent to the contract (not native tokens)
  function recoverWrongTokens(address _tokenAddress, uint256 _tokenAmount) external onlyOwner {
    require(_tokenAddress != address(0), 'Cannot recover native tokens');
    (bool success, ) = _tokenAddress.call(
      abi.encodeWithSignature('transfer(address,uint256)', msg.sender, _tokenAmount)
    );
    require(success, 'Token transfer failed');
    emit AdminTokenRecovery(_tokenAddress, _tokenAmount);
  }

  // Update reward per block (APY is in basis points, e.g., 1000 = 10%)
  function updateRewardPerBlock(uint256 _newAPYBasisPoints) external onlyOwner {
    require(_newAPYBasisPoints <= 10000, 'APY too high'); // Max 100%
    _updatePool(); // Lock in past rewards before changing rate

    // Calculate reward per block based on APY
    // APY in basis points (1000 = 10%)
    // Calculate blocks per year based on current block time
    uint256 blocksPerYear = (365 * 24 * 3600) / blockTime;

    if (totalStaked > 0) {
      // rewardPerBlock = (totalStaked * APY) / (blocksPerYear * 10000)
      rewardPerBlock = (totalStaked * _newAPYBasisPoints) / (blocksPerYear * 10000);
    } else {
      // If no tokens staked, set a default based on expected stake
      // This will auto-adjust when tokens are staked
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
    require(_newBlockTime > 0, 'Block time must be positive');
    require(_newBlockTime <= 3600, 'Block time too large'); // Max 1 hour for sanity
    uint256 oldBlockTime = blockTime;
    blockTime = _newBlockTime;
    emit BlockTimeUpdated(oldBlockTime, _newBlockTime);
  }

  // Update pool limit per user
  function updatePoolLimitPerUser(bool _hasUserLimit, uint256 _poolLimitPerUser) external onlyOwner {
    if (_hasUserLimit) {
      require(!hasUserLimit || _poolLimitPerUser > poolLimitPerUser, 'New limit must be higher');
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
    require(msg.value > 0, 'Must send tokens');
    emit RewardsFunded(msg.value);
  }

  // Withdraw excess rewards (emergency)
  function emergencyRewardWithdraw(uint256 _amount) external onlyOwner {
    // Ensure we don't withdraw user stakes
    uint256 rewardBalance = address(this).balance - totalStaked;
    require(_amount <= rewardBalance, 'Cannot withdraw user stakes');
    _safeTransferNative(msg.sender, _amount);
  }

  // View pending rewards
  function pendingReward(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    uint256 adjustedTokenPerShare = accTokenPerShare;
    if (block.number > lastRewardBlock && totalStaked != 0) {
      uint256 multiplier = _getMultiplier(lastRewardBlock, block.number);
      uint256 reward = multiplier * rewardPerBlock;
      adjustedTokenPerShare = accTokenPerShare + ((reward * PRECISION_FACTOR) / totalStaked);
    }
    return ((user.amount * adjustedTokenPerShare) / PRECISION_FACTOR) - user.rewardDebt;
  }

  // Update pool variables
  function _updatePool() internal {
    if (block.number <= lastRewardBlock) {
      return;
    }
    if (totalStaked == 0) {
      lastRewardBlock = block.number;
      return;
    }
    uint256 multiplier = _getMultiplier(lastRewardBlock, block.number);
    uint256 reward = multiplier * rewardPerBlock;
    accTokenPerShare = accTokenPerShare + ((reward * PRECISION_FACTOR) / totalStaked);
    lastRewardBlock = block.number;
  }

  // Return reward multiplier
  function _getMultiplier(uint256 _from, uint256 _to) internal pure returns (uint256) {
    return _to - _from;
  }

  // Safe transfer native tokens
  function _safeTransferNative(address _to, uint256 _amount) internal {
    (bool success, ) = _to.call{ value: _amount }('');
    require(success, 'Native token transfer failed');
  }

  // View function to check if user is in lock period
  function isLocked(address _user) external view returns (bool) {
    UserInfo storage user = userInfo[_user];
    if (user.lockStartTime == 0) return false;

    uint256 timeSinceStart = block.timestamp - user.lockStartTime;
    uint256 fullCycleLength = LOCK_PERIOD + GRACE_PERIOD;
    uint256 timeInCurrentCycle = timeSinceStart % fullCycleLength;

    return timeInCurrentCycle < LOCK_PERIOD;
  }

  // View function to check if user is in grace period
  function isInGracePeriod(address _user) external view returns (bool) {
    UserInfo storage user = userInfo[_user];
    if (user.lockStartTime == 0) return false;

    uint256 timeSinceStart = block.timestamp - user.lockStartTime;
    uint256 fullCycleLength = LOCK_PERIOD + GRACE_PERIOD;
    uint256 timeInCurrentCycle = timeSinceStart % fullCycleLength;

    return timeInCurrentCycle >= LOCK_PERIOD;
  }

  // View function to get lock details
  function getLockInfo(
    address _user
  )
    external
    view
    returns (
      uint256 lockStartTime,
      uint256 currentCycle,
      uint256 currentLockEnd,
      uint256 currentGracePeriodEnd,
      bool canWithdraw,
      bool inGracePeriod
    )
  {
    UserInfo storage user = userInfo[_user];
    lockStartTime = user.lockStartTime;

    if (lockStartTime > 0) {
      uint256 timeSinceStart = block.timestamp - lockStartTime;
      uint256 fullCycleLength = LOCK_PERIOD + GRACE_PERIOD;
      currentCycle = timeSinceStart / fullCycleLength;
      uint256 timeInCurrentCycle = timeSinceStart % fullCycleLength;

      // Calculate current cycle boundaries
      uint256 currentCycleStart = lockStartTime + (currentCycle * fullCycleLength);
      currentLockEnd = currentCycleStart + LOCK_PERIOD;
      currentGracePeriodEnd = currentCycleStart + fullCycleLength;

      inGracePeriod = timeInCurrentCycle >= LOCK_PERIOD;
      canWithdraw = inGracePeriod;
    } else {
      currentCycle = 0;
      currentLockEnd = 0;
      currentGracePeriodEnd = 0;
      canWithdraw = false;
      inGracePeriod = false;
    }
  }

  // View function to get time until next unlock
  function timeUntilUnlock(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    if (user.lockStartTime == 0) return 0;

    uint256 timeSinceStart = block.timestamp - user.lockStartTime;
    uint256 fullCycleLength = LOCK_PERIOD + GRACE_PERIOD;
    uint256 timeInCurrentCycle = timeSinceStart % fullCycleLength;

    // If already in grace period, can withdraw now
    if (timeInCurrentCycle >= LOCK_PERIOD) return 0;

    // Otherwise return time until grace period starts
    return LOCK_PERIOD - timeInCurrentCycle;
  }

  // View function to get time left in current grace period
  function timeLeftInGracePeriod(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    if (user.lockStartTime == 0) return 0;

    uint256 timeSinceStart = block.timestamp - user.lockStartTime;
    uint256 fullCycleLength = LOCK_PERIOD + GRACE_PERIOD;
    uint256 timeInCurrentCycle = timeSinceStart % fullCycleLength;

    // If not in grace period, return 0
    if (timeInCurrentCycle < LOCK_PERIOD) return 0;

    // Return time until grace period ends (start of next cycle)
    return fullCycleLength - timeInCurrentCycle;
  }

  // View function to get current lock cycle number
  function getCurrentCycle(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    if (user.lockStartTime == 0) return 0;

    uint256 timeSinceStart = block.timestamp - user.lockStartTime;
    uint256 fullCycleLength = LOCK_PERIOD + GRACE_PERIOD;
    return timeSinceStart / fullCycleLength;
  }

  // View function to get contract balance (excluding user stakes)
  function getRewardBalance() external view returns (uint256) {
    if (address(this).balance > totalStaked) {
      return address(this).balance - totalStaked;
    }
    return 0;
  }

  // Receive function to accept native token transfers
  receive() external payable {
    // Accept native tokens for rewards funding
  }

  // Fallback function
  fallback() external payable {
    // Accept native tokens for rewards funding
  }
}
