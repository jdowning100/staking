import { Contract, JsonRpcProvider, Shard, formatQuai, parseQuai } from 'quais';
import { useContext, useState, useEffect, useCallback } from 'react';
import { StateContext } from '@/store';
import SmartChefNativeArtifact from '@/lib/SmartChefNative.json';
const SmartChefNativeABI = SmartChefNativeArtifact.abi;
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
              
              // Get reward information
              pendingRewards = await stakingContract.pendingReward(account.addr);
              extendedInfo.claimableRewards = await stakingContract.claimableRewards(account.addr);
              extendedInfo.totalDelayedRewards = await stakingContract.totalDelayedRewards(account.addr);
              const delayedRewardsRaw = await stakingContract.getDelayedRewards(account.addr);
              
              // Process delayed rewards
              extendedInfo.delayedRewards = delayedRewardsRaw.map((reward: any) => {
                const amount = reward.amount || BigInt(0);
                const unlockTime = Number(reward.unlockTime) || 0;
                const timeUntilUnlock = Math.max(0, unlockTime - Math.floor(Date.now() / 1000));
                
                return {
                  amount,
                  unlockTime,
                  amountFormatted: formatBalance(formatQuai(amount)),
                  timeUntilUnlock
                };
              });
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
        claimableRewards: extendedInfo.claimableRewards,
        claimableRewardsFormatted: formatBalance(formatQuai(extendedInfo.claimableRewards)),
        totalDelayedRewards: extendedInfo.totalDelayedRewards,
        totalDelayedRewardsFormatted: formatBalance(formatQuai(extendedInfo.totalDelayedRewards)),
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

      // Send claim transaction (this will add pending rewards to delayed and claim claimable)
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

  // Note: Emergency withdraw has been removed from the new contract

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
    requestWithdraw,
    executeWithdraw,
    cancelWithdraw,
    claimRewards,
    refreshData,
    refreshRewards,
  };
}