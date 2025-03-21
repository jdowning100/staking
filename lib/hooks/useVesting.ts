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
      const signer = await web3Provider.getSigner();
      const vestingContract = new Contract(VESTING_CONTRACT_ADDRESS, VestingContract.abi, signer);

      // Verify current state before proceeding
      const beneficiaryData = await vestingContract.beneficiaries(account.addr);
      const currentClaimableAmount = await vestingContract.getClaimableAmount(account.addr);
      const contractBalance = await vestingContract.getBalance();

      // Verify claimable amount hasn't changed
      if (currentClaimableAmount !== vestingSchedule.rawClaimableAmount) {
        throw new Error('Claimable amount has changed. Please refresh and try again.');
      }

      // Verify contract balance is sufficient
      if (contractBalance < currentClaimableAmount) {
        throw new Error('Contract balance is insufficient. Please try again later.');
      }

      const tx = await vestingContract.release();

      setTransactionHash(tx.hash);

      // Wait for transaction with explicit confirmations
      const receipt = await tx.wait();

      // Verify transaction success
      if (!receipt.status) {
        throw new Error('Transaction failed');
      }

      // Verify the claim was successful by checking beneficiary data again
      const updatedBeneficiaryData = await vestingContract.beneficiaries(account.addr);
      if (updatedBeneficiaryData.releasedAmount <= beneficiaryData.releasedAmount) {
        throw new Error('Claim verification failed');
      }

      // Reload vesting schedule after successful claim
      await loadVestingSchedule();
    } catch (error) {
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
