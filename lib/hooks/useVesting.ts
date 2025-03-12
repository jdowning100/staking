import { Contract, JsonRpcProvider, Shard, formatQuai } from 'quais';
import { useContext, useState, useEffect, useCallback } from 'react';
import { StateContext } from '@/store';
import VestingContract from '@/lib/Vesting.json';
import { RPC_URL, VESTING_CONTRACT_ADDRESS } from '@/lib/config';

export interface VestingSchedule {
  totalAmount: string;
  releasedAmount: string;
  startBlock: number;
  durationInBlocks: number;
  claimableAmount: string;
  rawTotalAmount: bigint;
  rawReleasedAmount: bigint;
  rawClaimableAmount: bigint;
  progress: number;
  currentBlock: number;
}

export function useVesting() {
  const { account, web3Provider } = useContext(StateContext);
  const [vestingSchedule, setVestingSchedule] = useState<VestingSchedule | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  // Load vesting schedule for the connected wallet
  const loadVestingSchedule = useCallback(async () => {
    if (!account?.addr) return;

    setIsChecking(true);
    setError(null);

    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const vestingContract = new Contract(VESTING_CONTRACT_ADDRESS, VestingContract.abi, provider);
      const blockNumber = await provider.getBlockNumber(Shard.Cyprus1);
      setCurrentBlock(blockNumber);

      // Get beneficiary data
      const beneficiaryData = await vestingContract.beneficiaries(account.addr);
      const rawTotalAmount = beneficiaryData.totalAmount;
      const rawReleasedAmount = beneficiaryData.releasedAmount;
      const startBlock = Number(beneficiaryData.startBlock);
      const durationInBlocks = Number(beneficiaryData.durationInBlocks);

      // Get claimable amount
      const rawClaimableAmount = await vestingContract.getClaimableAmount(account.addr);

      // Calculate progress
      let progress = 0;
      if (durationInBlocks > 0) {
        if (blockNumber >= startBlock + durationInBlocks) {
          progress = 100;
        } else if (blockNumber > startBlock) {
          progress = ((blockNumber - startBlock) * 100) / durationInBlocks;
        }
      }

      // Format the values for display using our custom formatter
      const totalAmount = formatQuai(rawTotalAmount);
      const releasedAmount = formatQuai(rawReleasedAmount);
      const claimableAmount = formatQuai(rawClaimableAmount);

      setVestingSchedule({
        totalAmount,
        releasedAmount,
        startBlock,
        durationInBlocks,
        claimableAmount,
        rawTotalAmount,
        rawReleasedAmount,
        rawClaimableAmount,
        progress,
        currentBlock: blockNumber,
      });
    } catch (error) {
      console.error('Error loading vesting schedule:', error);
      setError('Failed to load vesting schedule. Please try again.');
    } finally {
      setIsChecking(false);
    }
  }, [account]);

  // Claim vested tokens
  const claimTokens = useCallback(async () => {
    if (!account?.addr || !web3Provider || !vestingSchedule) return;
    if (vestingSchedule.rawClaimableAmount <= BigInt(0)) {
      setError('No tokens available to claim');
      return;
    }

    setIsClaiming(true);
    setError(null);

    try {
      const signer = await web3Provider.getSigner();
      const vestingContract = new Contract(VESTING_CONTRACT_ADDRESS, VestingContract.abi, signer);

      const tx = await vestingContract.release();
      setTransactionHash(tx.hash);

      await tx.wait();

      // Reload vesting schedule after claim
      await loadVestingSchedule();
    } catch (error) {
      console.error('Error claiming tokens:', error);
      setError('Failed to claim tokens. Please try again.');
    } finally {
      setIsClaiming(false);
    }
  }, [account, web3Provider, vestingSchedule, loadVestingSchedule]);

  // Refresh data
  const refreshData = useCallback(() => {
    loadVestingSchedule();
  }, [loadVestingSchedule]);

  // Load vesting schedule when wallet is connected
  useEffect(() => {
    if (account?.addr) {
      loadVestingSchedule();
    } else {
      setVestingSchedule(null);
    }
  }, [account, loadVestingSchedule]);

  // Check for updates every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (account?.addr) {
        loadVestingSchedule();
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [account, loadVestingSchedule]);

  return {
    vestingSchedule,
    isLoading,
    isChecking,
    isClaiming,
    error,
    transactionHash,
    currentBlock,
    claimTokens,
    refreshData,
  };
}
