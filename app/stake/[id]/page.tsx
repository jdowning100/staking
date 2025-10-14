'use client';
import React, { useContext, useState } from 'react';
import { StateContext } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useParams, useSearchParams } from 'next/navigation';
import { useStaking } from '@/lib/hooks/useStaking';
import { StakingInfo } from '@/components/ui/staking-info';
import { LPStakingFlow } from '@/components/ui/lp-staking-flow';
import { LP_POOLS, LOCK_PERIOD, REWARD_DELAY_PERIOD, EXIT_PERIOD } from '@/lib/config';
import useLPStaking from '@/lib/hooks/useLPStaking';

// Token Logo Component
const TokenLogos = ({ tokens, size = 24 }: { tokens: string[], size?: number }) => {
  const getTokenLogo = (token: string) => {
    switch (token.toLowerCase()) {
      case 'quai':
        return '/images/quai-logo.png';
      case 'wqi':
      case 'qi':
        return '/images/qi-logo.png';
      case 'usdc':
        return '/images/usdc-logo.png';
      default:
        return '/images/quai-logo.png';
    }
  };

  if (tokens.length === 1) {
    return (
      <div className="flex items-center">
        <Image
          src={getTokenLogo(tokens[0])}
          alt={tokens[0]}
          width={size}
          height={size}
          className="rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center">
      <Image
        src={getTokenLogo(tokens[0])}
        alt={tokens[0]}
        width={size}
        height={size}
        className="rounded-full border-2 border-[#1a1a1a] z-10"
      />
      <Image
        src={getTokenLogo(tokens[1])}
        alt={tokens[1]}
        width={size}
        height={size}
        className="rounded-full border-2 border-[#1a1a1a] -ml-2"
      />
    </div>
  );
};

// Pool data
const poolsData = {
  'native-quai': {
    id: 'native-quai',
    name: 'QUAI',
    tokens: ['QUAI'],
    baseApr: 12.5,
    lockPeriods: [
      { days: 30, multiplier: 1.0, apr: 12.5 },
      { days: 60, multiplier: 1.2, apr: 15.0 },
      { days: 90, multiplier: 1.5, apr: 18.8 }
    ],
    totalStaked: 2500000,
    description: 'Stake QUAI tokens directly with time-locked rewards',
  },
  'quai-usdc': {
    id: 'quai-usdc',
    name: 'QUAI/USDC LP',
    tokens: ['QUAI', 'USDC'],
    baseApr: 8.2,
    lockPeriods: [
      { days: 30, multiplier: 1.0, apr: 8.2 },
      { days: 60, multiplier: 1.3, apr: 10.7 },
      { days: 90, multiplier: 1.6, apr: 13.1 }
    ],
    totalStaked: 1800000,
    description: 'Provide liquidity and earn dual rewards',
  },
  'wqi-quai': {
    id: 'wqi-quai',
    name: 'WQI/QUAI LP',
    tokens: ['WQI', 'QUAI'],
    baseApr: 6.8,
    lockPeriods: [
      { days: 30, multiplier: 1.0, apr: 6.8 }
    ],
    totalStaked: 1200000,
    description: 'Balanced exposure with flatcoin stability',
  },
  'wqi-usdc': {
    id: 'wqi-usdc',
    name: 'WQI/USDC LP',
    tokens: ['WQI', 'USDC'],
    baseApr: 5.4,
    lockPeriods: [
      { days: 30, multiplier: 1.0, apr: 5.4 },
      { days: 60, multiplier: 1.3, apr: 7.0 },
      { days: 90, multiplier: 1.5, apr: 8.1 }
    ],
    totalStaked: 800000,
    description: 'Conservative stablecoin pairing',
  },
};


export default function StakePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { account } = useContext(StateContext);
  const [selectedPeriod, setSelectedPeriod] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedStakePeriod, setSelectedStakePeriod] = useState<0 | 1>(0); // 0 for 10 min, 1 for 20 min

  // Use real staking hook for native QUAI
  const staking = useStaking();

  const poolId = params.id as string;
  const pool = poolsData[poolId as keyof typeof poolsData];
  const mode = searchParams.get('mode'); // Get 'manage' or null

  // Use LP staking hook for LP pools
  const lpStaking = useLPStaking(poolId);

  // Check if this is the native QUAI pool with real contract functionality
  const isNativeQuai = poolId === 'native-quai';
  const isLPPool = poolId !== 'native-quai';
  const isRealStaking = isNativeQuai;
  const isRealLPPool = poolId === 'wqi-quai' && LP_POOLS[poolId]?.isActive;

  if (!pool) {
    return (
      <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Pool Not Found</h1>
          <Link href="/">
            <Button className="bg-red-600 hover:bg-red-700 text-white">
              Back to Pools
            </Button>
          </Link>
        </div>
      </main>
    );
  }

  const safeIndex = Math.max(0, Math.min(selectedPeriod, pool.lockPeriods.length - 1));
  const currentPeriod = pool.lockPeriods[safeIndex];

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}K`;
    }
    return num.toLocaleString();
  };

  return (
    <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4">
      <div className="w-full max-w-2xl mx-auto">

        {/* Back Button */}
        <div className="mb-6">
          <Link href="/" className="flex items-center gap-2 text-[#999999] hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Pools
          </Link>
        </div>

        {/* Pool Header */}
        <Card className="bg-[#1a1a1a] border border-[#333333] mb-6">
          <CardHeader>
            <div className="flex items-center gap-4">
              <TokenLogos tokens={pool.tokens} size={48} />
              <div>
                <CardTitle className="text-2xl text-white">{pool.name}</CardTitle>
                <p className="text-[#999999]">{pool.description}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-lg font-bold text-white">
                  {isRealStaking && staking.contractInfo ? (
                    <span>
                      {selectedStakePeriod === 0
                        ? (staking.contractInfo.apy30 ?? staking.contractInfo.apy).toLocaleString('en-US', { maximumFractionDigits: 1 })
                        : (staking.contractInfo.apy90 ?? staking.contractInfo.apy).toLocaleString('en-US', { maximumFractionDigits: 1 })
                      }%
                    </span>
                  ) : isRealLPPool && lpStaking.poolInfo?.poolMetrics ? (
                    `${lpStaking.poolInfo.poolMetrics.apr >= 1000 ?
                      Math.round(lpStaking.poolInfo.poolMetrics.apr).toLocaleString() :
                      lpStaking.poolInfo.poolMetrics.apr.toFixed(1)}%`
                  ) : (
                    `${currentPeriod.apr.toFixed(1)}%`
                  )}
                </div>
                <div className="text-xs text-[#666666] mb-1">Stake Period / APR</div>
                {isRealStaking && (
                  <div className="flex justify-center gap-1">
                    <button
                      onClick={() => setSelectedStakePeriod(0)}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                        selectedStakePeriod === 0
                          ? "bg-red-900/50 text-white border border-red-700"
                          : "bg-[#222222] text-[#666666] hover:text-[#999999]"
                      )}
                    >
                      10m
                    </button>
                    <button
                      onClick={() => setSelectedStakePeriod(1)}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                        selectedStakePeriod === 1
                          ? "bg-red-900/50 text-white border border-red-700"
                          : "bg-[#222222] text-[#666666] hover:text-[#999999]"
                      )}
                    >
                      20m
                    </button>
                  </div>
                )}
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-white">
                  {isRealStaking && staking.contractInfo ?
                    (staking.contractInfo.activeStakedFormatted ?? staking.contractInfo.totalStakedFormatted) :
                    isRealLPPool && lpStaking.poolInfo?.poolMetrics ?
                      `${parseFloat(lpStaking.poolInfo.poolMetrics.totalStakedFormatted).toFixed(2)}` :
                      formatNumber(pool.totalStaked)}
                </div>
                <div className="text-xs text-[#666666]">Active Staked</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-white">
                  {isRealStaking ? `${Math.floor(REWARD_DELAY_PERIOD / 60)} min` :
                    isRealLPPool && lpStaking.poolInfo?.poolMetrics ?
                      lpStaking.poolInfo.poolMetrics.activePositions :
                      `${currentPeriod.multiplier}x`}
                </div>
                <div className="text-xs text-[#666666]">
                  {isRealStaking ? "Reward Vesting" :
                    isRealLPPool ? "Active Positions" : "Multiplier"}
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-white">
                  {isRealStaking ? `${Math.floor(EXIT_PERIOD / 60)} min` :
                    isRealLPPool && lpStaking.poolInfo?.poolMetrics ?
                      lpStaking.poolInfo.poolMetrics.activePositions :
                      `${currentPeriod.multiplier}x`}
                </div>
                <div className="text-xs text-[#666666]">
                  {isRealStaking ? "Exit Period" :
                    isRealLPPool ? "Active Positions" : "Multiplier"}
                </div>
              </div>
            </div>

            {/* Show Details Button */}
            {isRealStaking && (
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDetails(!showDetails)}
                  className="border-[#333333] text-[#999999] hover:bg-[#222222] flex items-center"
                >
                  {showDetails ? (
                    <span className="inline-flex items-center">
                      <ChevronUp className="w-4 h-4 mr-2" />
                      Hide Details
                    </span>
                  ) : (
                    <span className="inline-flex items-center">
                      <ChevronDown className="w-4 h-4 mr-2" />
                      Show Details
                    </span>
                  )}
                </Button>
              </div>
            )}
          </CardContent>

          {/* Detailed Information */}
          {showDetails && isRealStaking && staking.contractInfo && (
            <CardContent className="pt-0 border-t border-[#333333]">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <p className="text-[#999999]">Current Block</p>
                    <p className="font-medium text-white">
                      <a
                        href={`https://quaiscan.io/block/${staking.contractInfo.currentBlock}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center hover:text-red-9"
                      >
                        <span>{staking.contractInfo.currentBlock}</span>
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[#999999]">Reward Per Block</p>
                    <p className="font-medium text-white">
                      {staking.contractInfo.rewardPerBlockFormatted} QUAI
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <p className="text-[#999999]">Contract Balance</p>
                    <p className="font-medium text-white">
                      {staking.contractInfo.contractBalanceFormatted} QUAI
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[#999999]">Reward Balance</p>
                    <p className="font-medium text-white">
                      {staking.contractInfo.rewardBalanceFormatted} QUAI
                    </p>
                  </div>
                </div>

                {staking.contractInfo.hasUserLimit && (
                  <div className="p-3 bg-[#222222] rounded-md">
                    <p className="text-[#999999] text-sm">
                      Pool Limit Per User: {staking.contractInfo.poolLimitPerUserFormatted} QUAI
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* (Stake Period selector removed from manage page) */}

        {/* Real Staking Interface for Native QUAI */}
        {isRealStaking ? (
          <StakingInfo
            userInfo={staking.userInfo}
            contractInfo={staking.contractInfo}
            isLoading={staking.isLoading}
            isTransacting={staking.isTransacting}
            error={staking.error}
            transactionHash={staking.transactionHash}
            onDeposit={(amount: string) => staking.deposit(amount, selectedStakePeriod === 0 ? 600 : 1200)}
            onRequestWithdraw={staking.requestWithdraw}
            onExecuteWithdraw={staking.executeWithdraw}
            onCancelWithdraw={staking.cancelWithdraw}
            onClaimRewards={staking.claimRewards}
            onRefresh={staking.refreshData}
          />
        ) : isRealLPPool ? (
          /* LP Staking Flow for WQI/QUAI */
          <LPStakingFlow
            poolId={poolId}
            initialMode={mode === 'manage' ? 'manage' : 'stake'}
            onComplete={() => {
              // Redirect back to portfolio or main page
              window.location.href = '/portfolio';
            }}
          />
        ) : (
          /* Placeholder for inactive pools */
          <Card className="modern-card">
            <CardHeader>
              <CardTitle className="text-xl text-white text-center">Coming Soon</CardTitle>
            </CardHeader>
            <CardContent className="text-center py-12">
              <div className="space-y-4">
                <div className="text-6xl">🚧</div>
                <h3 className="text-lg font-semibold text-white">
                  {pool.name} Staking Pool
                </h3>
                <p className="text-[#999999] max-w-md mx-auto">
                  {poolId === 'wqi-quai' ?
                    'WQI/QUAI LP staking is in development. Contract deployment coming soon!' :
                    'LP token staking pools are currently under development. Only locked QUAI staking is available at this time.'}
                </p>
                <div className="pt-4">
                  <Link href="/">
                    <Button className="modern-button">
                      Back to QUAI Staking
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
