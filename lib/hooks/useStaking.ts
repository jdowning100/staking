import { Contract, JsonRpcProvider, Shard, formatQuai, parseQuai } from 'quais';
import { useContext, useState, useEffect, useCallback } from 'react';
import { StateContext } from '@/store';
import SmartChefNativeABI from '@/lib/SmartChefNative.json';
import { RPC_URL, STAKING_CONTRACT_ADDRESS, LOCK_PERIOD, GRACE_PERIOD, SECONDS_PER_BLOCK } from '@/lib/config';

// Re-export formatQuai for use in other components
export { formatQuai, parseQuai };

// Helper function to format numbers with up to 3 decimals but remove trailing zeros
export function formatBalance(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return parseFloat(num.toFixed(3)).toString();
}

export interface UserStakingInfo {
  stakedAmount: bigint;
  stakedAmountFormatted: string;
  pendingRewards: bigint;
  pendingRewardsFormatted: string;
  lockStartTime: number;
  isLocked: boolean;
  isInGracePeriod: boolean;
  canWithdraw: boolean;
  timeUntilUnlock: number; // in seconds
  timeLeftInGracePeriod: number; // in seconds
  currentCycle: number;
  lockEndTime: number;
  gracePeriodEndTime: number;
}

export interface ContractInfo {
  totalStaked: bigint;
  totalStakedFormatted: string;
  rewardPerBlock: bigint;
  rewardPerBlockFormatted: string;
  poolLimitPerUser: bigint;
  poolLimitPerUserFormatted: string;
  hasUserLimit: boolean;
  contractBalance: bigint;
  contractBalanceFormatted: string;
  rewardBalance: bigint;
  rewardBalanceFormatted: string;
  apy: number; // Annual percentage yield
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

  // Calculate APY from reward per block
  const calculateAPY = (rewardPerBlock: bigint, totalStaked: bigint): number => {
    if (totalStaked === BigInt(0)) return 0;

    const blocksPerYear = BigInt(Math.floor(365 * 24 * 60 * 60 / SECONDS_PER_BLOCK));
    const yearlyRewards = rewardPerBlock * blocksPerYear;
    const apy = (Number(yearlyRewards) / Number(totalStaked)) * 100;

    return Math.min(apy, 1000); // Cap at 1000% to avoid display issues
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
      let poolLimitPerUser = BigInt(0);
      let hasUserLimit = false;
      let contractBalance = BigInt(0);
      let rewardBalance = BigInt(0);

      try {
        totalStaked = await stakingContract.totalStaked();
      } catch (e) {
        console.warn('Failed to get total staked:', e);
      }

      try {
        rewardPerBlock = await stakingContract.rewardPerBlock();
      } catch (e) {
        console.warn('Failed to get reward per block:', e);
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

      // Calculate APY
      const apy = calculateAPY(rewardPerBlock, totalStaked);

      // Set contract info
      setContractInfo({
        totalStaked,
        totalStakedFormatted: formatBalance(formatQuai(totalStaked)),
        rewardPerBlock,
        rewardPerBlockFormatted: formatBalance(formatQuai(rewardPerBlock)),
        poolLimitPerUser,
        poolLimitPerUserFormatted: formatBalance(formatQuai(poolLimitPerUser)),
        hasUserLimit,
        contractBalance,
        contractBalanceFormatted: formatBalance(formatQuai(contractBalance)),
        rewardBalance,
        rewardBalanceFormatted: formatBalance(formatQuai(rewardBalance)),
        apy,
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
      let isInGracePeriod = false;
      let timeUntilUnlock = 0;
      let timeLeftInGracePeriod = 0;
      let currentCycle = 0;

      try {
        // Try to get user info - might fail or return empty for new users
        const user = await stakingContract.userInfo(account.addr);

        // Check if user has any stake
        if (user && user.amount !== undefined) {
          stakedAmount = user.amount || BigInt(0);
          lockStartTime = user.lockStartTime ? Number(user.lockStartTime) : 0;

          // Only query lock-related info if user has staked
          if (stakedAmount > BigInt(0)) {
            try {
              pendingRewards = await stakingContract.pendingReward(account.addr);
            } catch (e) {
              console.warn('Failed to get pending rewards:', e);
            }

            try {
              isLocked = await stakingContract.isLocked(account.addr);
              isInGracePeriod = await stakingContract.isInGracePeriod(account.addr);
              timeUntilUnlock = Number(await stakingContract.timeUntilUnlock(account.addr));
              timeLeftInGracePeriod = Number(await stakingContract.timeLeftInGracePeriod(account.addr));
              currentCycle = Number(await stakingContract.getCurrentCycle(account.addr));
            } catch (e) {
              console.warn('Failed to get lock status:', e);
            }
          }
        }
      } catch (error) {
        // User might not have interacted with the contract yet
        console.log('User has not staked yet or contract call failed:', error);
      }

      // Get lock info for detailed timing (only if user has staked)
      let lockInfo = null;
      if (stakedAmount > BigInt(0) && lockStartTime > 0) {
        try {
          lockInfo = await stakingContract.getLockInfo(account.addr);
        } catch (e) {
          console.warn('Failed to get lock info:', e);
        }
      }

      // Calculate lock and grace period end times
      let lockEndTime = 0;
      let gracePeriodEndTime = 0;

      if (lockStartTime > 0) {
        const timeSinceStart = Math.floor(Date.now() / 1000) - lockStartTime;
        const fullCycleLength = LOCK_PERIOD + GRACE_PERIOD;
        const currentCycleNumber = Math.floor(timeSinceStart / fullCycleLength);
        const currentCycleStart = lockStartTime + (currentCycleNumber * fullCycleLength);

        lockEndTime = currentCycleStart + LOCK_PERIOD;
        gracePeriodEndTime = currentCycleStart + fullCycleLength;
      }

      // Get contract info with error handling
      let totalStaked = BigInt(0);
      let rewardPerBlock = BigInt(0);
      let poolLimitPerUser = BigInt(0);
      let hasUserLimit = false;
      let contractBalance = BigInt(0);
      let rewardBalance = BigInt(0);

      try {
        totalStaked = await stakingContract.totalStaked();
      } catch (e) {
        console.warn('Failed to get total staked:', e);
      }

      try {
        rewardPerBlock = await stakingContract.rewardPerBlock();
      } catch (e) {
        console.warn('Failed to get reward per block:', e);
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

      // Calculate APY
      const apy = calculateAPY(rewardPerBlock, totalStaked);

      // Set user info
      setUserInfo({
        stakedAmount,
        stakedAmountFormatted: formatBalance(formatQuai(stakedAmount)),
        pendingRewards,
        pendingRewardsFormatted: formatBalance(formatQuai(pendingRewards)),
        lockStartTime,
        isLocked,
        isInGracePeriod,
        canWithdraw: isInGracePeriod && !isLocked,
        timeUntilUnlock,
        timeLeftInGracePeriod,
        currentCycle,
        lockEndTime,
        gracePeriodEndTime,
      });

      // Set contract info
      setContractInfo({
        totalStaked,
        totalStakedFormatted: formatBalance(formatQuai(totalStaked)),
        rewardPerBlock,
        rewardPerBlockFormatted: formatBalance(formatQuai(rewardPerBlock)),
        poolLimitPerUser,
        poolLimitPerUserFormatted: formatBalance(formatQuai(poolLimitPerUser)),
        hasUserLimit,
        contractBalance,
        contractBalanceFormatted: formatBalance(formatQuai(contractBalance)),
        rewardBalance,
        rewardBalanceFormatted: formatBalance(formatQuai(rewardBalance)),
        apy,
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
  const deposit = useCallback(async (amount: string) => {
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

      // Send deposit transaction with value
      const tx = await stakingContract.deposit({
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

  // Withdraw tokens
  const withdraw = useCallback(async (amount: string) => {
    if (!account?.addr || !web3Provider) {
      setError('Please connect your wallet');
      return;
    }

    if (!userInfo) {
      setError('No staking information available');
      return;
    }

    if (!userInfo.canWithdraw) {
      setError('Cannot withdraw during lock period. Wait for grace period.');
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

      // Send withdraw transaction
      const tx = await stakingContract.withdraw(withdrawAmount, { gasLimit: 500000 });
      setTransactionHash(tx.hash);

      // Wait for confirmation
      await tx.wait();

      // Reload staking info
      await loadStakingInfo();
    } catch (error: any) {
      console.error('Withdraw failed:', error);
      setError(error.message || 'Withdraw failed. Please try again.');
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, userInfo, loadStakingInfo]);

  // Claim rewards
  const claimRewards = useCallback(async () => {
    if (!account?.addr || !web3Provider) {
      setError('Please connect your wallet');
      return;
    }

    if (!userInfo || userInfo.pendingRewards === BigInt(0)) {
      setError('No rewards to claim');
      return;
    }

    setIsTransacting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const signer = await web3Provider.getSigner();
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, SmartChefNativeABI, signer);

      // Send claim transaction
      const tx = await stakingContract.claimRewards({ gasLimit: 500000 });
      setTransactionHash(tx.hash);

      // Wait for confirmation
      await tx.wait();

      // Reload staking info
      await loadStakingInfo();
    } catch (error: any) {
      console.error('Claim failed:', error);
      setError(error.message || 'Claim failed. Please try again.');
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, userInfo, loadStakingInfo]);

  // Emergency withdraw (forfeits rewards)
  const emergencyWithdraw = useCallback(async () => {
    if (!account?.addr || !web3Provider) {
      setError('Please connect your wallet');
      return;
    }

    if (!userInfo || userInfo.stakedAmount === BigInt(0)) {
      setError('No tokens staked');
      return;
    }

    // Confirm with user
    const confirmed = window.confirm(
      'Emergency withdraw will forfeit all pending rewards. Are you sure you want to continue?'
    );
    if (!confirmed) return;

    setIsTransacting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const signer = await web3Provider.getSigner();
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, SmartChefNativeABI, signer);

      // Send emergency withdraw transaction
      const tx = await stakingContract.emergencyWithdraw({ gasLimit: 500000 });
      setTransactionHash(tx.hash);

      // Wait for confirmation
      await tx.wait();

      // Reload staking info
      await loadStakingInfo();
    } catch (error: any) {
      console.error('Emergency withdraw failed:', error);
      setError(error.message || 'Emergency withdraw failed. Please try again.');
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, userInfo, loadStakingInfo]);

  // Refresh only pending rewards (lightweight update)
  const refreshRewards = useCallback(async () => {
    if (!account?.addr || !userInfo || userInfo.stakedAmount === BigInt(0)) return;

    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, SmartChefNativeABI, provider);

      const pendingRewards = await stakingContract.pendingReward(account.addr);

      setUserInfo(prev => prev ? {
        ...prev,
        pendingRewards,
        pendingRewardsFormatted: formatBalance(formatQuai(pendingRewards)),
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
    withdraw,
    claimRewards,
    emergencyWithdraw,
    refreshData,
    refreshRewards,
  };
}