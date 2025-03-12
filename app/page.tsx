'use client';
import React, { useContext } from 'react';
import { VestingInfo } from '@/components/ui';
import { StateContext } from '@/store';
import { cn } from '@/lib/utils';
import { APP_TITLE, APP_DESCRIPTION } from '@/lib/config';
import { useMockVesting } from '@/lib/hooks/useMockVesting';

export default function Home() {
  const { account } = useContext(StateContext);
  const { vestingSchedule, isChecking, isClaiming, error, claimTokens, refreshData } = useMockVesting();

  const showVestingInfo = true;

  return (
    <main className="flex min-h-screen flex-col items-center pt-28 pb-8 px-4 bg-background">
      <div className="flex flex-col gap-2 items-center text-center mb-8">
        <h3 className="text-2xl font-medium text-white">{APP_TITLE}</h3>
      </div>

      <div className="w-full max-w-md mx-auto">
        {account?.addr || showVestingInfo ? (
          <VestingInfo
            vestingSchedule={vestingSchedule}
            isChecking={isChecking}
            isClaiming={isClaiming}
            onClaim={claimTokens}
            onRefresh={refreshData}
            error={error}
          />
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
