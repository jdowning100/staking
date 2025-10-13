import { Contract, JsonRpcProvider, Shard, formatUnits, parseUnits } from 'quais';
import { useContext, useState, useEffect, useCallback } from 'react';
import { StateContext } from '@/store';
import ERC20ABI from '@/lib/abis/ERC20.json';
import SmartChefLPABI from '@/lib/SmartChefLP.json';
import { RPC_URL, TOKEN_ADDRESSES, LP_POOLS } from '@/lib/config';

// Helper function to format numbers with up to 3 decimals but remove trailing zeros
function formatBalance(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return parseFloat(num.toFixed(3)).toString();
}

export interface TokenBalance {
  address: string;
  symbol: string;
  balance: bigint;
  balanceFormatted: string;
  decimals: number;
}

export interface LPTokenInfo {
  address: string;
  symbol: string;
  balance: bigint;
  balanceFormatted: string;
  decimals: number;
  totalSupply: bigint;
  // Add more LP-specific info as needed
}

export interface LPStakingInfo {
  stakedAmount: bigint;
  stakedAmountFormatted: string;
  pendingRewards: bigint;
  pendingRewardsFormatted: string;
  claimableRewards: bigint;
  claimableRewardsFormatted: string;
  totalDelayedRewards: bigint;
  totalDelayedRewardsFormatted: string;
  delayedRewards: { amount: bigint; unlockTime: number; amountFormatted: string; timeUntilUnlock: number }[];
  rewardDebt: bigint;
  lockStartTime: number;
  isLocked: boolean;
  isInGracePeriod: boolean;
  timeUntilUnlock: number;
  timeUntilWithdrawalAvailable: number;
  timeLeftInGracePeriod: number;
  currentCycle: number;
}

export interface LPPoolMetrics {
  totalStaked: bigint;
  totalStakedFormatted: string;
  totalValueLocked: string;
  apr: number;
  activePositions: number;
  rewardPerBlock: bigint;
  rewardPerBlockFormatted: string;
  rewardBalance: bigint;
  rewardBalanceFormatted: string;
  startBlock: number;
  endBlock: number;
  isActive: boolean;
}

export interface LPPoolInfo {
  id: string;
  name: string;
  tokens: string[];
  lpToken: LPTokenInfo | null;
  token0Balance: TokenBalance | null;
  token1Balance: TokenBalance | null;
  userLPBalance: bigint;
  userLPBalanceFormatted: string;
  isActive: boolean;
  stakingInfo: LPStakingInfo | null;
  poolMetrics: LPPoolMetrics | null;
}

export function useLPStaking(poolId: string) {
  const { account, web3Provider } = useContext(StateContext);
  const [poolInfo, setPoolInfo] = useState<LPPoolInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTransacting, setIsTransacting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  const poolConfig = LP_POOLS[poolId as keyof typeof LP_POOLS];

  // Load LP pool information
  const loadPoolInfo = useCallback(async () => {
    if (!account?.addr || !poolConfig) {
      setPoolInfo(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const provider = new JsonRpcProvider(RPC_URL);

      // Get LP token info
      let lpTokenInfo: LPTokenInfo | null = null;
      let userLPBalance = BigInt(0);
      
      if (poolConfig.lpToken && poolConfig.lpToken !== '0x0000000000000000000000000000000000000000') {
        const lpTokenContract = new Contract(poolConfig.lpToken, ERC20ABI, provider);
        
        try {
          const [symbol, decimals, totalSupply, userBalance] = await Promise.all([
            lpTokenContract.symbol(),
            lpTokenContract.decimals(),
            lpTokenContract.totalSupply(),
            lpTokenContract.balanceOf(account.addr)
          ]);

          lpTokenInfo = {
            address: poolConfig.lpToken,
            symbol,
            balance: userBalance,
            balanceFormatted: formatBalance(formatUnits(userBalance, decimals)),
            decimals,
            totalSupply
          };
          
          userLPBalance = userBalance;
        } catch (e) {
          console.warn('Failed to load LP token info:', e);
        }
      }

      // Get token balances
      let token0Balance: TokenBalance | null = null;
      let token1Balance: TokenBalance | null = null;

      // Load token0 (WQI in WQI/QUAI case)
      if (poolConfig.token0 && poolConfig.token0 !== 'native') {
        try {
          const token0Contract = new Contract(poolConfig.token0, ERC20ABI, provider);
          const [symbol, decimals, balance] = await Promise.all([
            token0Contract.symbol(),
            token0Contract.decimals(),
            token0Contract.balanceOf(account.addr)
          ]);

          token0Balance = {
            address: poolConfig.token0,
            symbol,
            balance,
            balanceFormatted: formatBalance(formatUnits(balance, decimals)),
            decimals
          };
        } catch (e) {
          console.warn('Failed to load token0 balance:', e);
        }
      }

      // Load token1 (WQUAI in WQI/QUAI case, but for UI purposes we'll show it as QUAI)
      if (poolConfig.token1) {
        if (poolConfig.token1 === TOKEN_ADDRESSES.WQUAI) {
          // For WQUAI, we'll show the user's native QUAI balance since they can wrap it
          try {
            const quaiBalance = await provider.getBalance(account.addr);
            token1Balance = {
              address: 'native',
              symbol: 'QUAI',
              balance: quaiBalance,
              balanceFormatted: formatBalance(formatUnits(quaiBalance, 18)),
              decimals: 18
            };
          } catch (e) {
            console.warn('Failed to load QUAI balance:', e);
          }
        } else if (poolConfig.token1 !== 'native') {
          try {
            const token1Contract = new Contract(poolConfig.token1, ERC20ABI, provider);
            const [symbol, decimals, balance] = await Promise.all([
              token1Contract.symbol(),
              token1Contract.decimals(),
              token1Contract.balanceOf(account.addr)
            ]);

            token1Balance = {
              address: poolConfig.token1,
              symbol,
              balance,
              balanceFormatted: formatBalance(formatUnits(balance, decimals)),
              decimals
            };
          } catch (e) {
            console.warn('Failed to load token1 balance:', e);
          }
        }
      }

      // Load LP staking information if contract is deployed
      let stakingInfo: LPStakingInfo | null = null;
      let poolMetrics: LPPoolMetrics | null = null;
      
      if (poolConfig.stakingContract && poolConfig.stakingContract !== '0x0000000000000000000000000000000000000000') {
        try {
          const stakingContract = new Contract(poolConfig.stakingContract, SmartChefLPABI, provider);

          // Get user staking info (wrap each call to avoid failing the whole block)
          let userInfo: any = { amount: BigInt(0), rewardDebt: BigInt(0), lockStartTime: 0 };
          try {
            userInfo = await stakingContract.userInfo(account.addr);
          } catch (e) {
            console.warn('LP userInfo() unavailable on staking contract, using defaults');
          }
          
          let pendingRewards: bigint = BigInt(0);
          try {
            pendingRewards = await stakingContract.pendingReward(account.addr);
          } catch (e) {
            console.warn('LP pendingReward() unavailable on staking contract, using 0');
          }

          // Attempt to gather lock details via getLockInfo (preferred),
          // then gracefully fall back to computing using LOCK_PERIOD/GRACE_PERIOD.
          let isLocked = false;
          let isInGracePeriod = false;
          let timeUntilUnlock = 0;
          let timeLeftInGracePeriod = 0;
          let currentCycle = 0;

          let LOCK_PERIOD_ONCHAIN: bigint | null = null;
          let GRACE_PERIOD_ONCHAIN: bigint | null = null;

          // Try consolidated getter first
          try {
            const lockInfo = await stakingContract.getLockInfo(account.addr);
            // lockInfo: [lockStartTime, currentCycle, locked, inGracePeriod, timeUntilUnlock_, timeLeftInGrace_]
            if (lockInfo) {
              const [lockStartTime_, currentCycle_, locked_, inGracePeriod_, tUnlock_, tGrace_] = lockInfo as [bigint, bigint, boolean, boolean, bigint, bigint];
              userInfo.lockStartTime = Number(lockStartTime_ ?? userInfo.lockStartTime);
              isLocked = Boolean(locked_);
              isInGracePeriod = Boolean(inGracePeriod_);
              timeUntilUnlock = Number(tUnlock_ ?? 0);
              timeLeftInGracePeriod = Number(tGrace_ ?? 0);
              currentCycle = Number(currentCycle_ ?? 0);
            }
          } catch (e) {
            // Fallback path: compute lock status if possible
            try {
              LOCK_PERIOD_ONCHAIN = await stakingContract.LOCK_PERIOD();
            } catch {}
            try {
              GRACE_PERIOD_ONCHAIN = await stakingContract.GRACE_PERIOD();
            } catch {}

            const lockStart = Number(userInfo.lockStartTime ?? 0);
            const nowTs = Math.floor(Date.now() / 1000);
            const lockPeriodSec = Number((LOCK_PERIOD_ONCHAIN ?? BigInt(0)));
            const gracePeriodSec = Number((GRACE_PERIOD_ONCHAIN ?? BigInt(0)));

            if (lockStart > 0 && lockPeriodSec > 0) {
              const unlockTs = lockStart + lockPeriodSec;
              if (nowTs < unlockTs) {
                isLocked = true;
                timeUntilUnlock = Math.max(0, unlockTs - nowTs);
              } else if (gracePeriodSec > 0 && nowTs < unlockTs + gracePeriodSec) {
                isInGracePeriod = true;
                timeLeftInGracePeriod = Math.max(0, unlockTs + gracePeriodSec - nowTs);
              }
              if (lockPeriodSec > 0) {
                currentCycle = Math.max(0, Math.floor((nowTs - lockStart) / lockPeriodSec));
              }
            }
          }

          // Rewards delay views
          let claimableRewards: bigint = BigInt(0);
          let totalDelayedRewards: bigint = BigInt(0);
          let delayedRewardsArr: any[] = [];
          let timeUntilWithdrawalAvailable = 0;
          try { claimableRewards = await stakingContract.claimableRewards(account.addr); } catch {}
          try { totalDelayedRewards = await stakingContract.totalDelayedRewards(account.addr); } catch {}
          try { delayedRewardsArr = await stakingContract.getDelayedRewards(account.addr); } catch {}
          try { timeUntilWithdrawalAvailable = Number(await stakingContract.timeUntilWithdrawalAvailable(account.addr)); } catch {}

          stakingInfo = {
            stakedAmount: userInfo.amount || BigInt(0),
            stakedAmountFormatted: formatBalance(formatUnits(userInfo.amount || BigInt(0), 18)),
            pendingRewards: pendingRewards || BigInt(0),
            pendingRewardsFormatted: formatBalance(formatUnits(pendingRewards || BigInt(0), 18)),
            claimableRewards,
            claimableRewardsFormatted: formatBalance(formatUnits(claimableRewards || BigInt(0), 18)),
            totalDelayedRewards,
            totalDelayedRewardsFormatted: formatBalance(formatUnits(totalDelayedRewards || BigInt(0), 18)),
            delayedRewards: (delayedRewardsArr || []).map((r: any) => {
              const amount: bigint = (r && (r.amount ?? r[0])) || BigInt(0);
              const unlockTime: number = Number((r && (r.unlockTime ?? r[1])) || 0);
              return {
                amount,
                unlockTime,
                amountFormatted: formatBalance(formatUnits(amount, 18)),
                timeUntilUnlock: Math.max(0, unlockTime - Math.floor(Date.now() / 1000))
              };
            }),
            rewardDebt: userInfo.rewardDebt || BigInt(0),
            lockStartTime: Number(userInfo.lockStartTime) || 0,
            isLocked,
            isInGracePeriod,
            timeUntilUnlock,
            timeUntilWithdrawalAvailable,
            timeLeftInGracePeriod,
            currentCycle
          };

          // Get global pool metrics (isolate calls to avoid failing the whole section)
          let totalStaked = BigInt(0);
          let rewardPerBlock = BigInt(0);
          let rewardBalance = BigInt(0);
          let startBlock = BigInt(0);
          let bonusEndBlock = BigInt(0);
          let currentBlockNumber = 0;

          try { totalStaked = await stakingContract.totalStaked(); } catch {}
          try { rewardPerBlock = await stakingContract.rewardPerBlock(); } catch {}
          try { rewardBalance = await stakingContract.getRewardBalance(); } catch {}
          try { startBlock = await stakingContract.startBlock(); } catch {}
          try { bonusEndBlock = await stakingContract.bonusEndBlock(); } catch {}
          try { currentBlockNumber = await provider.getBlockNumber(Shard.Cyprus1); } catch {}

          // Calculate APR
          // APR = (rewardPerBlock * blocksPerYear) / totalStaked * 100
          const blocksPerYear = 365 * 24 * 60 * 12; // ~5 second blocks (6,307,200 blocks/year)
          const rewardPerBlockFormatted = Number(formatUnits(rewardPerBlock, 18));
          const totalStakedFormatted = Number(formatUnits(totalStaked, 18));
          const yearlyRewards = rewardPerBlockFormatted * blocksPerYear;
          
          // Calculate true dynamic APR based on current staking
          let estimatedAPR = 0;
          if (totalStakedFormatted > 0) {
            estimatedAPR = (yearlyRewards / totalStakedFormatted) * 100;
          }

          // Estimate active positions (this is approximate since we don't have a direct count)
          // We'll estimate based on average stake size
          const averageStakeSize = 100; // Assume average 100 LP tokens per position
          const estimatedActivePositions = totalStakedFormatted > 0 ? Math.ceil(totalStakedFormatted / averageStakeSize) : 0;

          // Check if rewards are still active
          const rewardsActive = bonusEndBlock && Number(bonusEndBlock) > 0
            ? currentBlockNumber < Number(bonusEndBlock)
            : true;

          poolMetrics = {
            totalStaked,
            totalStakedFormatted: formatBalance(formatUnits(totalStaked, 18)),
            totalValueLocked: formatBalance(formatUnits(totalStaked, 18)), // For LP tokens, TVL equals total staked
            apr: estimatedAPR, // True dynamic APR - no cap
            activePositions: estimatedActivePositions,
            rewardPerBlock,
            rewardPerBlockFormatted: formatBalance(formatUnits(rewardPerBlock, 18)),
            rewardBalance,
            rewardBalanceFormatted: formatBalance(formatUnits(rewardBalance, 18)),
            startBlock: Number(startBlock),
            endBlock: Number(bonusEndBlock),
            isActive: rewardsActive && rewardBalance > BigInt(0)
          };

        } catch (error) {
          console.warn('Failed to load LP staking info:', error);
          // Don't fail completely, just set stakingInfo to null
        }
      }

      setPoolInfo({
        id: poolConfig.id,
        name: poolConfig.name,
        tokens: poolConfig.tokens,
        lpToken: lpTokenInfo,
        token0Balance,
        token1Balance,
        userLPBalance,
        userLPBalanceFormatted: lpTokenInfo ? lpTokenInfo.balanceFormatted : '0',
        isActive: poolConfig.isActive,
        stakingInfo,
        poolMetrics
      });

    } catch (error: any) {
      console.error('Failed to load LP pool info:', error);
      setError('Failed to load pool information. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [account, poolConfig]);

  // Approve token spending
  const approveToken = useCallback(async (tokenAddress: string, spenderAddress: string, amount: bigint) => {
    if (!account?.addr || !web3Provider) {
      setError('Please connect your wallet');
      return false;
    }

    setIsTransacting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const signer = await web3Provider.getSigner();
      const tokenContract = new Contract(tokenAddress, ERC20ABI, signer);

      const tx = await tokenContract.approve(spenderAddress, amount, { gasLimit: 200000 });
      setTransactionHash(tx.hash);

      await tx.wait();
      return true;
    } catch (error: any) {
      console.error('Approve failed:', error);
      setError(error.message || 'Approval failed. Please try again.');
      return false;
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider]);

  // Check token allowance
  const checkAllowance = useCallback(async (tokenAddress: string, spenderAddress: string): Promise<bigint> => {
    if (!account?.addr) return BigInt(0);

    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const tokenContract = new Contract(tokenAddress, ERC20ABI, provider);
      return await tokenContract.allowance(account.addr, spenderAddress);
    } catch (error) {
      console.warn('Failed to check allowance:', error);
      return BigInt(0);
    }
  }, [account]);

  // Refresh pool data
  const refreshData = useCallback(() => {
    loadPoolInfo();
  }, [loadPoolInfo]);

  // Stake LP tokens in the staking contract
  const stakeLPTokens = useCallback(async (amount: string) => {
    if (!account?.addr || !web3Provider || !poolConfig.stakingContract) {
      setError('Please connect your wallet or staking contract not deployed');
      return false;
    }

    if (!poolConfig.stakingContract || poolConfig.stakingContract === '0x0000000000000000000000000000000000000000') {
      setError('LP staking contract not deployed yet');
      return false;
    }

    setIsTransacting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const signer = await web3Provider.getSigner();
      const stakingContract = new Contract(poolConfig.stakingContract, SmartChefLPABI, signer);
      
      const amountWei = parseUnits(amount, 18);
      
      // Check if we need to approve LP tokens first
      const allowance = await checkAllowance(poolConfig.lpToken, poolConfig.stakingContract);
      if (parseFloat(allowance.toString()) < parseFloat(amount)) {
        console.log('Approving LP tokens for staking...');
        const approved = await approveToken(poolConfig.lpToken, poolConfig.stakingContract, amountWei);
        if (!approved) {
          throw new Error('LP token approval failed');
        }
      }

      // Stake LP tokens
      const tx = await stakingContract.deposit(amountWei, { gasLimit: 500000 });
      setTransactionHash(tx.hash);

      await tx.wait();
      
      // Refresh pool info after staking
      await loadPoolInfo();
      
      return true;
    } catch (error: any) {
      console.error('LP staking failed:', error);
      setError(error.message || 'LP staking failed. Please try again.');
      return false;
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, poolConfig, checkAllowance, approveToken, loadPoolInfo]);

  // Load pool info when wallet is connected
  useEffect(() => {
    if (account?.addr && poolConfig) {
      loadPoolInfo();
    } else {
      setPoolInfo(null);
    }
  }, [account, poolConfig, loadPoolInfo]);

  // Withdraw LP tokens from staking contract
  const withdrawLPTokens = useCallback(async (amount: string) => {
    if (!account?.addr || !web3Provider || !poolConfig.stakingContract) {
      setError('Please connect your wallet or staking contract not deployed');
      return false;
    }

    setIsTransacting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const signer = await web3Provider.getSigner();
      const stakingContract = new Contract(poolConfig.stakingContract, SmartChefLPABI, signer);
      
      const amountWei = parseUnits(amount, 18);
      
      const tx = await stakingContract.withdraw(amountWei, { gasLimit: 500000 });
      setTransactionHash(tx.hash);

      await tx.wait();
      
      // Refresh pool info after withdrawal
      await loadPoolInfo();
      
      return true;
    } catch (error: any) {
      console.error('LP withdrawal failed:', error);
      setError(error.message || 'LP withdrawal failed. Please try again.');
      return false;
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, poolConfig, loadPoolInfo]);

  // Claim LP staking rewards
  const claimLPRewards = useCallback(async () => {
    if (!account?.addr || !web3Provider || !poolConfig.stakingContract) {
      setError('Please connect your wallet or staking contract not deployed');
      return false;
    }

    setIsTransacting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const signer = await web3Provider.getSigner();
      const stakingContract = new Contract(poolConfig.stakingContract, SmartChefLPABI, signer);
      
      const tx = await stakingContract.claimRewards({ gasLimit: 500000 });
      setTransactionHash(tx.hash);

      await tx.wait();
      
      // Refresh pool info after claiming
      await loadPoolInfo();
      
      return true;
    } catch (error: any) {
      console.error('LP reward claiming failed:', error);
      setError(error.message || 'LP reward claiming failed. Please try again.');
      return false;
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, poolConfig, loadPoolInfo]);

  // Emergency withdraw LP tokens (forfeits rewards)
  const emergencyWithdrawLP = useCallback(async () => {
    if (!account?.addr || !web3Provider || !poolConfig.stakingContract) {
      setError('Please connect your wallet or staking contract not deployed');
      return false;
    }

    setIsTransacting(true);
    setError(null);
    setTransactionHash(null);

    try {
      const signer = await web3Provider.getSigner();
      const stakingContract = new Contract(poolConfig.stakingContract, SmartChefLPABI, signer);
      
      const tx = await stakingContract.emergencyWithdraw({ gasLimit: 500000 });
      setTransactionHash(tx.hash);

      await tx.wait();
      
      // Refresh pool info after emergency withdrawal
      await loadPoolInfo();
      
      return true;
    } catch (error: any) {
      console.error('LP emergency withdrawal failed:', error);
      setError(error.message || 'LP emergency withdrawal failed. Please try again.');
      return false;
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, poolConfig, loadPoolInfo]);

  return {
    poolInfo,
    isLoading,
    isTransacting,
    error,
    transactionHash,
    approveToken,
    checkAllowance,
    refreshData,
    // LP Staking functions
    stakeLPTokens,
    withdrawLPTokens,
    claimLPRewards,
    emergencyWithdrawLP
  };
}

export default useLPStaking;
