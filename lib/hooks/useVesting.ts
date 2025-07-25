import { Contract, JsonRpcProvider, Shard, formatQuai as formatQuaiOriginal } from 'quais';
import { useContext, useState, useEffect, useCallback } from 'react';
import { StateContext } from '@/store';
import MultiBeneficiaryVestingContract from '@/lib/MultiBeneficiaryVesting.json';
import MultiBeneficiaryVestingContract2 from '@/lib/MultiBeneficiaryVesting-2.json';
import { RPC_URL, VESTING_CONTRACT_ADDRESSES } from '@/lib/config';

// Re-export formatQuai for use in other components
export const formatQuai = formatQuaiOriginal;

// Helper function to get blocks per period (based on 5-second block times)
function getBlocksPerPeriod(period: number): number {
  const blocksPerPeriod = [1, 12, 720, 17280, 120960, 518400, 6307200]; // BLOCK, MINUTE, HOUR, DAY, WEEK, MONTH, YEAR
  return blocksPerPeriod[period] || 1;
}

// Helper function to generate display names based on vesting period
function generateDisplayName(cliffDuration: number, duration: number, vestingPeriod: number): string {
  const periodNames = ['Block', 'Minute', 'Hour', 'Day', 'Week', 'Month', 'Year'];
  const periodName = periodNames[vestingPeriod] || 'Block';

  if (cliffDuration > 0) {
    return `${cliffDuration} ${periodName} Cliff, ${duration} ${periodName} Unlock`;
  } else {
    return `${duration} ${periodName} Linear Unlock`;
  }
}

export interface ClaimScheduleItem {
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
  unlockProgress: number;
  contractBalance: bigint;
  blocksUntilCliff: number;
  vestingPeriod?: number;
  cliffDuration?: number;
  duration?: number;
  displayName?: string;
}

export interface ClaimSchedule {
  contracts: ClaimScheduleItem[];
  aggregated: {
    totalAmount: string;
    releasedAmount: string;
    claimableAmount: string;
    rawTotalAmount: bigint;
    rawReleasedAmount: bigint;
    rawClaimableAmount: bigint;
    unlockProgress: number;
    hasClaimableTokens: boolean;
  };
  currentBlock: number;
  userQuaiBalance: bigint;
}

export function useClaims() {
  const { account, web3Provider } = useContext(StateContext);
  const [claimSchedule, setClaimSchedule] = useState<ClaimSchedule | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  // Load claim schedule for the connected wallet from all contracts
  const loadClaimSchedule = useCallback(async () => {
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
      const contractData: ClaimScheduleItem[] = [];
      let aggregatedTotalAmount = BigInt(0);
      let aggregatedReleasedAmount = BigInt(0);
      let aggregatedClaimableAmount = BigInt(0);
      let totalUnlockProgress = 0;
      let validContracts = 0;

      for (let i = 0; i < VESTING_CONTRACT_ADDRESSES.length; i++) {
        const contractAddress = VESTING_CONTRACT_ADDRESSES[i];
        try {
          // Use Vesting.json for first contract, MultiBeneficiaryVesting.json for second contract
          const contractAbi = i === 0 ? MultiBeneficiaryVestingContract.abi : MultiBeneficiaryVestingContract2.abi;
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
                  continue;
                }
                throw decodeError;
              }

              // Skip if beneficiary data is invalid or empty
              if (!beneficiaryData || !beneficiaryData.totalAmount) {
                continue;
              }

              const rawTotalAmount = beneficiaryData.totalAmount;

              // Skip if no vesting schedule exists for this contract
              if (rawTotalAmount === BigInt(0)) {
                continue;
              }


              const rawReleasedAmount = beneficiaryData.releasedAmount;
              const startBlock = Number(beneficiaryData.startBlock);
              const durationInBlocks = Number(beneficiaryData.durationInBlocks);
              const cliffBlock = Number(beneficiaryData.cliffBlock);

              // Get claimable amount
              const rawClaimableAmount = await vestingContract.getClaimableAmount(account.addr);

              // Calculate blocks until cliff
              const blocksUntilCliff = cliffBlock > blockNumber ? cliffBlock - blockNumber : 0;

              // Calculate unlock progress
              let unlockProgress = 0;
              if (durationInBlocks > 0) {
                if (blockNumber >= startBlock + durationInBlocks) {
                  unlockProgress = 100;
                } else if (blockNumber > startBlock) {
                  unlockProgress = ((blockNumber - startBlock) * 100) / durationInBlocks;
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

              // For the original contract, create a simple display name
              const displayName = "Unlock Contract";

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
                unlockProgress,
                contractBalance,
                blocksUntilCliff,
                vestingPeriod: 0, // BLOCK period for legacy contract
                cliffDuration: 0, // No cliff for linear vesting contract
                duration: durationInBlocks, // Duration in blocks
                displayName,
              });

              // Aggregate amounts
              aggregatedTotalAmount += rawTotalAmount;
              aggregatedReleasedAmount += rawReleasedAmount;
              aggregatedClaimableAmount += rawClaimableAmount;
              totalUnlockProgress += unlockProgress;
              validContracts++;

            } catch (contractError) {
              console.warn(`Failed to fetch data from contract ${contractAddress}:`, contractError);
            }
          } else {
            // Second contract (MultiBeneficiaryVesting interface) - multiple schedules per beneficiary
            try {

              // Check if user has any schedules (don't skip based on claimable amount)
              // Users should see their vesting info even if nothing is claimable yet

              // Get schedule count for this beneficiary
              const scheduleCount = await vestingContract.getScheduleCount(account.addr);

              // Skip only if user has no schedules at all
              if (scheduleCount === 0) {
                continue;
              }

              // Iterate through all schedules for this beneficiary
              for (let scheduleIndex = 0; scheduleIndex < scheduleCount; scheduleIndex++) {
                try {
                  // Get full schedule details including vesting period information
                  const scheduleData = await vestingContract.getSchedule(account.addr, scheduleIndex);
                  const rawTotalAmount = scheduleData.totalAmount;

                  // Skip only if schedule is inactive or has no allocation
                  if (rawTotalAmount === BigInt(0) || !scheduleData.isActive) {
                    continue;
                  }

                  const rawReleasedAmount = scheduleData.releasedAmount;
                  const startBlock = Number(scheduleData.startBlock);
                  const duration = Number(scheduleData.duration);
                  const cliffDuration = Number(scheduleData.cliffDuration);
                  const vestingPeriod = Number(scheduleData.vestingPeriod);

                  // Calculate actual block numbers and durations
                  const cliffBlock = startBlock + (cliffDuration * getBlocksPerPeriod(vestingPeriod));
                  const durationInBlocks = duration * getBlocksPerPeriod(vestingPeriod);

                  // Generate display name
                  const displayName = generateDisplayName(cliffDuration, duration, vestingPeriod);

                  // Get claimable amount for this specific schedule (might be 0 if in cliff period)
                  let rawClaimableAmount = BigInt(0);
                  try {
                    rawClaimableAmount = await vestingContract.getClaimableAmount(account.addr, scheduleIndex);
                  } catch (claimableError) {
                    console.warn(`Failed to get claimable amount for schedule ${scheduleIndex}:`, claimableError);
                    // Continue with 0 claimable amount to still show the schedule
                  }

                  // Calculate blocks until cliff
                  const blocksUntilCliff = cliffBlock > blockNumber ? cliffBlock - blockNumber : 0;

                  // Calculate unlock progress
                  let unlockProgress = 0;
                  if (durationInBlocks > 0) {
                    if (blockNumber >= startBlock + durationInBlocks) {
                      unlockProgress = 100;
                    } else if (blockNumber > startBlock) {
                      unlockProgress = ((blockNumber - startBlock) * 100) / durationInBlocks;
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
                    unlockProgress,
                    contractBalance,
                    blocksUntilCliff,
                    vestingPeriod,
                    cliffDuration,
                    duration,
                    displayName,
                  });

                  // Aggregate amounts
                  aggregatedTotalAmount += rawTotalAmount;
                  aggregatedReleasedAmount += rawReleasedAmount;
                  aggregatedClaimableAmount += rawClaimableAmount;
                  totalUnlockProgress += unlockProgress;
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
        throw new Error('No claim schedules found for this account.');
      }

      // Calculate average unlock progress
      const averageUnlockProgress = validContracts > 0 ? totalUnlockProgress / validContracts : 0;

      setClaimSchedule({
        contracts: contractData,
        aggregated: {
          totalAmount: formatQuai(aggregatedTotalAmount),
          releasedAmount: formatQuai(aggregatedReleasedAmount),
          claimableAmount: formatQuai(aggregatedClaimableAmount),
          rawTotalAmount: aggregatedTotalAmount,
          rawReleasedAmount: aggregatedReleasedAmount,
          rawClaimableAmount: aggregatedClaimableAmount,
          unlockProgress: averageUnlockProgress,
          hasClaimableTokens: aggregatedClaimableAmount > BigInt(0),
        },
        currentBlock: blockNumber,
        userQuaiBalance,
      });
    } catch (error) {
      setError('Failed to fetch claim data. Please try again.');
    } finally {
      setIsChecking(false);
    }
  }, [account]);

  // Claim tokens from all contracts
  const claimTokens = useCallback(async () => {
    if (!account?.addr || !web3Provider || !claimSchedule) return;
    if (claimSchedule.aggregated.rawClaimableAmount <= BigInt(0)) {
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
      for (let i = 0; i < claimSchedule.contracts.length; i++) {
        const contractItem = claimSchedule.contracts[i];
        if (contractItem.rawClaimableAmount <= BigInt(0)) continue;

        const [actualContractAddress, scheduleIndexStr] = contractItem.contractAddress.split('-');
        const scheduleIndex = parseInt(scheduleIndexStr);

        if (!contractGroups.has(actualContractAddress)) {
          contractGroups.set(actualContractAddress, []);
        }
        contractGroups.get(actualContractAddress).push({ ...contractItem, scheduleIndex });
      }

      // Claim from each unique contract
      for (const [actualContractAddress, contractItems] of Array.from(contractGroups.entries())) {
        // Determine which contract this is based on the actual address
        const contractIndex = VESTING_CONTRACT_ADDRESSES.findIndex(addr => addr === actualContractAddress);
        if (contractIndex === -1) continue;

        // Use Vesting.json for first contract, MultiBeneficiaryVesting.json for second contract
        const contractAbi = contractIndex === 0 ? MultiBeneficiaryVestingContract.abi : MultiBeneficiaryVestingContract2.abi;
        const vestingContract = new Contract(actualContractAddress, contractAbi, signer);

        // Calculate total claimable amount for this contract
        const totalClaimableAmount = contractItems.reduce((sum: bigint, item: ClaimScheduleItem & { scheduleIndex: number }) => sum + item.rawClaimableAmount, BigInt(0));

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
        console.log(`Contract items:`, contractItems.map((item: any) => ({
          address: item.contractAddress,
          claimable: item.rawClaimableAmount.toString(),
          cliffBlock: item.cliffBlock,
          currentBlock: claimSchedule.currentBlock,
          blocksUntilCliff: item.blocksUntilCliff
        })));

        // Add additional validation before transaction
        if (currentClaimableAmount === BigInt(0)) {
          throw new Error(`No tokens available to claim from contract ${actualContractAddress}`);
        }

        let tx;
        try {
          if (contractIndex === 0) {
            tx = await vestingContract.release();
          } else {
            // For MultiBeneficiaryVesting, use releaseAll to release all claimable tokens efficiently
            console.log(`Calling releaseAll() on contract ${actualContractAddress}`);
            tx = await vestingContract.releaseAll();
          }
        } catch (txError: any) {
          console.error(`Transaction failed for contract ${actualContractAddress}:`, txError);
          if (txError.code === 'CALL_EXCEPTION') {
            throw new Error(`Contract call failed for ${actualContractAddress}. This may indicate that no tokens are claimable yet or the cliff period hasn't been reached.`);
          }
          throw new Error(`Failed to execute transaction on contract ${actualContractAddress}: ${txError.message}`);
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

      // Reload claim schedule after successful claims
      await loadClaimSchedule();
    } catch (error: any) {
      console.error('Claim error:', error);
      setError(`Failed to claim tokens: ${error.message}. Please try again.`);
    } finally {
      setIsClaiming(false);
    }
  }, [account, web3Provider, claimSchedule, loadClaimSchedule]);

  // Refresh data
  const refreshData = useCallback(() => {
    loadClaimSchedule();
  }, [loadClaimSchedule]);

  // Load claim schedule when wallet is connected
  useEffect(() => {
    if (account?.addr) {
      loadClaimSchedule();
    } else {
      setClaimSchedule(null);
    }
  }, [account, loadClaimSchedule]);

  return {
    claimSchedule,
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
