'use client';
import React, { useContext } from 'react';
import { ClaimInfo } from '@/components/ui';
import { StateContext } from '@/store';
import { APP_TITLE } from '@/lib/config';
import { useClaims } from '@/lib/hooks/useVesting';

export default function Home() {
  const { account } = useContext(StateContext);
  const claimData = useClaims();

  // Use optional chaining to safely access properties
  const claimProps = {
    claimSchedule: claimData?.claimSchedule || null,
    isChecking: !!claimData?.isChecking,
    isClaiming: !!claimData?.isClaiming,
    onClaim: claimData?.claimTokens || (() => Promise.resolve()),
    onRefresh: claimData?.refreshData || (() => {}),
    error: claimData?.error || null,
  };

  return (
    <main className="flex min-h-screen flex-col items-center pt-28 pb-8 px-4 bg-background">
      <div className="flex flex-col gap-2 items-center text-center mb-8">
        <h3 className="text-2xl font-medium text-white">{APP_TITLE}</h3>
      </div>

      <div className="w-full max-w-md mx-auto">
        {/* Transaction notification for confirmed claims */}
        {claimData?.transactionHash && (
          <div className="p-4 bg-green-500/10 text-green-400 rounded-md text-sm mb-4 flex justify-between items-center">
            <span>Transaction confirmed!</span>
            <a
              href={`https://quaiscan.io/tx/${claimData.transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline"
            >
              View on Explorer
            </a>
          </div>
        )}

        {account?.addr ? (
          <ClaimInfo {...claimProps} />
        ) : (
          <div className="flex items-center justify-center h-64">
            <p className="text-[#999999] text-sm font-medium italic">
              Connect your wallet using the button in the header
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
