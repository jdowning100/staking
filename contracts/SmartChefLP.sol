// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * SmartChefLP — Sliding-window vesting (checkpoint ring) + lock boosts.
 *
 * Rewards stream into accTokenPerShare every block, capped by available funds (native).
 * Users see:
 *   - claimable = E * (accPS_at(block - delay) - baseline) / PRECISION  (+ any unlocked exit snapshot)
 *   - locked    = E * (accPS_now - accPS_at(block - delay)) / PRECISION (+ any locked exit snapshot)
 *
 * Checkpoints store {block, accPS, rate}; rate = rewardPerBlock * PRECISION / totalActiveEffective
 * and is pushed on every *rate change*:
 *   - deposit / requestWithdraw / cancelWithdraw / emergencyWithdraw (denominator changes)
 *   - setRewardPerBlock / setBaseAPY / timelocked execute (numerator changes)
 *   - transition into active==0 pushes zero-rate checkpoint
 *
 * No early exits; withdraw requests only after lock ends. The exiting slice’s still-delayed
 * pipeline is snapshotted into (delayedReward, delayedUnlockBlock).
 *
 * LP principal is ERC20; rewards are paid in native token (e.g. ETH).
 */
contract SmartChefLP is Ownable, ReentrancyGuard, Pausable {
  using SafeERC20 for IERC20;

  // =========================
  // User data
  // =========================
  struct UserInfo {
    uint256 amount;               // LP principal currently earning (excludes amount moved to exit)
    uint256 effectiveAmount;      // amount * boost / 1e18
    uint256 rewardDebt;           // for pendingReward() view
    uint256 debtClaimablePS;      // baseline for sliding-window claimable

    // lock
    uint256 lockStartTime;        // timestamp when current lock began
    uint256 lockDuration;         // chosen lock duration in seconds

    // exit flow
    uint256 withdrawRequestTime;  // timestamp when exit requested (0 if none)
    uint256 withdrawalAmount;     // principal requested to withdraw (LP)

    // snapshot of still-delayed rewards for exiting slice
    uint256 delayedReward;        // fixed sum unlocking at delayedUnlockBlock
    uint256 delayedUnlockBlock;   // block when delayedReward becomes claimable
  }

  // =========================
  // Checkpoint ring
  // =========================
  struct Checkpoint { 
    uint64  blockNum; 
    uint256 acc;     // accTokenPerShare at checkpoint
    uint256 rate;    // per-block acc delta: rewardPerBlock * PRECISION / totalActiveEffective
  }
  uint16 internal constant MAX_CHECKPOINTS = 256;
  mapping(uint16 => Checkpoint) internal _checkpoints;
  uint16 internal _cpHead;     // last written index
  uint16 internal _cpSize;     // number of valid checkpoints

  // =========================
  // Config
  // =========================
  IERC20  public lpToken;

  // periods (seconds)
  uint256 public REWARD_DELAY_PERIOD = 10 minutes;
  uint256 public EXIT_PERIOD         = 10 minutes;

  // emission + timeline
  uint256 public rewardPerBlock;
  uint256 public startBlock;
  uint256 public lastRewardBlock;

  // accounting
  bool    public hasUserLimit;
  uint256 public poolLimitPerUser;
  uint256 public constant PRECISION_FACTOR = 1e12; // per-share precision
  uint256 public accTokenPerShare;        // accumulated rewards per effective share
  uint256 public totalStaked;             // total LP principal (includes exit)
  uint256 public totalActiveEffective;    // sum of effective amounts currently earning
  uint256 public totalInExitPeriod;       // principal requested for withdraw (not earning)
  uint256 public totalAccruedRewards;     // streamed into accPS (native)
  uint256 public totalClaimedRewards;     // paid out (native)

  // block time (seconds) to translate REWARD_DELAY_PERIOD into blocks for the sliding window
  uint256 public blockTime = 5;

  // Param timelock (24h)
  uint256 public constant PARAM_CHANGE_DELAY = 24 hours;
  struct PendingChange { uint256 value; uint256 executeAfter; }
  mapping(bytes32 => PendingChange) public pendingChanges;

  mapping(address => UserInfo) public userInfo;

  // Permanent freeze flag (irreversible pause)
  bool private _permanentlyFrozen;

  // =========================
  // Events
  // =========================
  event Deposit(address indexed user, uint256 amount, uint256 duration);
  event WithdrawRequested(address indexed user, uint256 amount, uint256 availableTime);
  event WithdrawExecuted(address indexed user, uint256 amount);
  event RewardClaimed(address indexed user, uint256 amount);
  event RewardsFunded(uint256 amount);
  event NewRewardPerBlock(uint256 rewardPerBlock);
  event NewPoolLimit(uint256 poolLimitPerUser);
  event AdminTokenRecovery(address tokenRecovered, uint256 amount);
  event BlockTimeUpdated(uint256 oldBlockTime, uint256 newBlockTime);
  event PeriodsUpdated(uint256 rewardDelayPeriod, uint256 exitPeriod);
  event ParameterChangeScheduled(bytes32 indexed paramHash, uint256 value, uint256 executeAfter);
  event ParameterChangeExecuted(bytes32 indexed paramHash, uint256 value);
  event ParameterChangeCancelled(bytes32 indexed paramHash);
  event FrozenPermanently();

  // =========================
  // Constructor
  // =========================
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

    // initial checkpoint (rate==0 because totalActiveEffective==0)
    _pushCheckpoint(uint64(block.number), 0, 0);
  }

  // =========================
  // Freeze controls
  // =========================
  function freezePermanently() external onlyOwner {
    _pause();
    _permanentlyFrozen = true;
    emit FrozenPermanently();
  }
  function _unpause() internal override {
    require(!_permanentlyFrozen, "Contract is permanently frozen");
    super._unpause();
  }
  function isPermanentlyFrozen() external view returns (bool) { return _permanentlyFrozen; }

  // =========================
  // Helpers
  // =========================
  function _getBoostMultiplier(uint256 _duration) internal pure returns (uint256) {
    if (_duration == 10 minutes) return 1e18;                // 1.0x
    if (_duration == 20 minutes) return 1500000000000000000; // 1.5x
    revert("Invalid duration");
  }
  function _activePrincipal() internal view returns (uint256) {
    return totalStaked - totalInExitPeriod;
  }
  function _rewardBalance() internal view returns (uint256) {
    // Rewards are native; LP principal is ERC20 and tracked in totalStaked (not mixed with native)
    return address(this).balance;
  }
  function _safeTransferNative(address _to, uint256 _amount) internal {
    (bool success, ) = _to.call{ value: _amount }("");
    require(success, "Native transfer failed");
  }

  // =========================
  // Core staking
  // =========================
  function deposit(uint256 _amount, uint256 _duration) external nonReentrant whenNotPaused {
    require(_amount > 0, "Zero deposit");
    UserInfo storage user = userInfo[msg.sender];
    require(user.withdrawRequestTime == 0, "In exit period");

    // duration rules
    uint256 mult = _getBoostMultiplier(_duration);
    if (user.amount > 0) {
      require(_duration == user.lockDuration, "Duration mismatch");
    }
    if (hasUserLimit) {
      require(_amount + user.amount <= poolLimitPerUser, "Above limit");
    }

    _updatePool();

    if (user.amount > 0) {
      // settle matured pipeline for current effective
      _claimRewardsInternal(msg.sender, 0);
    } else {
      // first deposit baseline
      user.debtClaimablePS = accTokenPerShare;
      user.lockDuration = _duration;
    }

    // pull LP
    lpToken.safeTransferFrom(msg.sender, address(this), _amount);

    // principal
    user.amount     += _amount;
    totalStaked     += _amount;

    // effective
    uint256 addEff  = Math.mulDiv(_amount, mult, 1e18);
    user.effectiveAmount   += addEff;
    totalActiveEffective   += addEff;

    // (re)start lock
    user.lockStartTime = block.timestamp;

    // sync debt for pending view
    user.rewardDebt = Math.mulDiv(user.effectiveAmount, accTokenPerShare, PRECISION_FACTOR);

    // rate changed (denominator) -> push checkpoint
    uint256 newRate = totalActiveEffective == 0 ? 0
      : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
    _pushCheckpoint(uint64(block.number), accTokenPerShare, newRate);

    emit Deposit(msg.sender, _amount, _duration);
  }

  function requestWithdraw(uint256 _amount) external nonReentrant whenNotPaused {
    UserInfo storage user = userInfo[msg.sender];
    require(_amount > 0 && user.amount >= _amount, "Bad amount");
    require(user.lockStartTime > 0, "No active stake");
    require(user.withdrawRequestTime == 0, "Already requested");
    require(block.timestamp >= user.lockStartTime + user.lockDuration, "Stake locked"); // no early exit

    _updatePool();

    // settle matured for currently active slice
    _claimRewardsInternal(msg.sender, 0);

    // snapshot still-delayed portion for exiting amount
    uint256 delayBlocks = REWARD_DELAY_PERIOD / blockTime;
    uint256 tBlock = block.number > delayBlocks ? block.number - delayBlocks : 0;
    uint256 accPast = _accPSAtBlock(uint64(tBlock));
    uint256 deltaPS = accTokenPerShare - accPast;
    if (deltaPS > 0) {
      uint256 exitEff = Math.mulDiv(_amount, _getBoostMultiplier(user.lockDuration), 1e18);
      uint256 exitLocked = Math.mulDiv(exitEff, deltaPS, PRECISION_FACTOR);
      user.delayedReward      += exitLocked;
      user.delayedUnlockBlock  = block.number + delayBlocks;
    }

    // remove from effective denominator now
    uint256 exitEffective = Math.mulDiv(_amount, _getBoostMultiplier(user.lockDuration), 1e18);
    user.effectiveAmount   -= exitEffective;
    totalActiveEffective   -= exitEffective;

    // mark exit principal (not earning)
    user.withdrawRequestTime = block.timestamp;
    user.withdrawalAmount    = _amount;
    totalInExitPeriod       += _amount;

    // sync rewardDebt for remaining active
    user.rewardDebt = Math.mulDiv(user.effectiveAmount, accTokenPerShare, PRECISION_FACTOR);

    // rate changed (denominator) -> push checkpoint
    uint256 newRate = totalActiveEffective == 0 ? 0
      : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
    _pushCheckpoint(uint64(block.number), accTokenPerShare, newRate);

    emit WithdrawRequested(msg.sender, _amount, block.timestamp + EXIT_PERIOD);
  }

  function executeWithdraw() external nonReentrant whenNotPaused {
    _claimRewardsInternal(msg.sender, 0); // auto-claim matured + unlocked snapshot
    UserInfo storage user = userInfo[msg.sender];
    require(user.withdrawRequestTime > 0, "No request");
    require(block.timestamp >= user.withdrawRequestTime + EXIT_PERIOD, "Exit not finished");

    uint256 amt = user.withdrawalAmount;
    require(amt > 0, "No amount");

    // principal leaves
    totalInExitPeriod -= amt;
    totalStaked       -= amt;

    // clear request
    user.withdrawRequestTime = 0;
    user.withdrawalAmount    = 0;

    // adjust user's principal state
    if (user.amount == amt) {
      user.amount          = 0;
      user.lockStartTime   = 0;
      user.lockDuration    = 0;
      user.debtClaimablePS = 0;
    } else {
      user.amount -= amt;
    }

    // effective already reduced at request time; keep debt synced
    user.rewardDebt = Math.mulDiv(user.effectiveAmount, accTokenPerShare, PRECISION_FACTOR);

    lpToken.safeTransfer(msg.sender, amt);
    emit WithdrawExecuted(msg.sender, amt);
  }

  function cancelWithdraw() external nonReentrant whenNotPaused {
    UserInfo storage user = userInfo[msg.sender];
    require(user.withdrawRequestTime > 0, "No request");

    _updatePool();
    _claimRewardsInternal(msg.sender, 0);

    // restore effective
    uint256 addEff = Math.mulDiv(user.withdrawalAmount, _getBoostMultiplier(user.lockDuration), 1e18);
    user.effectiveAmount += addEff;
    totalActiveEffective += addEff;

    // clear exit flags
    totalInExitPeriod       -= user.withdrawalAmount;
    user.withdrawRequestTime = 0;
    user.withdrawalAmount    = 0;

    // void snapshot to prevent double counting
    user.delayedReward      = 0;
    user.delayedUnlockBlock = 0;

    // sync debt
    user.rewardDebt = Math.mulDiv(user.effectiveAmount, accTokenPerShare, PRECISION_FACTOR);

    // rate changed (denominator) -> push checkpoint
    uint256 newRate = totalActiveEffective == 0 ? 0
      : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
    _pushCheckpoint(uint64(block.number), accTokenPerShare, newRate);
  }

  /**
   * Emergency withdrawal: user pulls LP principal (no rewards) when paused.
   */
  function emergencyWithdraw() external nonReentrant whenPaused {
    UserInfo storage user = userInfo[msg.sender];
    uint256 amt = user.amount + user.withdrawalAmount;
    require(amt > 0, "No funds");

    // update globals
    totalStaked         -= user.amount;
    totalActiveEffective -= user.effectiveAmount;
    totalInExitPeriod   -= user.withdrawalAmount;

    // wipe user
    user.amount = 0;
    user.effectiveAmount = 0;
    user.rewardDebt = 0;
    user.debtClaimablePS = 0;
    user.lockStartTime = 0;
    user.lockDuration = 0;
    user.withdrawRequestTime = 0;
    user.withdrawalAmount = 0;
    user.delayedReward = 0;
    user.delayedUnlockBlock = 0;

    // rate changed (denominator) -> push checkpoint (even while paused)
    uint256 newRate = totalActiveEffective == 0 ? 0
      : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
    _pushCheckpoint(uint64(block.number), accTokenPerShare, newRate);

    lpToken.safeTransfer(msg.sender, amt);
    emit WithdrawExecuted(msg.sender, amt);
  }

  // =========================
  // Rewards
  // =========================
  function claimRewards() external nonReentrant whenNotPaused {
    _claimRewardsInternal(msg.sender, 0);
  }
  function claimRewardsWithSlippage(uint256 minReward) external nonReentrant whenNotPaused {
    _claimRewardsInternal(msg.sender, minReward);
  }

  function _claimRewardsInternal(address _user, uint256 minReward) internal {
    UserInfo storage user = userInfo[_user];

    // sliding-window frontier at (block - delay)
    uint256 delayBlocks = REWARD_DELAY_PERIOD / blockTime;
    uint256 tBlock = block.number > delayBlocks ? block.number - delayBlocks : 0;
    uint256 accPast = _accPSAtBlock(uint64(tBlock));

    // virtual owed since baseline
    uint256 baseline = user.debtClaimablePS;
    uint256 virtualOwed = 0;
    if (user.effectiveAmount > 0 && accPast > baseline) {
      virtualOwed = Math.mulDiv(user.effectiveAmount, (accPast - baseline), PRECISION_FACTOR);
    }

    _updatePool();

    uint256 owed = virtualOwed;

    // add exit snapshot if unlocked
    if (user.delayedUnlockBlock > 0 && block.number >= user.delayedUnlockBlock) {
      owed += user.delayedReward;
      user.delayedReward = 0;
      user.delayedUnlockBlock = 0;
    }

    uint256 budget = _rewardBalance();
    uint256 pay = owed <= budget ? owed : budget;

    require(pay >= minReward, "Slippage: reward too low");

    if (pay > 0) {
      _safeTransferNative(_user, pay);
      totalClaimedRewards += pay;
      emit RewardClaimed(_user, pay);
    }

    // advance baseline proportionally if partial
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

    // keep pending baseline in sync
    user.rewardDebt = Math.mulDiv(user.effectiveAmount, accTokenPerShare, PRECISION_FACTOR);
  }

  // =========================
  // Views
  // =========================
  function pendingReward(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    if (user.withdrawRequestTime != 0) return 0;

    uint256 adjusted = _accPSNowView(); // budget-aware projection
    uint256 earned   = Math.mulDiv(user.effectiveAmount, adjusted, PRECISION_FACTOR);
    if (earned >= user.rewardDebt) return earned - user.rewardDebt;
    return 0;
  }

  // claimable now (past-the-delay) + any unlocked exit snapshot
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
      owed += Math.mulDiv(E, (accPast - baseline), PRECISION_FACTOR);
    }
    return owed;
  }

  // streamed but still locked + any locked exit snapshot
  function lockedView(address _user) external view returns (uint256) {
    UserInfo storage user = userInfo[_user];
    uint256 locked = 0;

    if (user.delayedUnlockBlock > 0 && block.number < user.delayedUnlockBlock) {
      locked += user.delayedReward;
    }

    uint256 E = user.effectiveAmount;
    if (E == 0) return locked;

    uint256 accNow  = _accPSNowView();
    uint256 delayBlocks = REWARD_DELAY_PERIOD / blockTime;
    uint256 tBlock  = block.number > delayBlocks ? block.number - delayBlocks : 0;
    uint256 accPast = _accPSAtBlock(uint64(tBlock));
    if (accNow > accPast) {
      locked += Math.mulDiv(E, (accNow - accPast), PRECISION_FACTOR);
    }
    return locked;
  }

  // =========================
  // Reward accounting + checkpoints
  // =========================
  function _updatePool() internal {
    if (block.number <= lastRewardBlock) return;

    uint256 active = totalActiveEffective;

    // push zero-rate checkpoint when active==0 to avoid stale projections
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

    uint256 undistributed = totalAccruedRewards > totalClaimedRewards
      ? (totalAccruedRewards - totalClaimedRewards) : 0;
    uint256 currentRewards = _rewardBalance();
    uint256 allocCap = currentRewards > undistributed ? (currentRewards - undistributed) : 0;
    if (toAlloc > allocCap) toAlloc = allocCap;

    if (toAlloc > 0) {
      uint256 prec = PRECISION_FACTOR;
      while (toAlloc > 0 && prec > 0 && toAlloc > type(uint256).max / prec) { prec /= 10; }
      accTokenPerShare += Math.mulDiv(toAlloc, prec, active);
      totalAccruedRewards += toAlloc;
    }
    lastRewardBlock = block.number;
  }

  // budget-aware projection to "now" (mirrors _updatePool cap)
  function _accPSNowView() internal view returns (uint256) {
    if (_cpSize == 0) return accTokenPerShare;

    (bool ok, ) = _findPrevCp(uint64(block.number));
    if (!ok) return accTokenPerShare;

    uint256 active = totalActiveEffective;
    if (active == 0) return accTokenPerShare;
    if (block.number <= lastRewardBlock) return accTokenPerShare;

    uint256 deltaBlocks = block.number - lastRewardBlock;
    if (deltaBlocks == 0) return accTokenPerShare;

    uint256 toAlloc = rewardPerBlock * deltaBlocks;

    uint256 undistributed = totalAccruedRewards > totalClaimedRewards
      ? (totalAccruedRewards - totalClaimedRewards) : 0;
    uint256 currentRewards = _rewardBalance();
    uint256 allocCap = currentRewards > undistributed ? (currentRewards - undistributed) : 0;
    if (toAlloc > allocCap) toAlloc = allocCap;
    if (toAlloc == 0) return accTokenPerShare;

    uint256 prec = PRECISION_FACTOR;
    while (toAlloc > 0 && prec > 0 && toAlloc > type(uint256).max / prec) { prec /= 10; }

    return accTokenPerShare + Math.mulDiv(toAlloc, prec, active);
  }

  // piece-wise integrate across checkpoints up to targetBlock
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

  function _pushCheckpoint(uint64 blockNum, uint256 acc, uint256 rate) internal {
    uint16 next = _cpHead + 1;
    if (next >= MAX_CHECKPOINTS) next = 0;
    _checkpoints[next] = Checkpoint({ blockNum: blockNum, acc: acc, rate: rate });
    _cpHead = next;
    if (_cpSize < MAX_CHECKPOINTS) _cpSize++;
  }

  // =========================
  // Admin (with timelock helpers)
  // =========================
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

    // checkpoint on numerator change
    uint256 newRate = totalActiveEffective == 0 ? 0
      : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
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
    require(_tokenAddress != address(lpToken), "Cannot recover LP");
    IERC20(_tokenAddress).safeTransfer(msg.sender, _tokenAmount);
    emit AdminTokenRecovery(_tokenAddress, _tokenAmount);
  }

  // Owner: withdraw excess native rewards (does not touch LP principal)
  function emergencyRewardWithdraw(uint256 _amount) external onlyOwner {
    _updatePool(); // settle accPS
    uint256 rb = _rewardBalance();
    require(_amount <= rb, "Cannot withdraw principal");
    _safeTransferNative(msg.sender, _amount);
  }

  // Set rewardPerBlock from APY (bps) over ACTIVE PRINCIPAL (mirrors SmartChefNative)
  function setBaseAPY(uint256 _apyBps) external onlyOwner {
    _updatePool();
    require(_apyBps <= 1_000_000, "APY too high"); // up to 10,000% APR

    uint256 activePrincipal = _activePrincipal();
    uint256 blocksPerYear   = 365 days / blockTime;

    if (activePrincipal == 0) revert("No active principal - use setRewardPerBlock");

    rewardPerBlock = Math.mulDiv(activePrincipal, _apyBps, (blocksPerYear * 10000));

    // checkpoint on numerator change
    uint256 newRate = totalActiveEffective == 0 ? 0
      : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
    _pushCheckpoint(uint64(block.number), accTokenPerShare, newRate);

    emit NewRewardPerBlock(rewardPerBlock);
  }

  // Direct control of emission
  function setRewardPerBlock(uint256 _rewardPerBlock) external onlyOwner {
    _updatePool();
    rewardPerBlock = _rewardPerBlock;

    // checkpoint on numerator change
    uint256 newRate = totalActiveEffective == 0 ? 0
      : Math.mulDiv(rewardPerBlock, PRECISION_FACTOR, totalActiveEffective);
    _pushCheckpoint(uint64(block.number), accTokenPerShare, newRate);

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
    require(msg.value > 0, "No value");
    emit RewardsFunded(msg.value);
  }

  // =========================
  // Misc
  // =========================
  function updatePool() external { _updatePool(); }

  receive() external payable {
    if (msg.value > 0) emit RewardsFunded(msg.value);
  }
  fallback() external payable {
    if (msg.value > 0) emit RewardsFunded(msg.value);
  }
}