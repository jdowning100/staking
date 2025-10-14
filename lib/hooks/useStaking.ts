import { Contract, JsonRpcProvider, Shard, formatQuai, parseQuai } from 'quais';
import { useContext, useState, useEffect, useCallback } from 'react';
import { StateContext } from '@/store';
// Use the up-to-date ABI from Hardhat artifacts to match the latest contract
import SmartChefNativeArtifact from '@/artifacts/contracts/SmartChefNative.sol/SmartChefNative.json';
const SmartChefNativeABI = (SmartChefNativeArtifact as any).abi;
import { RPC_URL, STAKING_CONTRACT_ADDRESS, LOCK_PERIOD, REWARD_DELAY_PERIOD, EXIT_PERIOD, GRACE_PERIOD, SECONDS_PER_BLOCK } from '@/lib/config';

// Re-export formatQuai for use in other components
export { formatQuai, parseQuai };

// Helper function to format numbers with up to 3 decimals but remove trailing zeros
export function formatBalance(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return parseFloat(num.toFixed(3)).toString();
}


export interface DelayedReward {
  amount: bigint;
  unlockTime: number;
  amountFormatted: string;
  timeUntilUnlock: number;
}

export interface UserStakingInfo {
  stakedAmount: bigint;
  stakedAmountFormatted: string;
  pendingRewards: bigint;
  pendingRewardsFormatted: string;
  claimableRewards: bigint;
  claimableRewardsFormatted: string;
  totalDelayedRewards: bigint;
  totalDelayedRewardsFormatted: string;
  delayedRewards: DelayedReward[];
  lockStartTime: number;
  lockEndTime: number;
  isLocked: boolean;
  isInExitPeriod: boolean;
  canRequestWithdraw: boolean;
  canExecuteWithdraw: boolean;
  withdrawRequestTime: number;
  withdrawalAmount: bigint;
  withdrawalAmountFormatted: string;
  withdrawalAvailableTime: number;
  timeUntilUnlock: number; // in seconds
  timeUntilWithdrawalAvailable: number; // in seconds
  userStatus: string;
}

export interface ContractInfo {
  totalStaked: bigint;
  totalStakedFormatted: string;
  totalInExitPeriod?: bigint;
  totalInExitPeriodFormatted?: string;
  activeStaked?: bigint;
  activeStakedFormatted?: string;
  rewardPerBlock: bigint;
  rewardPerBlockFormatted: string;
  poolLimitPerUser: bigint;
  poolLimitPerUserFormatted: string;
  hasUserLimit: boolean;
  contractBalance: bigint;
  contractBalanceFormatted: string;
  rewardBalance: bigint;
  rewardBalanceFormatted: string;
  apy: number; // default APY (30D)
  apy30?: number;
  apy90?: number;
  currentBlock: number;
  userQuaiBalance: bigint;
  userQuaiBalanceFormatted: string;
}

export function useStaking() {
  const { account, web3Provider } = useContext(StateContext);
  const [userInfo, setUserInfo] = useState<UserStakingInfo | null>(null);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTransacting, setIsTransacting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  // Calculate APY: prefer on-chain estimator (basis points); fall back to 0
  // Default durations updated to 10m and 20m
  const calculateAPYFromContract = async (stakingContract: any, durationSeconds: number = 10 * 60): Promise<number> => {
    try {
      const apyBps: bigint = await stakingContract.getEstimatedAPY(durationSeconds);
      const apy = Number(apyBps) / 100; // basis points -> percent
      return apy;
    } catch {
      return 0;
    }
  };

  // Load contract information (available without wallet connection)
  const loadContractInfo = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, SmartChefNativeABI, provider);

      // Get current block
      const currentBlock = await provider.getBlockNumber(Shard.Cyprus1);

      // Get contract info with error handling
      let totalStaked = BigInt(0);
      let rewardPerBlock = BigInt(0);
      let totalInExitPeriod = BigInt(0);
      let poolLimitPerUser = BigInt(0);
      let hasUserLimit = false;
      let contractBalance = BigInt(0);
      let rewardBalance = BigInt(0);

      try {
        totalStaked = await stakingContract.totalStaked();
      } catch (e) {
        console.warn('Failed to get total staked:', e);
      }

      // Read rewardPerBlock directly from contract
      try {
        rewardPerBlock = await stakingContract.rewardPerBlock();
      } catch (e) {
        console.warn('Failed to get rewardPerBlock:', e);
      }

      try {
        poolLimitPerUser = await stakingContract.poolLimitPerUser();
        hasUserLimit = await stakingContract.hasUserLimit();
      } catch (e) {
        console.warn('Failed to get pool limits:', e);
      }

      try {
        contractBalance = await provider.getBalance(STAKING_CONTRACT_ADDRESS);
      } catch (e) {
        console.warn('Failed to get contract balance:', e);
      }

      try {
        rewardBalance = await stakingContract.getRewardBalance();
      } catch (e) {
        console.warn('Failed to get reward balance:', e);
      }

      // Exit queue amount (to derive active staked)
      try {
        totalInExitPeriod = await stakingContract.totalInExitPeriod();
      } catch (e) {
        console.warn('Failed to get totalInExitPeriod:', e);
      }

      const activeStaked = totalStaked - totalInExitPeriod;

      // Debug: Check actual contract periods
      try {
        const exitPeriod = await stakingContract.EXIT_PERIOD();
        const rewardDelay = await stakingContract.REWARD_DELAY_PERIOD();
        console.log('Contract EXIT_PERIOD:', Number(exitPeriod), 'seconds (', Math.floor(Number(exitPeriod) / 60), 'minutes)');
        console.log('Contract REWARD_DELAY_PERIOD:', Number(rewardDelay), 'seconds (', Math.floor(Number(rewardDelay) / 60), 'minutes)');
      } catch (e) {
        console.warn('Failed to get contract periods:', e);
      }

      // Calculate APY via on-chain estimator (30D and 90D)
      const [apy30, apy90] = await Promise.all([
        calculateAPYFromContract(stakingContract, 10 * 60),
        calculateAPYFromContract(stakingContract, 20 * 60)
      ]);

      // Set contract info
      setContractInfo({
        totalStaked,
        totalStakedFormatted: formatBalance(formatQuai(totalStaked)),
        totalInExitPeriod,
        totalInExitPeriodFormatted: formatBalance(formatQuai(totalInExitPeriod)),
        activeStaked,
        activeStakedFormatted: formatBalance(formatQuai(activeStaked)),
        rewardPerBlock,
        rewardPerBlockFormatted: formatBalance(formatQuai(rewardPerBlock)),
        poolLimitPerUser,
        poolLimitPerUserFormatted: formatBalance(formatQuai(poolLimitPerUser)),
        hasUserLimit,
        contractBalance,
        contractBalanceFormatted: formatBalance(formatQuai(contractBalance)),
        rewardBalance,
        rewardBalanceFormatted: formatBalance(formatQuai(rewardBalance)),
        apy: apy30,
        apy30,
        apy90,
        currentBlock,
        userQuaiBalance: BigInt(0), // Will be set when user info is loaded
        userQuaiBalanceFormatted: '0',
      });
    } catch (error: any) {
      console.error('Failed to load contract info:', error);
      setError('Failed to load staking information. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load user-specific staking information (requires wallet connection)
  const loadStakingInfo = useCallback(async () => {
    if (!account?.addr) {
      // If no account, just load contract info
      loadContractInfo();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, SmartChefNativeABI, provider);

      // Get current block
      const currentBlock = await provider.getBlockNumber(Shard.Cyprus1);

      // Get user's QUAI balance
      const userQuaiBalance = await provider.getBalance(account.addr);

      // Initialize default values for user who hasn't staked
      let stakedAmount = BigInt(0);
      let lockStartTime = 0;
      let pendingRewards = BigInt(0);
      let isLocked = false;
      let timeUntilUnlock = 0;
      
      // Initialize extended user info with defaults
      let extendedInfo = {
        lockEndTime: 0,
        isInExitPeriod: false,
        canRequestWithdraw: false,
        canExecuteWithdraw: false,
        withdrawRequestTime: 0,
        withdrawalAmount: BigInt(0),
        withdrawalAvailableTime: 0,
        timeUntilWithdrawalAvailable: 0,
        userStatus: 'No stake',
        claimableRewards: BigInt(0),
        totalDelayedRewards: BigInt(0),
        delayedRewards: [] as DelayedReward[]
      };

      // These will be corrected after processing virtual rewards
      let finalClaimableAmount = BigInt(0);
      let finalTotalDelayedAmount = BigInt(0);

      try {
        // Get comprehensive user info from new contract
        const userInfoResult = await stakingContract.getUserInfo(account.addr);
        
        if (userInfoResult) {
          stakedAmount = userInfoResult.stakedAmount || BigInt(0);
          lockStartTime = userInfoResult.lockStartTime ? Number(userInfoResult.lockStartTime) : 0;
          extendedInfo.lockEndTime = userInfoResult.lockEndTime ? Number(userInfoResult.lockEndTime) : 0;
          extendedInfo.withdrawRequestTime = userInfoResult.withdrawRequestTime ? Number(userInfoResult.withdrawRequestTime) : 0;
          extendedInfo.withdrawalAmount = userInfoResult.withdrawalAmount || BigInt(0);
          extendedInfo.withdrawalAvailableTime = userInfoResult.withdrawalAvailableTime ? Number(userInfoResult.withdrawalAvailableTime) : 0;
          isLocked = userInfoResult.isLocked || false;
          extendedInfo.isInExitPeriod = userInfoResult.inExitPeriod || false;
          extendedInfo.canRequestWithdraw = userInfoResult.canRequestWithdraw || false;
          extendedInfo.canExecuteWithdraw = userInfoResult.canExecuteWithdraw || false;
          
          // Only get additional info if user has staked
          if (stakedAmount > BigInt(0)) {
            try {
              // Get time-related info
              timeUntilUnlock = Number(await stakingContract.timeUntilUnlock(account.addr));
              extendedInfo.timeUntilWithdrawalAvailable = Number(await stakingContract.timeUntilWithdrawalAvailable(account.addr));
              extendedInfo.userStatus = await stakingContract.getUserStatus(account.addr);
              
              // Get reward information (virtual delayed views)
              // Prefer new view methods if available
              const claimableView = await stakingContract.claimableView(account.addr);
              extendedInfo.claimableRewards = claimableView || BigInt(0);

              const lockedView = await stakingContract.lockedView(account.addr);
              extendedInfo.totalDelayedRewards = lockedView || BigInt(0);

              // Fallbacks to legacy methods if present
              try { pendingRewards = await stakingContract.pendingReward(account.addr); } catch {}
              try {
                const legacyClaimable = await stakingContract.claimableRewards(account.addr);
                if (legacyClaimable && extendedInfo.claimableRewards === BigInt(0)) extendedInfo.claimableRewards = legacyClaimable;
              } catch {}
              try {
                const legacyTotalDelayed = await stakingContract.totalDelayedRewards(account.addr);
                if (legacyTotalDelayed && extendedInfo.totalDelayedRewards === BigInt(0)) extendedInfo.totalDelayedRewards = legacyTotalDelayed;
              } catch {}
              // For virtual delayed rewards system, create synthetic entries for display
              // The contract uses checkpoint-based virtual calculations instead of storing individual entries
              finalClaimableAmount = extendedInfo.claimableRewards;
              finalTotalDelayedAmount = extendedInfo.totalDelayedRewards;
              
              // Workaround: If virtual system returns 0 but user should have claimable rewards,
              const lockedAmount = finalTotalDelayedAmount - finalClaimableAmount;
              extendedInfo.delayedRewards = [];
              
              // Create synthetic entries for display if there are rewards
              if (finalClaimableAmount > BigInt(0)) {
                extendedInfo.delayedRewards.push({
                  amount: finalClaimableAmount,
                  unlockTime: Math.floor(Date.now() / 1000) - 1, // Already unlocked
                  amountFormatted: formatBalance(formatQuai(finalClaimableAmount)),
                  timeUntilUnlock: 0
                });
              }
              
              if (lockedAmount > BigInt(0)) {
                // Estimate unlock time based on reward delay period
                const estimatedUnlockTime = Math.floor(Date.now() / 1000) + REWARD_DELAY_PERIOD;
                extendedInfo.delayedRewards.push({
                  amount: lockedAmount,
                  unlockTime: estimatedUnlockTime,
                  amountFormatted: formatBalance(formatQuai(lockedAmount)),
                  timeUntilUnlock: REWARD_DELAY_PERIOD
                });
              }
              
              console.log('Created synthetic delayed rewards for display:', extendedInfo.delayedRewards);
            } catch (e) {
              console.warn('Failed to get extended user info:', e);
            }
          }
        }
      } catch (error) {
        // User might not have interacted with the contract yet
        console.log('User has not staked yet or contract call failed:', error);
      }

      // Extended info is already populated above

      // Get contract info with error handling
      let totalStaked = BigInt(0);
      let rewardPerBlock = BigInt(0);
      let poolLimitPerUser = BigInt(0);
      let hasUserLimit = false;
      let contractBalance = BigInt(0);
      let rewardBalance = BigInt(0);

      try { totalStaked = await stakingContract.totalStaked(); } catch (e) { console.warn('Failed to get total staked:', e); }
      let totalInExitPeriod = BigInt(0);
      try { totalInExitPeriod = await stakingContract.totalInExitPeriod(); } catch (e) { console.warn('Failed to get totalInExitPeriod:', e); }
      const activeStaked = totalStaked - totalInExitPeriod;

      // Read rewardPerBlock directly from contract
      try {
        rewardPerBlock = await stakingContract.rewardPerBlock();
      } catch (e) {
        console.warn('Failed to get rewardPerBlock:', e);
      }

      try {
        poolLimitPerUser = await stakingContract.poolLimitPerUser();
        hasUserLimit = await stakingContract.hasUserLimit();
      } catch (e) {
        console.warn('Failed to get pool limits:', e);
      }

      try {
        contractBalance = await provider.getBalance(STAKING_CONTRACT_ADDRESS);
      } catch (e) {
        console.warn('Failed to get contract balance:', e);
      }

      try {
        rewardBalance = await stakingContract.getRewardBalance();
      } catch (e) {
        console.warn('Failed to get reward balance:', e);
      }

      // Debug: Check actual contract periods
      try {
        const exitPeriod = await stakingContract.EXIT_PERIOD();
        const rewardDelay = await stakingContract.REWARD_DELAY_PERIOD();
        console.log('Contract EXIT_PERIOD:', Number(exitPeriod), 'seconds (', Math.floor(Number(exitPeriod) / 60), 'minutes)');
        console.log('Contract REWARD_DELAY_PERIOD:', Number(rewardDelay), 'seconds (', Math.floor(Number(rewardDelay) / 60), 'minutes)');
      } catch (e) {
        console.warn('Failed to get contract periods:', e);
      }

      // Calculate APY via on-chain estimator (30D and 90D)
      const [apy30, apy90] = await Promise.all([
        calculateAPYFromContract(stakingContract, 10 * 60),
        calculateAPYFromContract(stakingContract, 20 * 60)
      ]);

      // Set user info
      setUserInfo({
        stakedAmount,
        stakedAmountFormatted: formatBalance(formatQuai(stakedAmount)),
        pendingRewards,
        pendingRewardsFormatted: formatBalance(formatQuai(pendingRewards)),
        claimableRewards: finalClaimableAmount,
        claimableRewardsFormatted: formatBalance(formatQuai(finalClaimableAmount)),
        totalDelayedRewards: finalTotalDelayedAmount,
        totalDelayedRewardsFormatted: formatBalance(formatQuai(finalTotalDelayedAmount)),
        delayedRewards: extendedInfo.delayedRewards,
        lockStartTime,
        lockEndTime: extendedInfo.lockEndTime,
        isLocked,
        isInExitPeriod: extendedInfo.isInExitPeriod,
        canRequestWithdraw: extendedInfo.canRequestWithdraw,
        canExecuteWithdraw: extendedInfo.canExecuteWithdraw,
        withdrawRequestTime: extendedInfo.withdrawRequestTime,
        withdrawalAmount: extendedInfo.withdrawalAmount,
        withdrawalAmountFormatted: formatBalance(formatQuai(extendedInfo.withdrawalAmount)),
        withdrawalAvailableTime: extendedInfo.withdrawalAvailableTime,
        timeUntilUnlock,
        timeUntilWithdrawalAvailable: extendedInfo.timeUntilWithdrawalAvailable,
        userStatus: extendedInfo.userStatus,
      });

      // Set contract info
      setContractInfo({
        totalStaked,
        totalStakedFormatted: formatBalance(formatQuai(totalStaked)),
        totalInExitPeriod,
        totalInExitPeriodFormatted: formatBalance(formatQuai(totalInExitPeriod)),
        activeStaked,
        activeStakedFormatted: formatBalance(formatQuai(activeStaked)),
        rewardPerBlock,
        rewardPerBlockFormatted: formatBalance(formatQuai(rewardPerBlock)),
        poolLimitPerUser,
        poolLimitPerUserFormatted: formatBalance(formatQuai(poolLimitPerUser)),
        hasUserLimit,
        contractBalance,
        contractBalanceFormatted: formatBalance(formatQuai(contractBalance)),
        rewardBalance,
        rewardBalanceFormatted: formatBalance(formatQuai(rewardBalance)),
        apy: apy30,
        apy30,
        apy90,
        currentBlock,
        userQuaiBalance,
        userQuaiBalanceFormatted: formatBalance(formatQuai(userQuaiBalance)),
      });
    } catch (error: any) {
      console.error('Failed to load staking info:', error);
      setError('Failed to load staking information. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [account, loadContractInfo]);

  // Deposit tokens
  const deposit = useCallback(async (amount: string, durationSeconds: number = 10 * 60) => {
    if (!account?.addr || !web3Provider) {
      setError('Please connect your wallet');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setIsTransacting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const signer = await web3Provider.getSigner();
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, SmartChefNativeABI, signer);

      const depositAmount = parseQuai(amount);

      // Check user balance
      if (contractInfo && depositAmount > contractInfo.userQuaiBalance) {
        throw new Error('Insufficient balance');
      }

      // Check pool limit if applicable
      if (contractInfo?.hasUserLimit && userInfo) {
        const newTotal = userInfo.stakedAmount + depositAmount;
        if (newTotal > contractInfo.poolLimitPerUser) {
          throw new Error(`Deposit would exceed pool limit of ${contractInfo.poolLimitPerUserFormatted} QUAI`);
        }
      }

      // Send deposit transaction with duration and value
      const tx = await stakingContract.deposit(durationSeconds, {
        value: depositAmount,
        gasLimit: 500000
      });
      setTransactionHash(tx.hash);

      // Wait for confirmation
      await tx.wait();

      // Reload staking info
      await loadStakingInfo();
    } catch (error: any) {
      console.error('Deposit failed:', error);
      setError(error.message || 'Deposit failed. Please try again.');
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, contractInfo, userInfo, loadStakingInfo]);

  // Request withdrawal (starts exit period)
  const requestWithdraw = useCallback(async (amount: string) => {
    if (!account?.addr || !web3Provider) {
      setError('Please connect your wallet');
      return;
    }

    if (!userInfo) {
      setError('No staking information available');
      return;
    }

    if (!userInfo.canRequestWithdraw) {
      setError('Cannot request withdrawal at this time.');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setIsTransacting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const signer = await web3Provider.getSigner();
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, SmartChefNativeABI, signer);

      const withdrawAmount = parseQuai(amount);

      // Check staked amount
      if (withdrawAmount > userInfo.stakedAmount) {
        throw new Error('Insufficient staked amount');
      }

      // Send request withdraw transaction
      const tx = await stakingContract.requestWithdraw(withdrawAmount, { gasLimit: 500000 });
      setTransactionHash(tx.hash);

      // Wait for confirmation
      await tx.wait();

      // Reload staking info
      await loadStakingInfo();
    } catch (error: any) {
      console.error('Request withdraw failed:', error);
      setError(error.message || 'Request withdraw failed. Please try again.');
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, userInfo, loadStakingInfo]);

  // Execute withdrawal (after exit period)
  const executeWithdraw = useCallback(async () => {
    if (!account?.addr || !web3Provider) {
      setError('Please connect your wallet');
      return;
    }

    if (!userInfo) {
      setError('No staking information available');
      return;
    }

    if (!userInfo.canExecuteWithdraw) {
      setError('Exit period not finished yet.');
      return;
    }

    setIsTransacting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const signer = await web3Provider.getSigner();
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, SmartChefNativeABI, signer);

      // Send execute withdraw transaction
      const tx = await stakingContract.executeWithdraw({ gasLimit: 500000 });
      setTransactionHash(tx.hash);

      // Wait for confirmation
      await tx.wait();

      // Reload staking info
      await loadStakingInfo();
    } catch (error: any) {
      console.error('Execute withdraw failed:', error);
      setError(error.message || 'Execute withdraw failed. Please try again.');
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, userInfo, loadStakingInfo]);

  // Cancel withdrawal request
  const cancelWithdraw = useCallback(async () => {
    if (!account?.addr || !web3Provider) {
      setError('Please connect your wallet');
      return;
    }

    if (!userInfo || !userInfo.isInExitPeriod) {
      setError('No withdrawal request to cancel');
      return;
    }

    setIsTransacting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const signer = await web3Provider.getSigner();
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, SmartChefNativeABI, signer);

      // Send cancel withdraw transaction
      const tx = await stakingContract.cancelWithdraw({ gasLimit: 300000 });
      setTransactionHash(tx.hash);

      // Wait for confirmation
      await tx.wait();

      // Reload staking info
      await loadStakingInfo();
    } catch (error: any) {
      console.error('Cancel withdraw failed:', error);
      setError(error.message || 'Cancel withdraw failed. Please try again.');
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, userInfo, loadStakingInfo]);

  // Claim rewards (now claims claimable delayed rewards)
  const claimRewards = useCallback(async () => {
    if (!account?.addr || !web3Provider) {
      setError('Please connect your wallet');
      return;
    }

    if (!userInfo || (userInfo.claimableRewards === BigInt(0) && userInfo.pendingRewards === BigInt(0))) {
      setError('No rewards to claim');
      return;
    }

    setIsTransacting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const signer = await web3Provider.getSigner();
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, SmartChefNativeABI, signer);

      // Get balance before claim
      const balanceBefore = await web3Provider.getBalance(account.addr);
      const claimableBeforeClaim = userInfo.claimableRewards;
      
      // Check contract reward balance
      const contractRewardBalance = await stakingContract.getRewardBalance();
      
      console.log('Claim transaction debug:', {
        userAddress: account.addr,
        balanceBefore: formatQuai(balanceBefore),
        claimableAmount: formatQuai(claimableBeforeClaim),
        contractRewardBalance: formatQuai(contractRewardBalance),
        contractAddress: STAKING_CONTRACT_ADDRESS
      });

      // Send claim transaction (this will add pending rewards to delayed and claim claimable)
      const tx = await stakingContract.claimRewards({ gasLimit: 500000 });
      setTransactionHash(tx.hash);
      
      console.log('Claim transaction sent:', tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();
      
      console.log('Claim transaction confirmed:', {
        txHash: tx.hash,
        status: receipt.status,
        gasUsed: receipt.gasUsed?.toString(),
        blockNumber: receipt.blockNumber
      });

      // Parse events to see if RewardClaimed was emitted
      // Optional: parse logs if available (best-effort)
      try {
        const found = receipt.logs?.some((log: any) => {
          try {
            const parsed = stakingContract.interface.parseLog(log);
            if (parsed && parsed.name === 'RewardClaimed') {
              console.log('RewardClaimed event found:', {
                user: parsed.args?.user,
                amount: formatQuai(parsed.args?.amount || 0)
              });
              return true;
            }
            return false;
          } catch {
            return false;
          }
        });
        if (!found) console.warn('No RewardClaimed event found in transaction receipt');
      } catch (e) {
        console.warn('Log parsing skipped:', e);
      }

      // Check balance after claim
      const balanceAfter = await web3Provider.getBalance(account.addr);
      const balanceChange = balanceAfter - balanceBefore;
      
      console.log('Balance change after claim:', {
        balanceBefore: formatQuai(balanceBefore),
        balanceAfter: formatQuai(balanceAfter),
        balanceChange: formatQuai(balanceChange),
        expectedClaimAmount: formatQuai(claimableBeforeClaim)
      });

      // Reload staking info
      await loadStakingInfo();
    } catch (error: any) {
      console.error('Claim failed:', error);
      setError(error.message || 'Claim failed. Please try again.');
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, userInfo, loadStakingInfo]);

  // Note: Emergency withdraw has been removed from the new contract

  // Refresh rewards periodically: update pending, claimable, and delayed totals
  const refreshRewards = useCallback(async () => {
    if (!account?.addr || !userInfo || userInfo.stakedAmount === BigInt(0)) return;

    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, SmartChefNativeABI, provider);

      const [pendingRewards, claimable, locked] = await Promise.all([
        stakingContract.pendingReward(account.addr),
        stakingContract.claimableView(account.addr).catch(() => BigInt(0)),
        stakingContract.lockedView(account.addr).catch(() => BigInt(0)),
      ]);

      // Rebuild synthetic delayed entries for display
      const syntheticDelayed: DelayedReward[] = [];
      if (claimable > BigInt(0)) {
        syntheticDelayed.push({
          amount: claimable,
          unlockTime: Math.floor(Date.now() / 1000) - 1,
          amountFormatted: formatBalance(formatQuai(claimable)),
          timeUntilUnlock: 0,
        });
      }
      const lockedPortion = locked > claimable ? (locked - claimable) : BigInt(0);
      if (lockedPortion > BigInt(0)) {
        syntheticDelayed.push({
          amount: lockedPortion,
          unlockTime: Math.floor(Date.now() / 1000) + REWARD_DELAY_PERIOD,
          amountFormatted: formatBalance(formatQuai(lockedPortion)),
          timeUntilUnlock: REWARD_DELAY_PERIOD,
        });
      }

      setUserInfo(prev => prev ? {
        ...prev,
        pendingRewards,
        pendingRewardsFormatted: formatBalance(formatQuai(pendingRewards)),
        claimableRewards: claimable,
        claimableRewardsFormatted: formatBalance(formatQuai(claimable)),
        totalDelayedRewards: locked,
        totalDelayedRewardsFormatted: formatBalance(formatQuai(locked)),
        delayedRewards: syntheticDelayed,
      } : null);
    } catch (error) {
      console.warn('Failed to refresh rewards:', error);
    }
  }, [account, userInfo?.stakedAmount]);

  // Refresh all data
  const refreshData = useCallback(() => {
    loadStakingInfo();
  }, [loadStakingInfo]);

  // Load staking info on mount and when wallet connection changes
  useEffect(() => {
    // Always load staking info (will load contract info if no wallet, or full info if wallet connected)
    loadStakingInfo();
    // No polling - only refresh after transactions
    
    // Clear user info if no account connected
    if (!account?.addr) {
      setUserInfo(null);
    }
  }, [account, loadStakingInfo]);

  // Optionally update pending rewards periodically (lightweight)
  useEffect(() => {
    if (!userInfo || userInfo.stakedAmount === BigInt(0)) return;

    // Update rewards every 30 seconds if user has stake
    const rewardsInterval = setInterval(refreshRewards, 30000);
    return () => clearInterval(rewardsInterval);
  }, [userInfo?.stakedAmount, refreshRewards]);

  return {
    userInfo,
    contractInfo,
    isLoading,
    isTransacting,
    error,
    transactionHash,
    deposit,
    requestWithdraw,
    executeWithdraw,
    cancelWithdraw,
    claimRewards,
    refreshData,
    refreshRewards,
  };
}
