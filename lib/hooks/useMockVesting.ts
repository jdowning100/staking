import { useState, useCallback } from 'react';
import { VestingSchedule } from './useVesting';
import { TOKEN_DECIMALS } from '@/lib/config';

// Mock data for vesting schedule
const mockVestingSchedule: VestingSchedule = {
  totalAmount: '10,000.0000',
  releasedAmount: '2,500.0000',
  startBlock: 123456,
  durationInBlocks: 100000,
  claimableAmount: '1,500.0000',
  rawTotalAmount: BigInt('10000000000000000000000'),
  rawReleasedAmount: BigInt('2500000000000000000000'),
  rawClaimableAmount: BigInt('1500000000000000000000'),
  progress: 40,
  currentBlock: 163456,
};

export function useMockVesting() {
  const [vestingSchedule, setVestingSchedule] = useState<VestingSchedule>(mockVestingSchedule);
  const [isChecking, setIsChecking] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  // Simulate claim action
  const claimTokens = useCallback(async () => {
    if (vestingSchedule.rawClaimableAmount <= BigInt(0)) {
      setError('No tokens available to claim');
      return;
    }

    setIsClaiming(true);
    setError(null);

    try {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Update vesting schedule after "claiming"
      const newReleasedAmount = vestingSchedule.rawReleasedAmount + vestingSchedule.rawClaimableAmount;

      setVestingSchedule({
        ...vestingSchedule,
        releasedAmount: formatAmount(newReleasedAmount),
        rawReleasedAmount: newReleasedAmount,
        claimableAmount: '0.0000',
        rawClaimableAmount: BigInt(0),
      });

      setTransactionHash('0x' + Math.random().toString(16).substring(2, 42));
    } catch (error) {
      console.error('Error claiming tokens:', error);
      setError('Failed to claim tokens. Please try again.');
    } finally {
      setIsClaiming(false);
    }
  }, [vestingSchedule]);

  // Refresh data with loading state
  const refreshData = useCallback(() => {
    setIsChecking(true);

    // Simulate network delay
    setTimeout(() => {
      // Generate a new claimable amount to simulate progress
      const newClaimableAmount = BigInt('500000000000000000000');

      setVestingSchedule({
        ...vestingSchedule,
        claimableAmount: formatAmount(newClaimableAmount),
        rawClaimableAmount: newClaimableAmount,
        currentBlock: vestingSchedule.currentBlock + 1000,
        progress: Math.min(vestingSchedule.progress + 2, 100),
      });

      setIsChecking(false);
    }, 1500);
  }, [vestingSchedule]);

  // Helper function to format amounts
  function formatAmount(amount: bigint): string {
    const amountString = amount.toString();
    if (amountString.length <= TOKEN_DECIMALS) {
      return '0.' + amountString.padStart(TOKEN_DECIMALS, '0');
    }
    const whole = amountString.slice(0, amountString.length - TOKEN_DECIMALS);
    const fraction = amountString.slice(amountString.length - TOKEN_DECIMALS);

    // Format with commas for thousands
    let formattedWhole = '';
    for (let i = 0; i < whole.length; i++) {
      if (i > 0 && (whole.length - i) % 3 === 0) {
        formattedWhole += ',';
      }
      formattedWhole += whole[i];
    }

    return formattedWhole + '.' + fraction.slice(0, 4); // Show only 4 decimal places
  }

  return {
    vestingSchedule,
    isChecking,
    isClaiming,
    error,
    transactionHash,
    claimTokens,
    refreshData,
    currentBlock: vestingSchedule.currentBlock,
  };
}
