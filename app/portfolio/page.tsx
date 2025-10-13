'use client';
import React, { useContext } from 'react';
import { StateContext } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coins, TrendingUp, Clock, ExternalLink, ArrowRight, Gift, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import Link from 'next/link';
import { useStaking } from '@/lib/hooks/useStaking';

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

// Mock user staking data - set to 0 for LP pools until implemented
const userStakingData = {
  'native-quai': {
    name: 'QUAI',
    tokens: ['QUAI'],
    staked: 0, // Will use real data from contract
    earned: 0,
    lockPeriod: null,
    endDate: null,
    apr: 0
  },
  'quai-usdc': {
    name: 'QUAI/USDC LP',
    tokens: ['QUAI', 'USDC'],
    staked: 0,
    earned: 0,
    lockPeriod: null,
    endDate: null,
    apr: 0
  },
  'wqi-quai': {
    name: 'WQI/QUAI LP',
    tokens: ['WQI', 'QUAI'],
    staked: 0,
    earned: 0,
    lockPeriod: null,
    endDate: null,
    apr: 0
  },
  'wqi-usdc': {
    name: 'WQI/USDC LP',
    tokens: ['WQI', 'USDC'],
    staked: 0,
    earned: 0,
    lockPeriod: null,
    endDate: null,
    apr: 0
  }
};

export default function Portfolio() {
  const { account } = useContext(StateContext);
  const staking = useStaking();

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}K`;
    }
    return num.toLocaleString();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  // Calculate totals - use real data for native QUAI, mock for others
  const realQuaiStaked = staking.userInfo ? Number(staking.userInfo.stakedAmountFormatted) : 0;
  const realQuaiEarned = staking.userInfo ? Number(staking.userInfo.pendingRewardsFormatted) : 0;
  const realQuaiApr = staking.contractInfo ? staking.contractInfo.apy : 0;

  // Only include positions that actually have staked amounts
  const allPositions = [];
  
  // Add real QUAI position only if user has staked amount
  if (realQuaiStaked > 0) {
    allPositions.push({
      id: 'native-quai',
      name: 'QUAI',
      tokens: ['QUAI'],
      staked: realQuaiStaked,
      earned: realQuaiEarned,
      apr: realQuaiApr,
      lockPeriod: staking.userInfo?.isLocked ? 30 : null,
      endDate: staking.userInfo?.lockEndTime ? new Date(staking.userInfo.lockEndTime * 1000).toISOString().split('T')[0] : null,
      isReal: true
    });
  }
  
  // Add mock LP positions only if they have staked amounts (for demo purposes)
  Object.entries(userStakingData).filter(([id]) => id !== 'native-quai').forEach(([id, data]) => {
    if (data.staked > 0) {
      allPositions.push({
        id,
        ...data,
        name: id === 'quai-usdc' ? 'QUAI/USDC LP' : id === 'wqi-quai' ? 'WQI/QUAI LP' : 'WQI/USDC LP',
        tokens: id === 'quai-usdc' ? ['QUAI', 'USDC'] : id === 'wqi-quai' ? ['WQI', 'QUAI'] : ['WQI', 'USDC'],
        isReal: false
      });
    }
  });

  const totalStaked = allPositions.reduce((sum, pos) => sum + pos.staked, 0);
  const totalEarned = allPositions.reduce((sum, pos) => sum + pos.earned, 0);
  const activePositions = allPositions.filter(pos => pos.staked > 0);
  const totalClaimable = activePositions.reduce((sum, pos) => sum + pos.earned, 0);

  // Calculate weighted APR
  const weightedApr = activePositions.length > 0 
    ? activePositions.reduce((sum, pos) => sum + (pos.apr * pos.staked), 0) / totalStaked
    : 0;

  if (!account?.addr) {
    return (
      <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4 bg-background">
        <div className="w-full max-w-4xl mx-auto">
          <Card className="bg-[#1a1a1a] border border-[#333333]">
            <CardContent className="p-12 text-center">
              <Coins className="h-16 w-16 text-[#666666] mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-white mb-2">Portfolio</h1>
              <p className="text-[#999999] mb-6">
                Connect your wallet to view your staking positions and earnings
              </p>
              <Button className="bg-red-600 hover:bg-red-700 text-white">
                Connect Wallet
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // Show loading state while staking data is loading
  if (staking.isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4 bg-background">
        <div className="w-full max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-8">Your Portfolio</h1>
          
          <Card className="bg-[#1a1a1a] border border-[#333333]">
            <CardContent className="p-12 text-center">
              <Loader2 className="h-16 w-16 text-red-600 mx-auto mb-4 animate-spin" />
              <h2 className="text-xl font-bold text-white mb-2">Loading Portfolio</h2>
              <p className="text-[#999999]">
                Fetching your staking positions and rewards...
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (activePositions.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4 bg-background">
        <div className="w-full max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-8">Your Portfolio</h1>
          
          <Card className="bg-[#1a1a1a] border border-[#333333]">
            <CardContent className="p-12 text-center">
              <TrendingUp className="h-16 w-16 text-[#666666] mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">No Active Positions</h2>
              <p className="text-[#999999] mb-6">
                You don't have any active staking positions yet. Start staking to see your portfolio here.
              </p>
              <Link href="/">
                <Button className="bg-red-600 hover:bg-red-700 text-white">
                  Start Staking
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4 bg-background">
      <div className="w-full max-w-6xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-white">Your Portfolio</h1>

        {/* Portfolio Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-[#1a1a1a] border border-[#333333]">
            <CardContent className="p-4 text-center">
              <div className="text-xl font-bold text-white">{formatNumber(totalStaked)}</div>
              <div className="text-xs text-[#999999]">Total Staked</div>
              <div className="text-xs text-[#666666]">QUAI</div>
            </CardContent>
          </Card>
          
          <Card className="bg-[#1a1a1a] border border-[#333333]">
            <CardContent className="p-4 text-center">
              <div className="text-xl font-bold text-orange-400">{totalEarned.toFixed(2)}</div>
              <div className="text-xs text-[#999999]">Total Earned</div>
              <div className="text-xs text-[#666666]">QUAI</div>
            </CardContent>
          </Card>
          
          <Card className="bg-[#1a1a1a] border border-[#333333]">
            <CardContent className="p-4 text-center">
              <div className="text-xl font-bold text-red-400">{weightedApr.toFixed(1)}%</div>
              <div className="text-xs text-[#999999]">Weighted APR</div>
              <div className="text-xs text-[#666666]">Average</div>
            </CardContent>
          </Card>
          
          <Card className="bg-[#1a1a1a] border border-[#333333]">
            <CardContent className="p-4 text-center">
              <div className="text-xl font-bold text-orange-500">{activePositions.length}</div>
              <div className="text-xs text-[#999999]">Active Positions</div>
              <div className="text-xs text-[#666666]">Pools</div>
            </CardContent>
          </Card>
        </div>

        {/* Claimable Rewards - Display only */}
        {totalClaimable > 0 && (
          <Card className="bg-gradient-to-r from-red-900/20 to-orange-800/10 border border-red-700/30">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-600/20 rounded-lg">
                  <Gift className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Available Rewards</h3>
                  <p className="text-2xl font-bold text-orange-400">{totalClaimable.toFixed(2)} QUAI</p>
                  <p className="text-xs text-[#999999]">Claim rewards from individual positions below</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Positions - Cleaner layout */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Active Positions</h2>
          
          <div className="space-y-4">
            {activePositions.map((position, index) => {
              const daysRemaining = position.endDate ? getDaysRemaining(position.endDate) : null;
              
              return (
                <Card key={index} className="bg-[#1a1a1a] border border-[#333333] hover:border-[#444444] transition-colors">
                  <CardContent className="p-6">
                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <TokenLogos tokens={position.tokens} size={32} />
                        <div>
                          <h3 className="text-lg font-semibold text-white">{position.name}</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-orange-400 text-sm font-medium">{position.apr}% APR</span>
                            {position.lockPeriod && (
                              <span className="text-xs bg-yellow-900/30 text-yellow-400 px-2 py-1 rounded">
                                🔒 {position.lockPeriod}D
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {position.earned > 0 && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="border-orange-500 text-orange-400 hover:bg-orange-500 hover:text-white"
                            onClick={() => {
                              if (position.id === 'native-quai' && position.isReal) {
                                staking.claimRewards();
                              } else {
                                // Mock claim for LP tokens
                                console.log(`Claiming ${position.earned.toFixed(2)} ${position.tokens[0]} from ${position.name}`);
                              }
                            }}
                            disabled={position.id === 'native-quai' && staking.isTransacting}
                          >
                            {position.id === 'native-quai' && staking.isTransacting ? 
                              'Claiming...' : 
                              `Claim`}
                          </Button>
                        )}
                        <Link href={`/stake/${position.id}`}>
                          <Button size="sm" variant="outline" className="border-[#333333] text-[#999999] hover:bg-[#222222]">
                            Manage
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      <div className="text-center p-3 bg-[#0a0a0a] rounded-lg">
                        <div className="text-lg font-bold text-white">{formatNumber(position.staked)}</div>
                        <div className="text-xs text-[#999999]">Staked {position.tokens[0]}</div>
                      </div>
                      
                      <div className="text-center p-3 bg-[#0a0a0a] rounded-lg">
                        <div className="text-lg font-bold text-orange-400">{position.earned.toFixed(2)}</div>
                        <div className="text-xs text-[#999999]">Earned {position.tokens[0]}</div>
                      </div>
                      
                      <div className="text-center p-3 bg-[#0a0a0a] rounded-lg">
                        <div className="text-lg font-bold text-white">
                          ${(position.staked * 0.05).toLocaleString()}
                        </div>
                        <div className="text-xs text-[#999999]">USD Value</div>
                      </div>
                      
                      <div className="text-center p-3 bg-[#0a0a0a] rounded-lg">
                        {daysRemaining !== null ? (
                          <>
                            <div className="text-lg font-bold text-white">{daysRemaining}</div>
                            <div className="text-xs text-[#999999]">Days Left</div>
                          </>
                        ) : (
                          <>
                            <div className="text-lg font-bold text-orange-400">Flexible</div>
                            <div className="text-xs text-[#999999]">No Lock</div>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Bottom Row */}
                    {position.endDate && (
                      <div className="text-sm text-[#999999]">
                        <Clock className="h-3 w-3 inline mr-1" />
                        Lock expires {formatDate(position.endDate)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Quick Actions - More compact */}
        <Card className="bg-[#1a1a1a] border border-[#333333]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-white">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-3">
              <Link href="/">
                <Button variant="outline" size="sm" className="border-[#333333] text-[#999999] hover:bg-[#222222]">
                  Stake More
                </Button>
              </Link>
              <Link href="/calculator">
                <Button variant="outline" size="sm" className="border-[#333333] text-[#999999] hover:bg-[#222222]">
                  Calculator
                </Button>
              </Link>
              <a 
                href="https://quaiscan.io" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="border-[#333333] text-[#999999] hover:bg-[#222222]">
                  Explorer
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}