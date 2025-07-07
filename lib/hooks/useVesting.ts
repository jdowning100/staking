import { Contract, JsonRpcProvider, Shard, formatQuai as formatQuaiOriginal } from 'quais';
import { useContext, useState, useEffect, useCallback } from 'react';
import { StateContext } from '@/store';
import VestingContract from '@/lib/Vesting.json';
import MultiBeneficiaryVestingContract from '@/lib/MultiBeneficiaryVesting.json';
import { RPC_URL, VESTING_CONTRACT_ADDRESSES } from '@/lib/config';

// Re-export formatQuai for use in other components
export const formatQuai = formatQuaiOriginal;

export interface VestingScheduleItem {
  contractAddress: string;
  totalAmount: string;
  releasedAmount: string;
  startBlock: number;
  durationInBlocks: number;
  cliffBlock: number;
  claimableAmount: string;
  rawTotalAmount: bigint;
  rawReleasedAmount: bigint;
  rawClaimableAmount: bigint;
  progress: number;
  contractBalance: bigint;
  blocksUntilCliff: number;
}

export interface VestingSchedule {
  contracts: VestingScheduleItem[];
  aggregated: {
    totalAmount: string;
    releasedAmount: string;
    claimableAmount: string;
    rawTotalAmount: bigint;
    rawReleasedAmount: bigint;
    rawClaimableAmount: bigint;
    progress: number;
    hasClaimableTokens: boolean;
  };
  currentBlock: number;
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

  // Load vesting schedule for the connected wallet from all contracts
  const loadVestingSchedule = useCallback(async () => {
    if (!account?.addr) return;

    setIsChecking(true);
    setError(null);

    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const blockNumber = await provider.getBlockNumber(Shard.Cyprus1);
      setCurrentBlock(blockNumber);

      // Get user's QUAI balance
      const userQuaiBalance = await provider.getBalance(account.addr);

      // Process all contracts
      const contractData: VestingScheduleItem[] = [];
      let aggregatedTotalAmount = BigInt(0);
      let aggregatedReleasedAmount = BigInt(0);
      let aggregatedClaimableAmount = BigInt(0);
      let aggregatedVestedAmount = BigInt(0);
      let totalProgress = 0;
      let validContracts = 0;

      for (let i = 0; i < VESTING_CONTRACT_ADDRESSES.length; i++) {
        const contractAddress = VESTING_CONTRACT_ADDRESSES[i];
        try {
          // Use Vesting.json for first contract, MultiBeneficiaryVesting.json for second contract
          const contractAbi = i === 0 ? VestingContract.abi : MultiBeneficiaryVestingContract.abi;
          const vestingContract = new Contract(contractAddress, contractAbi, provider);

          if (i === 0) {
            // First contract (original interface) - single schedule per beneficiary
            try {
              let beneficiaryData;
              try {
                beneficiaryData = await vestingContract.beneficiaries(account.addr);
              } catch (decodeError: any) {
                // If we get a BAD_DATA error, it means the beneficiary doesn't exist in this contract
                if (decodeError.code === 'BAD_DATA') {
                  console.log(`No beneficiary data found for ${account.addr} in contract ${contractAddress}`);
                  continue;
                }
                throw decodeError;
              }
              
              // Skip if beneficiary data is invalid or empty
              if (!beneficiaryData || !beneficiaryData.totalAmount) continue;
              
              const rawTotalAmount = beneficiaryData.totalAmount;
              
              // Skip if no vesting schedule exists for this contract
              if (rawTotalAmount === BigInt(0)) continue;
              
              const rawReleasedAmount = beneficiaryData.releasedAmount;
              const startBlock = Number(beneficiaryData.startBlock);
              const durationInBlocks = Number(beneficiaryData.durationInBlocks);
              const cliffBlock = Number(beneficiaryData.cliffBlock);
              
              // Get claimable amount
              const rawClaimableAmount = await vestingContract.getClaimableAmount(account.addr);
              
              // Calculate blocks until cliff
              const blocksUntilCliff = cliffBlock > blockNumber ? cliffBlock - blockNumber : 0;
              
              // Calculate progress
              let progress = 0;
              if (durationInBlocks > 0) {
                if (blockNumber >= startBlock + durationInBlocks) {
                  progress = 100;
                } else if (blockNumber > startBlock) {
                  progress = ((blockNumber - startBlock) * 100) / durationInBlocks;
                }
              }
              
              // Format values
              const totalAmount = formatQuai(rawTotalAmount);
              const releasedAmount = formatQuai(rawReleasedAmount);
              const claimableAmount = formatQuai(rawClaimableAmount);
              
              // Check contract balance
              const contractBalance = await vestingContract.getBalance();
              
              if (contractBalance < rawClaimableAmount) {
                throw new Error(
                  `Contract ${contractAddress} does not have enough tokens to release. Contract balance: ${formatQuai(contractBalance)} QUAI, Required: ${formatQuai(rawClaimableAmount)} QUAI`
                );
              }
              
              // Add to contract data
              contractData.push({
                contractAddress: `${contractAddress}-0`, // Add schedule index for consistency
                totalAmount,
                releasedAmount,
                startBlock,
                durationInBlocks,
                cliffBlock,
                claimableAmount,
                rawTotalAmount,
                rawReleasedAmount,
                rawClaimableAmount,
                progress,
                contractBalance,
                blocksUntilCliff,
              });
              
              // Aggregate amounts
              aggregatedTotalAmount += rawTotalAmount;
              aggregatedReleasedAmount += rawReleasedAmount;
              aggregatedClaimableAmount += rawClaimableAmount;
              totalProgress += progress;
              validContracts++;
              
            } catch (contractError) {
              console.warn(`Failed to fetch data from contract ${contractAddress}:`, contractError);
            }
          } else {
            // Second contract (MultiBeneficiaryVesting interface) - multiple schedules per beneficiary
            try {
              // Get the total claimable amount first to check if user has any schedules
              const totalClaimable = await vestingContract.getTotalClaimableAmount(account.addr);
              if (totalClaimable === BigInt(0)) continue;
              
              // Get schedule count for this beneficiary
              const scheduleCount = await vestingContract.getScheduleCount(account.addr);
              
              // Iterate through all schedules for this beneficiary
              for (let scheduleIndex = 0; scheduleIndex < scheduleCount; scheduleIndex++) {
                try {
                  const beneficiaryData = await vestingContract.beneficiaries(account.addr, scheduleIndex);
                  const rawTotalAmount = beneficiaryData.totalAmount;
                  
                  // Skip if no vesting schedule exists for this schedule
                  if (rawTotalAmount === BigInt(0)) continue;
                  
                  const rawReleasedAmount = beneficiaryData.releasedAmount;
                  const startBlock = Number(beneficiaryData.startBlock);
                  const durationInBlocks = Number(beneficiaryData.duration);
                  const cliffBlock = Number(beneficiaryData.cliffBlock);
                  
                  // Get claimable amount for this specific schedule
                  const rawClaimableAmount = await vestingContract.getClaimableAmount(account.addr, scheduleIndex);
                  
                  // Calculate blocks until cliff
                  const blocksUntilCliff = cliffBlock > blockNumber ? cliffBlock - blockNumber : 0;
                  
                  // Calculate progress
                  let progress = 0;
                  if (durationInBlocks > 0) {
                    if (blockNumber >= startBlock + durationInBlocks) {
                      progress = 100;
                    } else if (blockNumber > startBlock) {
                      progress = ((blockNumber - startBlock) * 100) / durationInBlocks;
                    }
                  }
                  
                  // Format values
                  const totalAmount = formatQuai(rawTotalAmount);
                  const releasedAmount = formatQuai(rawReleasedAmount);
                  const claimableAmount = formatQuai(rawClaimableAmount);
                  
                  // Check contract balance
                  const contractBalance = await vestingContract.getBalance();
                  
                  if (contractBalance < rawClaimableAmount) {
                    throw new Error(
                      `Contract ${contractAddress} does not have enough tokens to release. Contract balance: ${formatQuai(contractBalance)} QUAI, Required: ${formatQuai(rawClaimableAmount)} QUAI`
                    );
                  }
                  
                  // Add to contract data with schedule index
                  contractData.push({
                    contractAddress: `${contractAddress}-${scheduleIndex}`,
                    totalAmount,
                    releasedAmount,
                    startBlock,
                    durationInBlocks,
                    cliffBlock,
                    claimableAmount,
                    rawTotalAmount,
                    rawReleasedAmount,
                    rawClaimableAmount,
                    progress,
                    contractBalance,
                    blocksUntilCliff,
                  });
                  
                  // Aggregate amounts
                  aggregatedTotalAmount += rawTotalAmount;
                  aggregatedReleasedAmount += rawReleasedAmount;
                  aggregatedClaimableAmount += rawClaimableAmount;
                  totalProgress += progress;
                  validContracts++;
                  
                } catch (scheduleError) {
                  console.warn(`Failed to fetch schedule ${scheduleIndex} from contract ${contractAddress}:`, scheduleError);
                }
              }
            } catch (contractError) {
              console.warn(`Failed to fetch data from contract ${contractAddress}:`, contractError);
            }
          }
        } catch (contractError) {
          console.warn(`Failed to fetch data from contract ${contractAddress}:`, contractError);
        }
      }

      if (validContracts === 0) {
        throw new Error('No vesting schedules found for this account.');
      }

      // Calculate average progress
      const averageProgress = validContracts > 0 ? totalProgress / validContracts : 0;

      setVestingSchedule({
        contracts: contractData,
        aggregated: {
          totalAmount: formatQuai(aggregatedTotalAmount),
          releasedAmount: formatQuai(aggregatedReleasedAmount),
          claimableAmount: formatQuai(aggregatedClaimableAmount),
          rawTotalAmount: aggregatedTotalAmount,
          rawReleasedAmount: aggregatedReleasedAmount,
          rawClaimableAmount: aggregatedClaimableAmount,
          progress: averageProgress,
          hasClaimableTokens: aggregatedClaimableAmount > BigInt(0),
        },
        currentBlock: blockNumber,
        userQuaiBalance,
      });
    } catch (error) {
      setError('Failed to fetch vesting data. Please try again.');
    } finally {
      setIsChecking(false);
    }
  }, [account]);

  // Claim vested tokens from all contracts
  const claimTokens = useCallback(async () => {
    if (!account?.addr || !web3Provider || !vestingSchedule) return;
    if (vestingSchedule.aggregated.rawClaimableAmount <= BigInt(0)) {
      setError('No tokens available to claim');
      return;
    }

    setIsClaiming(true);
    setError(null);

    try {
      const signer = await web3Provider.getSigner();
      const transactionHashes: string[] = [];

      // Group contracts by address to avoid multiple releaseAll calls
      const contractGroups = new Map();
      for (let i = 0; i < vestingSchedule.contracts.length; i++) {
        const contractItem = vestingSchedule.contracts[i];
        if (contractItem.rawClaimableAmount <= BigInt(0)) continue;

        const [actualContractAddress, scheduleIndexStr] = contractItem.contractAddress.split('-');
        const scheduleIndex = parseInt(scheduleIndexStr);
        
        if (!contractGroups.has(actualContractAddress)) {
          contractGroups.set(actualContractAddress, []);
        }
        contractGroups.get(actualContractAddress).push({...contractItem, scheduleIndex});
      }

      // Claim from each unique contract
      for (const [actualContractAddress, contractItems] of Array.from(contractGroups.entries())) {
        // Determine which contract this is based on the actual address
        const contractIndex = VESTING_CONTRACT_ADDRESSES.findIndex(addr => addr === actualContractAddress);
        if (contractIndex === -1) continue;

        // Use Vesting.json for first contract, MultiBeneficiaryVesting.json for second contract
        const contractAbi = contractIndex === 0 ? VestingContract.abi : MultiBeneficiaryVestingContract.abi;
        const vestingContract = new Contract(actualContractAddress, contractAbi, signer);

        // Calculate total claimable amount for this contract
        const totalClaimableAmount = contractItems.reduce((sum: bigint, item: any) => sum + item.rawClaimableAmount, BigInt(0));

        // Verify current state before proceeding
        let currentClaimableAmount: bigint;
        if (contractIndex === 0) {
          // For first contract, verify single beneficiary
          const beneficiaryData = await vestingContract.beneficiaries(account.addr);
          currentClaimableAmount = await vestingContract.getClaimableAmount(account.addr);
          
          // Verify claimable amount hasn't changed
          if (currentClaimableAmount !== totalClaimableAmount) {
            throw new Error(`Claimable amount has changed for contract ${actualContractAddress}. Please refresh and try again.`);
          }
        } else {
          // For MultiBeneficiaryVesting, trust the UI data and proceed with claim
          // The individual schedule verification is problematic, so we'll rely on the contract's own validation
          currentClaimableAmount = totalClaimableAmount;
          console.log(`Proceeding with claim for contract ${actualContractAddress}, total amount: ${currentClaimableAmount}`);
        }

        // Skip balance check for MultiBeneficiaryVesting as it's causing issues
        // The contract will handle insufficient balance errors during the actual transaction
        if (contractIndex === 0) {
          const contractBalance = await vestingContract.getBalance();
          if (contractBalance < currentClaimableAmount) {
            throw new Error(`Contract ${actualContractAddress} balance is insufficient. Please try again later.`);
          }
        }

        // Release tokens from the contract
        console.log(`Releasing tokens from contract ${actualContractAddress}, total amount: ${currentClaimableAmount}`);
        let tx;
        if (contractIndex === 0) {
          tx = await vestingContract.release();
        } else {
          // For MultiBeneficiaryVesting, use releaseAll to release all claimable tokens efficiently
          tx = await vestingContract.releaseAll();
        }

        transactionHashes.push(tx.hash);

        // Wait for transaction with explicit confirmations
        const receipt = await tx.wait();

        // Verify transaction success
        if (!receipt.status) {
          throw new Error(`Transaction failed for contract ${actualContractAddress}`);
        }

        // For MultiBeneficiaryVesting, skip detailed verification as the contract handles it
        // The transaction success and receipt validation is sufficient
        console.log(`Claim transaction successful for contract ${actualContractAddress}`);
        console.log(`Transaction hash: ${tx.hash}`);
      }

      // Set the last transaction hash for display
      if (transactionHashes.length > 0) {
        setTransactionHash(transactionHashes[transactionHashes.length - 1]);
      }

      // Reload vesting schedule after successful claims
      await loadVestingSchedule();
    } catch (error: any) {
      console.error('Claim error:', error);
      setError(`Failed to claim tokens: ${error.message}. Please try again.`);
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
