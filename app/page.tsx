'use client';
import React, { useContext, useState } from 'react';
import { StateContext } from '@/store';
import { APP_TITLE } from '@/lib/config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Users, Calendar, TrendingUp, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import Link from 'next/link';
import { useStaking } from '@/lib/hooks/useStaking';

// Token Logo Component for LP pairs
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

// Mock user staking data - set to 0 until LP pools are implemented
const userStakingData = {
  'native-quai': {
    staked: 0, // Will use real contract data
    earned: 0,
    lockPeriod: null,
    endDate: null
  },
  'quai-usdc': {
    staked: 0,
    earned: 0,
    lockPeriod: null,
    endDate: null
  },
  'wqi-quai': {
    staked: 0,
    earned: 0,
    lockPeriod: null,
    endDate: null
  },
  'wqi-usdc': {
    staked: 0,
    earned: 0,
    lockPeriod: null,
    endDate: null
  }
};

// Mock data for pools
const stakingPools = [
  {
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
    isActive: true,
  },
  {
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
    isActive: true,
  },
  {
    id: 'wqi-quai',
    name: 'WQI/QUAI LP',
    tokens: ['WQI', 'QUAI'],
    baseApr: 6.8,
    lockPeriods: [
      { days: 30, multiplier: 1.0, apr: 6.8 },
      { days: 60, multiplier: 1.4, apr: 9.5 },
      { days: 90, multiplier: 1.7, apr: 11.6 }
    ],
    totalStaked: 1200000,
    isActive: true,
  },
  {
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
    isActive: true,
  },
];

const PoolCard = ({ pool, stakingData }: { pool: typeof stakingPools[0], stakingData?: any }) => {
  const [selectedPeriod, setSelectedPeriod] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const { account } = useContext(StateContext);

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}K`;
    }
    return num.toLocaleString();
  };

  const currentPeriod = pool.lockPeriods[selectedPeriod];
  
  // Native QUAI uses the contract's lock mechanism, other pools use selectable periods
  const isNativeQuai = pool.id === 'native-quai';
  
  // Use real data for native QUAI, mock for others
  const userStake = isNativeQuai && stakingData ? {
    staked: Number(stakingData.userInfo?.stakedAmountFormatted || 0),
    earned: Number(stakingData.userInfo?.pendingRewardsFormatted || 0),
    lockPeriod: stakingData.userInfo?.isLocked ? 30 : null,
    endDate: stakingData.userInfo?.lockEndTime ? new Date(stakingData.userInfo.lockEndTime * 1000).toLocaleDateString() : null
  } : userStakingData[pool.id as keyof typeof userStakingData];
  
  const hasStake = userStake.staked > 0;

  return (
    <Card className="bg-[#1a1a1a] border border-[#333333] hover:border-[#444444] transition-colors h-fit">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TokenLogos tokens={pool.tokens} size={36} />
            <div>
              <CardTitle className="text-lg text-white">{pool.name}</CardTitle>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* APR Display */}
        <div>
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-sm text-[#999999]">APR:</span>
            <span className="text-xl font-bold text-white">
              {isNativeQuai && stakingData?.contractInfo ? 
                `${stakingData.contractInfo.apy.toFixed(1)}%` : 
                isNativeQuai ? '0%' : `${currentPeriod.apr.toFixed(1)}%`}
            </span>
            {!isNativeQuai && (
              <span className="text-sm text-[#999999]">
                ~ {(currentPeriod.apr * 1.2).toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* Lock Period Selector or Lock Info */}
        {isNativeQuai ? (
          <div>
            <div className="text-sm font-semibold text-white mb-1">Lock Mechanism: 30-Day Lock Cycles</div>
            <div className="text-xs text-[#999999]">
              30 days locked + 24hr grace period for withdrawal
            </div>
          </div>
        ) : (
          <div>
            <div className="text-sm font-semibold text-white mb-2">Stake Periods: 
              {pool.lockPeriods.map((period, index) => (
                <button
                  key={period.days}
                  onClick={() => setSelectedPeriod(index)}
                  className={cn(
                    "ml-2 px-2 py-1 rounded text-xs font-medium transition-colors",
                    selectedPeriod === index
                      ? "bg-red-600 text-white"
                      : "bg-[#333333] text-[#999999] hover:bg-[#444444]"
                  )}
                >
                  {period.days}D
                </button>
              ))}
            </div>
          </div>
        )}

        {/* User Position (if staked) */}
        {hasStake && account?.addr && (
          <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-1 mb-1">
              <Coins className="h-3 w-3 text-green-400" />
              <span className="text-xs text-green-400 font-medium">Your Position</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[#999999]">Staked:</span>
                <div className="text-white font-medium">{formatNumber(userStake.staked)} {pool.tokens[0]}</div>
              </div>
              <div>
                <span className="text-[#999999]">Earned:</span>
                <div className="text-green-400 font-medium">{userStake.earned.toFixed(2)} {pool.tokens[0]}</div>
              </div>
            </div>
            {userStake.lockPeriod && (
              <div className="text-xs text-[#999999]">
                🔒 Locked for {userStake.lockPeriod} days • Ends {userStake.endDate}
              </div>
            )}
          </div>
        )}

        {/* Total Staked */}
        <div>
          <div className="text-sm font-semibold text-white">
            Total Staked: {isNativeQuai && stakingData?.contractInfo ? 
              `${stakingData.contractInfo.totalStakedFormatted} ${pool.tokens[0]}` :
              `${formatNumber(pool.totalStaked)} ${pool.tokens[0]}`}
            <span className="text-xs text-[#666666] ml-2">
              ~${isNativeQuai && stakingData?.contractInfo ? 
                formatNumber(Number(stakingData.contractInfo.totalStakedFormatted) * 0.05) :
                formatNumber(pool.totalStaked * 0.05)}
            </span>
          </div>
        </div>

        {/* Stake Button */}
        <div className="pt-4">
          <Link href={`/stake/${pool.id}`}>
            <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-medium">
              {hasStake ? 'Manage' : 'Stake'}
            </Button>
          </Link>
        </div>

        {/* Info Expandable */}
        <Button
          variant="ghost"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-red-400 hover:bg-red-400/10 flex items-center justify-center gap-2 text-sm"
        >
          Info
          {isExpanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </Button>

        {/* Expanded Information */}
        {isExpanded && (
          <div className="space-y-3 pt-2 border-t border-[#333333]">
            <div className="space-y-2 text-xs">
              {isNativeQuai ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-[#999999]">Lock Duration:</span>
                    <span className="text-white">30 days per cycle</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#999999]">Grace Period:</span>
                    <span className="text-white">24 hours</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#999999]">Early Withdrawal:</span>
                    <span className="text-red-400">Forfeit rewards</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#999999]">Auto-renewal:</span>
                    <span className="text-green-400">Yes</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-[#999999]">Lock Duration:</span>
                    <span className="text-white">{currentPeriod.days} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#999999]">APR Multiplier:</span>
                    <span className="text-white">{currentPeriod.multiplier}x</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#999999]">Early Withdrawal:</span>
                    <span className="text-red-400">Forfeit rewards</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#999999]">Auto-renewal:</span>
                    <span className="text-green-400">Yes</span>
                  </div>
                </>
              )}
            </div>

            {pool.tokens.length > 1 && (
              <div className="bg-yellow-900/20 border border-yellow-900/50 rounded-lg p-2">
                <p className="text-xs text-yellow-400">
                  ⚠️ LP tokens are subject to impermanent loss.
                </p>
              </div>
            )}

            <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-2">
              <p className="text-xs text-[#999999]">
                Longer lock periods provide higher APR through boosted rewards from the SOAP protocol.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default function Home() {
  const { account } = useContext(StateContext);
  const staking = useStaking();

  return (
    <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4 bg-background">
      <div className="w-full max-w-4xl mx-auto">
        

        {/* Staking Pools Grid - 2x2 */}
        <div className="grid grid-cols-2 gap-6">
          {stakingPools.map((pool) => (
            <PoolCard 
              key={pool.id} 
              pool={pool} 
              stakingData={pool.id === 'native-quai' ? staking : undefined}
            />
          ))}
        </div>

        {/* Connection Prompt */}
        {!account?.addr && (
          <Card className="bg-[#1a1a1a] border border-[#333333] mt-8">
            <CardContent className="p-6 text-center">
              <p className="text-[#999999] mb-4">
                Connect your Pelagus wallet to start staking and earning rewards
              </p>
              <Button className="bg-red-600 hover:bg-red-700 text-white">
                Connect Wallet
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}