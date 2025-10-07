'use client';
import React, { useContext } from 'react';
import { StakingInfo } from '@/components/ui/staking-info';
import { StateContext } from '@/store';
import { APP_TITLE } from '@/lib/config';
import { useStaking } from '@/lib/hooks/useStaking';

export default function Home() {
  const { account } = useContext(StateContext);
  const {
    userInfo,
    contractInfo,
    isLoading,
    isTransacting,
    error,
    transactionHash,
    deposit,
    withdraw,
    claimRewards,
    emergencyWithdraw,
    refreshData,
  } = useStaking();

  return (
    <main className="flex min-h-screen flex-col items-center pt-28 pb-8 px-4 bg-background">
      <div className="flex flex-col gap-2 items-center text-center mb-8">
        <h3 className="text-2xl font-medium text-white">{APP_TITLE}</h3>
      </div>

      <div className="w-full max-w-md mx-auto">
        {account?.addr ? (
          <StakingInfo
            userInfo={userInfo}
            contractInfo={contractInfo}
            isLoading={isLoading}
            isTransacting={isTransacting}
            error={error}
            transactionHash={transactionHash}
            onDeposit={deposit}
            onWithdraw={withdraw}
            onClaimRewards={claimRewards}
            onEmergencyWithdraw={emergencyWithdraw}
            onRefresh={refreshData}
          />
        ) : (
          <div className="flex items-center justify-center h-64 bg-[#1a1a1a] border border-[#333333] rounded-xl">
            <p className="text-[#999999] text-sm font-medium italic">
              Connect your wallet using the button in the header
            </p>
          </div>
        )}
      </div>
    </main>
  );
}