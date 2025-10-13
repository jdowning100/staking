// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SmartChefLP
 * @dev LP Token staking with 30-day lock cycles, 24h grace, and native token rewards.
 * Fixes:
 *  - Proper reward accounting (accRewardPerShare / rewardDebt / lastRewardBlock)
 *  - No retroactive windfall / double-claim
 *  - Fee-on-transfer-safe deposits
 *  - Owner can't underfund rewards (withdraw only when no one is staked)
 */
contract SmartChefLP is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ====== Config ======
    IERC20 public immutable lpToken;

    // rewards are paid in native (QUAI)
    uint256 public rewardPerBlock;
    uint256 public startBlock;
    uint256 public bonusEndBlock;

    uint256 public poolLimitPerUser;
    bool public hasUserLimit;

    // ====== Constants / Precision ======
    uint256 public constant LOCK_PERIOD = 30 days;
    uint256 public constant GRACE_PERIOD = 24 hours;
    uint256 private constant ACC_PRECISION = 1e12;

    // ====== Pool Accounting ======
    uint256 public lastRewardBlock;       // last block that rewards were accounted
    uint256 public accRewardPerShare;     // scaled by ACC_PRECISION

    // ====== Totals ======
    uint256 public totalStaked;

    // ====== User Info ======
    struct UserInfo {
        uint256 amount;        // LP staked
        uint256 rewardDebt;    // accounting checkpoint
        uint256 lockStartTime; // lock cycle start
    }
    mapping(address => UserInfo) public userInfo;

    // ====== Events ======
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);
    event RewardPerBlockUpdated(uint256 rewardPerBlock);
    event PoolLimitUpdated(bool hasUserLimit, uint256 poolLimitPerUser);
    event StopReward(uint256 atBlock);

    constructor(
        IERC20 _lpToken,
        uint256 _rewardPerBlock,
        uint256 _startBlock,
        uint256 _bonusEndBlock,
        uint256 _poolLimitPerUser,
        address _admin
    ) Ownable(_admin) {
        require(address(_lpToken) != address(0), "LP token=0");
        require(_admin != address(0), "admin=0");
        require(_startBlock < _bonusEndBlock, "start >= end");

        lpToken = _lpToken;

        rewardPerBlock = _rewardPerBlock;
        startBlock = _startBlock;
        bonusEndBlock = _bonusEndBlock;

        if (_poolLimitPerUser > 0) {
            hasUserLimit = true;
            poolLimitPerUser = _poolLimitPerUser;
        }

        // Initialize accounting to startBlock so no accrual before mining starts
        lastRewardBlock = _startBlock;
    }

    // ====== Core: accounting ======

    function updatePool() public {
        uint256 blockTo = block.number < bonusEndBlock ? block.number : bonusEndBlock;
        if (blockTo <= lastRewardBlock) {
            return;
        }

        if (totalStaked == 0) {
            // nothing staked; just move the cursor forward
            lastRewardBlock = blockTo;
            return;
        }

        // If we haven't reached startBlock yet, do nothing
        if (lastRewardBlock < startBlock) {
            if (blockTo <= startBlock) return;
            lastRewardBlock = startBlock;
        }

        uint256 blocks = blockTo - lastRewardBlock;
        if (blocks == 0) return;

        uint256 reward = blocks * rewardPerBlock;
        accRewardPerShare += (reward * ACC_PRECISION) / totalStaked;
        lastRewardBlock = blockTo;
    }

    function _pending(address _user) internal view returns (uint256) {
        UserInfo memory user = userInfo[_user];
        if (user.amount == 0) return 0;

        uint256 _acc = accRewardPerShare;
        uint256 blockTo = block.number < bonusEndBlock ? block.number : bonusEndBlock;

        if (blockTo > lastRewardBlock && totalStaked != 0) {
            uint256 effectiveLast = lastRewardBlock;
            if (effectiveLast < startBlock) effectiveLast = startBlock;
            if (blockTo > effectiveLast) {
                uint256 blocks = blockTo - effectiveLast;
                uint256 reward = blocks * rewardPerBlock;
                _acc += (reward * ACC_PRECISION) / totalStaked;
            }
        }
        return (user.amount * _acc) / ACC_PRECISION - user.rewardDebt;
    }

    // ====== User actions ======

    /// @notice Deposit LP tokens. Respects user limit and fee-on-transfer tokens.
    function deposit(uint256 _amount) external nonReentrant {
        require(_amount > 0, "amount=0");

        UserInfo storage user = userInfo[msg.sender];
        if (hasUserLimit) {
            require(_amount + user.amount <= poolLimitPerUser, "above user limit");
        }

        updatePool();

        // harvest first (allowed during lock by design; add require(!isLocked) if you want to block)
        uint256 pendingAmt = (user.amount * accRewardPerShare) / ACC_PRECISION - user.rewardDebt;
        if (pendingAmt > 0) {
            _payReward(msg.sender, pendingAmt);
            emit RewardsClaimed(msg.sender, pendingAmt);
        }

        // fee-on-transfer safe receive
        uint256 beforeBal = lpToken.balanceOf(address(this));
        lpToken.safeTransferFrom(msg.sender, address(this), _amount);
        uint256 received = lpToken.balanceOf(address(this)) - beforeBal;
        require(received > 0, "received=0");

        if (user.amount == 0) {
            user.lockStartTime = block.timestamp;
        }

        user.amount += received;
        totalStaked += received;

        user.rewardDebt = (user.amount * accRewardPerShare) / ACC_PRECISION;

        emit Deposit(msg.sender, received);
    }

    /// @notice Withdraw LP tokens (only during grace period).
    function withdraw(uint256 _amount) external nonReentrant {
        UserInfo storage user = userInfo[msg.sender];
        require(_amount > 0, "amount=0");
        require(user.amount >= _amount, "insufficient");
        require(!isLocked(msg.sender), "locked");

        updatePool();

        // harvest
        uint256 pendingAmt = (user.amount * accRewardPerShare) / ACC_PRECISION - user.rewardDebt;
        if (pendingAmt > 0) {
            _payReward(msg.sender, pendingAmt);
            emit RewardsClaimed(msg.sender, pendingAmt);
        }

        user.amount -= _amount;
        totalStaked -= _amount;
        lpToken.safeTransfer(msg.sender, _amount);

        user.rewardDebt = (user.amount * accRewardPerShare) / ACC_PRECISION;

        if (user.amount == 0) {
            // optional reset for clarity
            user.lockStartTime = 0;
        }

        emit Withdraw(msg.sender, _amount);
    }

    /// @notice Claim rewards without changing your stake.
    /// @dev Allowed even while locked. Add `require(!isLocked(msg.sender))` to block during lock.
    function claimRewards() external nonReentrant {
        updatePool();

        UserInfo storage user = userInfo[msg.sender];
        uint256 pendingAmt = (user.amount * accRewardPerShare) / ACC_PRECISION - user.rewardDebt;
        require(pendingAmt > 0, "no rewards");

        _payReward(msg.sender, pendingAmt);
        user.rewardDebt = (user.amount * accRewardPerShare) / ACC_PRECISION;

        emit RewardsClaimed(msg.sender, pendingAmt);
    }

    /// @notice Emergency withdraw LP (forfeits rewards).
    function emergencyWithdraw() external nonReentrant {
        UserInfo storage user = userInfo[msg.sender];
        uint256 amt = user.amount;
        require(amt > 0, "nothing to withdraw");

        // forfeit rewards
        totalStaked -= amt;
        user.amount = 0;
        user.rewardDebt = 0;
        user.lockStartTime = 0;

        lpToken.safeTransfer(msg.sender, amt);
        emit EmergencyWithdraw(msg.sender, amt);
    }

    // ====== Views ======

    function pendingReward(address _user) external view returns (uint256) {
        return _pending(_user);
    }

    function getRewardBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ====== Lock/grace utilities (unchanged semantics) ======

    function isLocked(address _user) public view returns (bool) {
        UserInfo storage user = userInfo[_user];
        if (user.lockStartTime == 0) return false;

        uint256 timeSinceStart = block.timestamp - user.lockStartTime;
        uint256 fullCycleLength = LOCK_PERIOD + GRACE_PERIOD;
        uint256 positionInCycle = timeSinceStart % fullCycleLength;

        return positionInCycle < LOCK_PERIOD;
    }

    function isInGracePeriod(address _user) public view returns (bool) {
        UserInfo storage user = userInfo[_user];
        if (user.lockStartTime == 0) return false;

        uint256 timeSinceStart = block.timestamp - user.lockStartTime;
        uint256 fullCycleLength = LOCK_PERIOD + GRACE_PERIOD;
        uint256 positionInCycle = timeSinceStart % fullCycleLength;

        return positionInCycle >= LOCK_PERIOD;
    }

    function timeUntilUnlock(address _user) external view returns (uint256) {
        if (!isLocked(_user)) return 0;

        UserInfo storage user = userInfo[_user];
        uint256 timeSinceStart = block.timestamp - user.lockStartTime;
        uint256 fullCycleLength = LOCK_PERIOD + GRACE_PERIOD;
        uint256 positionInCycle = timeSinceStart % fullCycleLength;

        return LOCK_PERIOD - positionInCycle;
    }

    function timeLeftInGracePeriod(address _user) external view returns (uint256) {
        if (!isInGracePeriod(_user)) return 0;

        UserInfo storage user = userInfo[_user];
        uint256 timeSinceStart = block.timestamp - user.lockStartTime;
        uint256 fullCycleLength = LOCK_PERIOD + GRACE_PERIOD;
        uint256 positionInCycle = timeSinceStart % fullCycleLength;

        return fullCycleLength - positionInCycle;
    }

    function getCurrentCycle(address _user) external view returns (uint256) {
        UserInfo storage user = userInfo[_user];
        if (user.lockStartTime == 0) return 0;

        uint256 timeSinceStart = block.timestamp - user.lockStartTime;
        uint256 fullCycleLength = LOCK_PERIOD + GRACE_PERIOD;

        return (timeSinceStart / fullCycleLength) + 1;
    }

    function getLockInfo(address _user)
        external
        view
        returns (
            uint256 lockStartTime,
            uint256 currentCycle,
            bool locked,
            bool inGracePeriod,
            uint256 timeUntilUnlock_,
            uint256 timeLeftInGrace_
        )
    {
        UserInfo storage user = userInfo[_user];

        lockStartTime = user.lockStartTime;
        // local recompute (no external self-calls)
        if (user.lockStartTime == 0) {
            currentCycle = 0;
            locked = false;
            inGracePeriod = false;
            timeUntilUnlock_ = 0;
            timeLeftInGrace_ = 0;
        } else {
            uint256 timeSinceStart = block.timestamp - user.lockStartTime;
            uint256 fullCycleLength = LOCK_PERIOD + GRACE_PERIOD;
            uint256 positionInCycle = timeSinceStart % fullCycleLength;

            currentCycle = (timeSinceStart / fullCycleLength) + 1;
            locked = positionInCycle < LOCK_PERIOD;
            inGracePeriod = !locked;
            timeUntilUnlock_ = locked ? (LOCK_PERIOD - positionInCycle) : 0;
            timeLeftInGrace_ = inGracePeriod ? (fullCycleLength - positionInCycle) : 0;
        }
    }

    // ====== Admin ======

    function updateRewardPerBlock(uint256 _rewardPerBlock) external onlyOwner {
        updatePool(); // settle up-to-now before changing rate
        rewardPerBlock = _rewardPerBlock;
        emit RewardPerBlockUpdated(_rewardPerBlock);
    }

    function updatePoolLimitPerUser(bool _hasUserLimit, uint256 _poolLimitPerUser) external onlyOwner {
        require(!_hasUserLimit || _poolLimitPerUser > 0, "limit=0");
        hasUserLimit = _hasUserLimit;
        poolLimitPerUser = _poolLimitPerUser;
        emit PoolLimitUpdated(_hasUserLimit, _poolLimitPerUser);
    }

    /// @notice Fund rewards with native (QUAI)
    function addRewards() external payable onlyOwner {
        require(msg.value > 0, "no value");
        // no-op; QUAI held on contract
    }

    /// @notice Withdraw excess rewards ONLY when no one is staked (prevents underfunding).
    function withdrawRewards(uint256 _amount) external onlyOwner {
        require(totalStaked == 0, "active stake");
        require(address(this).balance >= _amount, "insufficient");
        (bool ok, ) = payable(owner()).call{value: _amount}("");
        require(ok, "transfer failed");
    }

    function stopReward() external onlyOwner {
        updatePool(); // accrue until now
        bonusEndBlock = block.number;
        emit StopReward(block.number);
    }

    /// @notice Recover tokens wrongly sent here (not the LP token).
    function recoverWrongTokens(address _tokenAddress, uint256 _tokenAmount) external onlyOwner {
        require(_tokenAddress != address(lpToken), "cannot recover LP");
        IERC20(_tokenAddress).safeTransfer(msg.sender, _tokenAmount);
    }

    // receive native rewards
    receive() external payable {}

    // ====== Internal ======

    function _payReward(address to, uint256 amount) internal {
        require(address(this).balance >= amount, "insufficient rewards");
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "reward transfer failed");
    }
}
