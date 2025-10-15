import { Contract, JsonRpcProvider, Shard, formatUnits, parseUnits } from 'quais';
import { useContext, useState, useEffect, useCallback } from 'react';
import { StateContext } from '@/store';
import ERC20ABI from '@/lib/abis/ERC20.json';
import SmartChefLPABI from '@/lib/SmartChefLP.json';
import { RPC_URL, TOKEN_ADDRESSES, LP_POOLS, REWARD_DELAY_PERIOD } from '@/lib/config';

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
  lockDurationSeconds?: number;
  isLocked: boolean;
  isInExitPeriod: boolean;
  canRequestWithdraw: boolean;
  canExecuteWithdraw: boolean;
  timeUntilUnlock: number;
  timeUntilWithdrawalAvailable: number;
  withdrawRequestTime: number;
  withdrawalAmount: bigint;
  withdrawalAmountFormatted: string;
  withdrawalAvailableTime: number;
  userStatus?: string;
}

export interface LPPoolMetrics {
  totalStaked: bigint;
  totalStakedFormatted: string;
  totalValueLocked: string;
  apr: number;
  apy30?: number;
  apy90?: number;
  activePositions: number;
  rewardPerBlock: bigint;
  rewardPerBlockFormatted: string;
  rewardBalance: bigint;
  rewardBalanceFormatted: string;
  startBlock: number;
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
  const [transactionStage, setTransactionStage] = useState<'idle' | 'approving' | 'staking'>('idle');
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

          // Attempt to gather lock and exit details
          let isLocked = false;
          let isInExitPeriod = false;
          let timeUntilUnlock = 0;

          let LOCK_PERIOD_ONCHAIN: bigint | null = null;
          let GRACE_PERIOD_ONCHAIN: bigint | null = null;

          // LP contract uses grace period semantics
          try { isInExitPeriod = await stakingContract.isInExitPeriod(account.addr); } catch { }
          try { isLocked = await stakingContract.isLocked(account.addr); } catch { }
          // Robust compute using on-chain start/duration if available
          const onchainLockStart = Number(userInfo.lockStartTime || 0);
          const onchainLockDuration = Number((userInfo as any).lockDuration || 0);
          if (onchainLockStart > 0 && onchainLockDuration > 0) {
            const end = onchainLockStart + onchainLockDuration;
            const now = Math.floor(Date.now() / 1000);
            if (now < end) {
              isLocked = true;
              timeUntilUnlock = end - now;
            } else {
              timeUntilUnlock = 0;
            }
          } else {
            try { timeUntilUnlock = Number(await stakingContract.timeUntilUnlock(account.addr)); } catch { }
            if (timeUntilUnlock > 0) isLocked = true;
          }

          // Rewards delay views
          let claimableRewards: bigint = BigInt(0);
          let totalDelayedRewards: bigint = BigInt(0);
          let timeUntilWithdrawalAvailable = 0;
          try { claimableRewards = await stakingContract.claimableView(account.addr); } catch { }
          try { totalDelayedRewards = await stakingContract.lockedView(account.addr); } catch { }
          try { timeUntilWithdrawalAvailable = Number(await stakingContract.timeUntilWithdrawalAvailable(account.addr)); } catch { }

          // Try to fetch actual delayed reward entries if available for accurate unlock times
          let delayedEntries: { amount: bigint; unlockTime: number }[] = [];
          try {
            const entries = await stakingContract.getDelayedRewards(account.addr);
            if (Array.isArray(entries)) {
              delayedEntries = entries.map((e: any) => ({ amount: BigInt(e.amount || 0), unlockTime: Number(e.unlockTime || 0) }));
            }
          } catch { }

          const lockDurationSeconds = Number((userInfo as any).lockDuration || 0);
          const withdrawRequestTime = Number((userInfo as any).withdrawRequestTime || 0);
          const withdrawalAmount: bigint = (userInfo as any).withdrawalAmount || BigInt(0);
          const delayedReward: bigint = (userInfo as any).delayedReward || BigInt(0);

          stakingInfo = {
            stakedAmount: userInfo.amount || BigInt(0),
            stakedAmountFormatted: formatBalance(formatUnits(userInfo.amount || BigInt(0), 18)),
            pendingRewards: pendingRewards || BigInt(0),
            pendingRewardsFormatted: formatBalance(formatUnits(pendingRewards || BigInt(0), 18)),
            claimableRewards,
            claimableRewardsFormatted: formatBalance(formatUnits(claimableRewards || BigInt(0), 18)),
            totalDelayedRewards,
            totalDelayedRewardsFormatted: formatBalance(formatUnits(totalDelayedRewards || BigInt(0), 18)),
            delayedRewards: (() => {
              const now = Math.floor(Date.now() / 1000);
              if (delayedEntries.length > 0) {
                return delayedEntries.map((d) => ({
                  amount: d.amount,
                  unlockTime: d.unlockTime,
                  amountFormatted: formatBalance(formatUnits(d.amount, 18)),
                  timeUntilUnlock: Math.max(0, d.unlockTime - now),
                }));
              }
              // Fallback synthetic entries when detailed view not available
              const arr: { amount: bigint; unlockTime: number; amountFormatted: string; timeUntilUnlock: number }[] = [];
              if (claimableRewards > BigInt(0)) {
                arr.push({ amount: claimableRewards, unlockTime: now - 1, amountFormatted: formatBalance(formatUnits(claimableRewards, 18)), timeUntilUnlock: 0 });
              }
              const lockedPortion = totalDelayedRewards - claimableRewards;
              if (lockedPortion > BigInt(0)) {
                arr.push({ amount: lockedPortion, unlockTime: now + Number(REWARD_DELAY_PERIOD), amountFormatted: formatBalance(formatUnits(lockedPortion, 18)), timeUntilUnlock: Number(REWARD_DELAY_PERIOD) });
              }
              return arr;
            })() as { amount: bigint; unlockTime: number; amountFormatted: string; timeUntilUnlock: number }[],
            rewardDebt: userInfo.rewardDebt || BigInt(0),
            lockStartTime: Number(userInfo.lockStartTime) || 0,
            lockDurationSeconds,
            isLocked,
            isInExitPeriod,
            canRequestWithdraw: !isInExitPeriod,
            canExecuteWithdraw: isInExitPeriod && timeUntilWithdrawalAvailable === 0,
            timeUntilUnlock,
            timeUntilWithdrawalAvailable,
            withdrawRequestTime,
            withdrawalAmount,
            withdrawalAmountFormatted: formatBalance(formatUnits(withdrawalAmount || BigInt(0), 18)),
            withdrawalAvailableTime: withdrawRequestTime > 0 ? Math.floor(Date.now() / 1000) + timeUntilWithdrawalAvailable : 0,
            userStatus: isInExitPeriod ? (timeUntilWithdrawalAvailable === 0 ? 'Withdrawal ready' : 'In exit period') : (isLocked ? 'Locked' : 'Unlocked')
          };

          // Get global pool metrics (isolate calls to avoid failing the whole section)
          let totalStaked = BigInt(0);
          let rewardPerBlock = BigInt(0);
          let rewardBalance = BigInt(0);
          let startBlock = BigInt(0);
          let currentBlockNumber = 0;

          try { totalStaked = await stakingContract.totalStaked(); } catch { }
          try { rewardPerBlock = await stakingContract.rewardPerBlock(); } catch { }
          try { rewardBalance = await stakingContract.getRewardBalance(); } catch { }
          try { startBlock = await stakingContract.startBlock(); } catch { }
          try { currentBlockNumber = await provider.getBlockNumber(Shard.Cyprus1); } catch { }

          // Calculate APR (match native behavior with duration boosts)
          const blocksPerYear = 365 * 24 * 60 * 12; // ~5s blocks/year
          const rewardPerBlockFormatted = Number(formatUnits(rewardPerBlock, 18));
          const totalStakedFormatted = Number(formatUnits(totalStaked, 18));
          let totalInExitPeriod = BigInt(0);
          try { totalInExitPeriod = await stakingContract.totalInExitPeriod(); } catch { }
          const totalInExitFormatted = Number(formatUnits(totalInExitPeriod, 18));
          const activeStakedFormatted = Math.max(0, totalStakedFormatted - totalInExitFormatted);
          const yearlyRewards = rewardPerBlockFormatted * blocksPerYear;

          const baseAPR = activeStakedFormatted > 0 ? (yearlyRewards / activeStakedFormatted) * 100 : 0;
          const apy10 = baseAPR * 1.0; // 10m
          const apy20 = baseAPR * 1.5; // 20m

          poolMetrics = {
            totalStaked,
            totalStakedFormatted: formatBalance(formatUnits(totalStaked, 18)),
            totalValueLocked: formatBalance(formatUnits(totalStaked, 18)),
            apr: baseAPR,
            apy30: apy10,
            apy90: apy20,
            activePositions: 0,
            rewardPerBlock,
            rewardPerBlockFormatted: formatBalance(formatUnits(rewardPerBlock, 18)),
            rewardBalance,
            rewardBalanceFormatted: formatBalance(formatUnits(rewardBalance, 18)),
            startBlock: Number(startBlock),
            isActive: rewardBalance > BigInt(0)
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

  // Lightweight rewards refresh (claimable/locked/pending only)
  const refreshRewards = useCallback(async () => {
    if (!account?.addr || !poolConfig?.stakingContract) return;
    if (!poolInfo?.stakingInfo || poolInfo.stakingInfo.stakedAmount === BigInt(0)) return;

    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const stakingContract = new Contract(poolConfig.stakingContract, SmartChefLPABI, provider);
      const pendingP = stakingContract.pendingReward(account.addr).catch(() => BigInt(0));
      const claimableP = stakingContract.claimableView(account.addr).catch(() => BigInt(0));
      const lockedP = stakingContract.lockedView(account.addr).catch(() => BigInt(0));
      const tUnlockP = stakingContract.timeUntilUnlock(account.addr).catch(() => 0);
      const tExitAvailP = stakingContract.timeUntilWithdrawalAvailable(account.addr).catch(() => 0);
      const inExitP = stakingContract.isInExitPeriod(account.addr).catch(() => false);
      const userInfoP = stakingContract.userInfo(account.addr).catch(() => ({} as any));
      const [pending, claimable, locked, tUnlock, tExitAvail, isInExit, userInfoRaw] = (await Promise.all([
        pendingP, claimableP, lockedP, tUnlockP, tExitAvailP, inExitP, userInfoP
      ])) as [bigint, bigint, bigint, number, number, boolean, any];

      // Update in-place
      setPoolInfo(prev => prev ? {
        ...prev,
        stakingInfo: prev.stakingInfo ? {
          ...prev.stakingInfo,
          pendingRewards: pending,
          pendingRewardsFormatted: formatBalance(formatUnits(pending, 18)),
          claimableRewards: claimable,
          claimableRewardsFormatted: formatBalance(formatUnits(claimable, 18)),
          totalDelayedRewards: locked,
          totalDelayedRewardsFormatted: formatBalance(formatUnits(locked, 18)),
          timeUntilUnlock: Number(tUnlock || 0),
          timeUntilWithdrawalAvailable: Number(tExitAvail || 0),
          isInExitPeriod: isInExit,
          canExecuteWithdraw: isInExit && Number(tExitAvail || 0) === 0,
          withdrawRequestTime: Number((userInfoRaw?.withdrawRequestTime) || 0),
          withdrawalAmount: (userInfoRaw?.withdrawalAmount) || BigInt(0),
          withdrawalAmountFormatted: formatBalance(formatUnits(((userInfoRaw?.withdrawalAmount) || BigInt(0)), 18)),
          withdrawalAvailableTime: Number((userInfoRaw?.withdrawRequestTime) || 0) + Number(tExitAvail || 0),
          delayedRewards: (() => {
            const now = Math.floor(Date.now() / 1000);
            const arr: { amount: bigint; unlockTime: number; amountFormatted: string; timeUntilUnlock: number }[] = [];
            if (claimable > BigInt(0)) {
              arr.push({ amount: claimable, unlockTime: now - 1, amountFormatted: formatBalance(formatUnits(claimable, 18)), timeUntilUnlock: 0 });
            }
            const lockedPortion = (locked as bigint) - (claimable as bigint);
            if (lockedPortion > BigInt(0)) {
              arr.push({ amount: lockedPortion, unlockTime: now + Number(REWARD_DELAY_PERIOD), amountFormatted: formatBalance(formatUnits(lockedPortion, 18)), timeUntilUnlock: Number(REWARD_DELAY_PERIOD) });
            }
            return arr;
          })(),
        } : prev.stakingInfo
      } : prev);
    } catch (e) {
      console.warn('LP refreshRewards skipped:', e);
    }
  }, [account, poolConfig?.stakingContract, poolInfo?.stakingInfo?.stakedAmount]);

  // Stake LP tokens in the staking contract
  // Stake LP tokens with duration; accepts seconds (<= 7 days treated as seconds) or days otherwise
  const stakeLPTokens = useCallback(async (amount: string, durationInput: number = 600) => {
    if (!account?.addr || !web3Provider || !poolConfig.stakingContract) {
      setError('Please connect your wallet or staking contract not deployed');
      return false;
    }

    if (!poolConfig.stakingContract || poolConfig.stakingContract === '0x0000000000000000000000000000000000000000') {
      setError('LP staking contract not deployed yet');
      return false;
    }

    setIsTransacting(true);
    setTransactionStage('idle');
    setError(null);
    setTransactionHash(null);

    try {
      const signer = await web3Provider.getSigner();
      const stakingContract = new Contract(poolConfig.stakingContract, SmartChefLPABI, signer);

      const amountWei = parseUnits(amount, 18);

      // Check if we need to approve LP tokens first
      const allowance = await checkAllowance(poolConfig.lpToken, poolConfig.stakingContract);
      if (allowance < amountWei) {
        console.log('Approving LP tokens for staking...');
        setTransactionStage('approving');
        const approved = await approveToken(poolConfig.lpToken, poolConfig.stakingContract, amountWei);
        if (!approved) {
          throw new Error('LP token approval failed');
        }
      }

      // Stake LP tokens with duration
      const durationSeconds = durationInput <= 7 * 24 * 60 * 60 ? durationInput : durationInput * 24 * 60 * 60;
      let tx;
      try {
        setTransactionStage('staking');
        tx = await stakingContract.deposit(amountWei, durationSeconds, { gasLimit: 700000 });
      } catch (e: any) {
        setTransactionStage('staking');
        tx = await stakingContract.deposit(amountWei, { gasLimit: 700000 });
      }
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
      setTransactionStage('idle');
    }
  }, [account, web3Provider, poolConfig, checkAllowance, approveToken, loadPoolInfo]);

  // Request withdrawal (LP exit window)
  const requestLPWithdraw = useCallback(async (amount: string) => {
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
      const tx = await stakingContract.requestWithdraw(amountWei, { gasLimit: 500000 });
      setTransactionHash(tx.hash);
      await tx.wait();
      await loadPoolInfo();
      return true;
    } catch (error: any) {
      console.error('LP request withdraw failed:', error);
      setError(error.message || 'LP request withdraw failed. Please try again.');
      return false;
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, poolConfig, loadPoolInfo]);

  const executeLPWithdraw = useCallback(async () => {
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
      const tx = await stakingContract.executeWithdraw({ gasLimit: 500000 });
      setTransactionHash(tx.hash);
      await tx.wait();
      await loadPoolInfo();
      return true;
    } catch (error: any) {
      console.error('LP execute withdraw failed:', error);
      setError(error.message || 'LP execute withdraw failed. Please try again.');
      return false;
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, poolConfig, loadPoolInfo]);

  const cancelLPWithdraw = useCallback(async () => {
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
      const tx = await stakingContract.cancelWithdraw({ gasLimit: 400000 });
      setTransactionHash(tx.hash);
      await tx.wait();
      await loadPoolInfo();
      return true;
    } catch (error: any) {
      console.error('LP cancel withdraw failed:', error);
      setError(error.message || 'LP cancel withdraw failed. Please try again.');
      return false;
    } finally {
      setIsTransacting(false);
    }
  }, [account, web3Provider, poolConfig, loadPoolInfo]);

  // Load pool info when wallet is connected
  useEffect(() => {
    if (account?.addr && poolConfig) {
      loadPoolInfo();
    } else {
      setPoolInfo(null);
    }
  }, [account, poolConfig, loadPoolInfo]);

  // Periodically refresh rewards when staked
  useEffect(() => {
    if (!poolInfo?.stakingInfo || poolInfo.stakingInfo.stakedAmount === BigInt(0)) return;
    const id = setInterval(refreshRewards, 30000);
    return () => clearInterval(id);
  }, [poolInfo?.stakingInfo?.stakedAmount, refreshRewards]);

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
    transactionStage,
    error,
    transactionHash,
    approveToken,
    checkAllowance,
    refreshData,
    refreshRewards,
    // LP Staking functions
    stakeLPTokens,
    withdrawLPTokens,
    claimLPRewards,
    emergencyWithdrawLP,
    requestLPWithdraw,
    executeLPWithdraw,
    cancelLPWithdraw
  };
}

export default useLPStaking;
