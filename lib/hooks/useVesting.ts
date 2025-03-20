import { Contract, JsonRpcProvider, Shard, formatQuai as formatQuaiOriginal } from 'quais';
import { useContext, useState, useEffect, useCallback } from 'react';
import { StateContext } from '@/store';
import VestingContract from '@/lib/Vesting.json';
import { RPC_URL, VESTING_CONTRACT_ADDRESS } from '@/lib/config';

// Re-export formatQuai for use in other components
export const formatQuai = formatQuaiOriginal;

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
  contractBalance: bigint;
  userQuaiBalance: bigint;
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

      // Get claimable amount - passing address as required by the contract
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

      // Check contract balance
      const contractBalance = await vestingContract.getBalance();

      if (contractBalance < claimableAmount) {
        throw new Error(
          `Contract does not have enough tokens to release. Contract balance: ${formatQuai(contractBalance)} QUAI, Required: ${formatQuai(claimableAmount)} QUAI`
        );
      }

      // Get user's QUAI balance
      const userQuaiBalance = await provider.getBalance(account.addr);

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
        contractBalance: await vestingContract.getBalance(),
        userQuaiBalance,
      });
    } catch (error) {
      setError('Failed to fetch vesting data. Please try again.');
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
      console.log('Starting claim process...');
      console.log('Account:', account.addr);
      console.log('Claimable amount:', vestingSchedule.rawClaimableAmount.toString());

      const signer = await web3Provider.getSigner();
      console.log('Got signer, creating contract instance...');

      const vestingContract = new Contract(VESTING_CONTRACT_ADDRESS, VestingContract.abi, signer);
      console.log('Contract instance created, calling release()...');

      // Log contract state before claim
      const beneficiaryData = await vestingContract.beneficiaries(account.addr);
      console.log('Current beneficiary data:', {
        totalAmount: beneficiaryData.totalAmount.toString(),
        releasedAmount: beneficiaryData.releasedAmount.toString(),
        startBlock: beneficiaryData.startBlock.toString(),
        durationInBlocks: beneficiaryData.durationInBlocks.toString(),
      });

      // Log current block from state
      console.log('Current block:', currentBlock);

      const claimableAmount = await vestingContract.getClaimableAmount(account.addr);
      console.log('Contract-reported claimable amount:', claimableAmount.toString());

      // Check contract balance
      const contractBalance = await vestingContract.getBalance();
      console.log('Contract balance:', contractBalance.toString());

      if (contractBalance < claimableAmount) {
        throw new Error('Contract does not have enough tokens to release');
      }

      const tx = await vestingContract.release();
      console.log('Transaction sent:', tx.hash);
      setTransactionHash(tx.hash);

      await tx.wait();
      console.log('Transaction confirmed');

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
