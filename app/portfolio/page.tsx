'use client';
import React, { useContext, useRef, useEffect } from 'react';
import { StateContext, DispatchContext } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coins, TrendingUp, Clock, ExternalLink, ArrowRight, Gift, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import Link from 'next/link';
import { useStaking } from '@/lib/hooks/useStaking';
import useLPStaking from '@/lib/hooks/useLPStaking';
import { LP_POOLS } from '@/lib/config';
import { formatBalance } from '@/lib/utils/formatBalance';
import { requestAccounts } from '@/lib/wallet';

// Connect Wallet Button with particle effects
const ConnectWalletButton = () => {
  const dispatch = useContext(DispatchContext);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Array<{
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    targetX: number;
    targetY: number;
    size: string;
    element: HTMLDivElement;
  }>>([]);
  const animationRef = useRef<number>();
  const isHovered = useRef(false);
  const mousePos = useRef({ x: 0, y: 0 });
  const prevMousePos = useRef({ x: 0, y: 0 });
  const isMouseMoving = useRef(false);
  const mouseTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const button = buttonRef.current;
    const canvas = canvasRef.current;
    if (!button || !canvas) return;

    // Pre-load particles
    const initializeParticles = () => {
      const rect = button.getBoundingClientRect();
      const particleCount = 12;

      for (let i = 0; i < particleCount; i++) {
        const sizes = ['size-small', 'size-medium', 'size-large'];
        const size = sizes[Math.floor(Math.random() * sizes.length)];

        const particle = document.createElement('div');
        particle.className = `particle ${size}`;
        particle.style.opacity = '0';

        const padding = 15;
        const x = padding + Math.random() * (rect.width - padding * 2);
        const y = padding + Math.random() * (rect.height - padding * 2);

        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;

        canvas.appendChild(particle);

        const particleData = {
          id: i,
          x,
          y,
          vx: 0,
          vy: 0,
          targetX: x,
          targetY: y,
          size,
          element: particle
        };

        particlesRef.current.push(particleData);
      }
    };

    const updateParticles = () => {
      const rect = button.getBoundingClientRect();

      particlesRef.current.forEach((particle, index) => {
        const isPreLoaded = particle.id < 20;

        if (isPreLoaded && isHovered.current) {
          const dx = mousePos.current.x - particle.x;
          const dy = mousePos.current.y - particle.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          const lag = 0.015 + (index * 0.008);
          const followDistance = 25 + (index * 6);

          if (isMouseMoving.current || distance > followDistance) {
            particle.vx += dx * lag;
            particle.vy += dy * lag;

            if (isMouseMoving.current) {
              particle.vx += (Math.random() - 0.5) * 0.6;
              particle.vy += (Math.random() - 0.5) * 0.6;
            }
          }

          const friction = isMouseMoving.current ? 0.90 : 0.85;
          particle.vx *= friction;
          particle.vy *= friction;
        }

        particle.x += particle.vx;
        particle.y += particle.vy;

        // Boundary collision
        if (particle.x <= 0 || particle.x >= rect.width - 8) {
          particle.vx *= -0.8;
          particle.x = Math.max(0, Math.min(rect.width - 8, particle.x));
        }
        if (particle.y <= 0 || particle.y >= rect.height - 8) {
          particle.vy *= -0.8;
          particle.y = Math.max(0, Math.min(rect.height - 8, particle.y));
        }

        particle.element.style.left = `${particle.x}px`;
        particle.element.style.top = `${particle.y}px`;
      });

      if (isHovered.current) {
        animationRef.current = requestAnimationFrame(updateParticles);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = button.getBoundingClientRect();
      prevMousePos.current = { ...mousePos.current };
      mousePos.current.x = e.clientX - rect.left;
      mousePos.current.y = e.clientY - rect.top;

      const dx = mousePos.current.x - prevMousePos.current.x;
      const dy = mousePos.current.y - prevMousePos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      isMouseMoving.current = distance > 1;

      if (mouseTimeoutRef.current) {
        clearTimeout(mouseTimeoutRef.current);
      }
      mouseTimeoutRef.current = setTimeout(() => {
        isMouseMoving.current = false;
      }, 100);
    };

    const handleMouseEnter = () => {
      isHovered.current = true;
      particlesRef.current.forEach(particle => {
        if (particle.id < 20) {
          particle.element.style.opacity = '1';
        }
      });
      updateParticles();
    };

    const handleMouseLeave = () => {
      isHovered.current = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      particlesRef.current.forEach(particle => {
        if (particle.id < 20) {
          particle.element.style.opacity = '0';
        }
      });
    };

    initializeParticles();
    button.addEventListener('mousemove', handleMouseMove);
    button.addEventListener('mouseenter', handleMouseEnter);
    button.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      button.removeEventListener('mousemove', handleMouseMove);
      button.removeEventListener('mouseenter', handleMouseEnter);
      button.removeEventListener('mouseleave', handleMouseLeave);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div className="rotating-border-wrapper">
      <Button
        ref={buttonRef}
        onClick={() => requestAccounts(dispatch)}
        className="w-full h-16 bg-transparent hover:bg-black/30 text-white font-medium rounded border-0 particle-button px-8"
      >
        <div ref={canvasRef} className="particle-canvas"></div>
        Connect Wallet
      </Button>
    </div>
  );
};

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
  const wqiQuaiLPStaking = useLPStaking('wqi-quai');

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

  // Add real WQI/QUAI LP position if user has staked amount
  const realLPStaked = wqiQuaiLPStaking.poolInfo?.stakingInfo ?
    Number(wqiQuaiLPStaking.poolInfo.stakingInfo.stakedAmountFormatted) : 0;
  const realLPEarned = wqiQuaiLPStaking.poolInfo?.stakingInfo ?
    Number(wqiQuaiLPStaking.poolInfo.stakingInfo.pendingRewardsFormatted) : 0;
  const realLPApr = wqiQuaiLPStaking.poolInfo?.poolMetrics?.apr || 0;

  if (realLPStaked > 0 && LP_POOLS['wqi-quai']?.isActive) {
    allPositions.push({
      id: 'wqi-quai',
      name: 'WQI/QUAI LP',
      tokens: ['WQI', 'QUAI'],
      staked: realLPStaked,
      earned: realLPEarned,
      apr: realLPApr,
      lockPeriod: wqiQuaiLPStaking.poolInfo?.stakingInfo?.isLocked ? 30 : null,
      endDate: wqiQuaiLPStaking.poolInfo?.stakingInfo?.lockStartTime ?
        new Date((wqiQuaiLPStaking.poolInfo.stakingInfo.lockStartTime + 30 * 24 * 60 * 60) * 1000).toISOString().split('T')[0] :
        null,
      isReal: true
    });
  }

  // Add mock LP positions for other pools (only if they have staked amounts)
  Object.entries(userStakingData).filter(([id]) => id !== 'native-quai' && id !== 'wqi-quai').forEach(([id, data]) => {
    if (data.staked > 0) {
      allPositions.push({
        id,
        ...data,
        name: id === 'quai-usdc' ? 'QUAI/USDC LP' : 'WQI/USDC LP',
        tokens: id === 'quai-usdc' ? ['QUAI', 'USDC'] : ['WQI', 'USDC'],
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
      <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4">
        <div className="w-full max-w-4xl mx-auto">
          <Card className="modern-card">
            <CardContent className="p-12 text-center">
              <Coins className="h-16 w-16 text-[#666666] mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-white mb-2">Portfolio</h1>
              <p className="text-[#999999] mb-6">
                Connect your wallet to view your staking positions and earnings
              </p>
              <ConnectWalletButton />
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // Show loading state while staking data is loading
  if (staking.isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4">
        <div className="w-full max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-8">Your Portfolio</h1>

          <Card className="modern-card">
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
      <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4">
        <div className="w-full max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-8">Your Portfolio</h1>

          <Card className="modern-card">
            <CardContent className="p-12 text-center">
              <TrendingUp className="h-16 w-16 text-[#666666] mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">No Active Positions</h2>
              <p className="text-[#999999] mb-6">
                You don&apos;t have any active staking positions yet. Start staking to see your portfolio here.
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
    <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4">
      <div className="w-full max-w-6xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-white">Your Portfolio</h1>

        {/* Portfolio Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="modern-card">
            <CardContent className="p-4 text-center">
              <div className="text-xl font-bold text-white">{formatNumber(totalStaked)}</div>
              <div className="text-xs text-[#999999]">Total Staked</div>
              <div className="text-xs text-[#666666]">QUAI</div>
            </CardContent>
          </Card>

          <Card className="modern-card">
            <CardContent className="p-4 text-center">
              <div className="text-xl font-bold text-orange-400">{formatBalance(totalEarned)}</div>
              <div className="text-xs text-[#999999]">Total Earned</div>
              <div className="text-xs text-[#666666]">QUAI</div>
            </CardContent>
          </Card>

          <Card className="modern-card">
            <CardContent className="p-4 text-center">
              <div className="text-xl font-bold text-red-400">{weightedApr.toFixed(1)}%</div>
              <div className="text-xs text-[#999999]">Weighted APR</div>
              <div className="text-xs text-[#666666]">Average</div>
            </CardContent>
          </Card>

          <Card className="modern-card">
            <CardContent className="p-4 text-center">
              <div className="text-xl font-bold text-orange-500">{activePositions.length}</div>
              <div className="text-xs text-[#999999]">Active Positions</div>
              <div className="text-xs text-[#666666]">Pools</div>
            </CardContent>
          </Card>
        </div>

        {/* Claimable Rewards - Display only */}
        {totalClaimable > 0 && (
          <Card className="modern-card bg-gradient-to-r from-red-900/20 to-orange-800/10 border-red-700/30">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-600/20 rounded-lg">
                  <Gift className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Available Rewards</h3>
                  <p className="text-2xl font-bold text-orange-400">{formatBalance(totalClaimable)} QUAI</p>
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
                <Card key={index} className="modern-card">
                  <CardContent className="p-6">
                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <TokenLogos tokens={position.tokens} size={32} />
                        <div>
                          <h3 className="text-lg font-semibold text-white">{position.name}</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-orange-400 text-sm font-medium">
                              {position.apr >= 1000 ?
                                `${Math.round(position.apr).toLocaleString()}%` :
                                `${position.apr.toFixed(1)}%`} APR
                            </span>
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
                              } else if (position.id === 'wqi-quai' && position.isReal) {
                                wqiQuaiLPStaking.claimLPRewards();
                              } else {
                                // Mock claim for other LP tokens
                                console.log(`Claiming ${position.earned.toFixed(2)} rewards from ${position.name}`);
                              }
                            }}
                            disabled={(position.id === 'native-quai' && staking.isTransacting) ||
                              (position.id === 'wqi-quai' && wqiQuaiLPStaking.isTransacting)}
                          >
                            {(position.id === 'native-quai' && staking.isTransacting) ||
                              (position.id === 'wqi-quai' && wqiQuaiLPStaking.isTransacting) ?
                              'Claiming...' :
                              `Claim`}
                          </Button>
                        )}
                        <Link href={`/stake/${position.id}?mode=manage`}>
                          <Button size="sm" variant="outline" className="border-[#333333] text-[#999999] hover:bg-[#222222]">
                            Manage
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center p-3 bg-[#0a0a0a] rounded-lg">
                        <div className="text-lg font-bold text-white">{formatNumber(position.staked)}</div>
                        <div className="text-xs text-[#999999]">
                          Staked {position.tokens.length > 1 ? 'LP' : position.tokens[0]}
                        </div>
                        <div className="text-xs text-white mt-1">
                          ~${(position.staked * 0.05).toLocaleString()}
                        </div>
                      </div>

                      <div className="text-center p-3 bg-[#0a0a0a] rounded-lg">
                        <div className="text-lg font-bold text-orange-400">{formatBalance(position.earned)}</div>
                        <div className="text-xs text-[#999999]">
                          Earned {position.id === 'wqi-quai' ? 'QUAI' : position.tokens[0]}
                        </div>
                        <div className="text-xs text-white mt-1">
                          ~${(position.earned * 0.05).toFixed(2)}
                        </div>
                      </div>

                      <div className="text-center p-3 bg-[#0a0a0a] rounded-lg flex flex-col justify-center">
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
        <Card className="modern-card">
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
                href={account?.addr ? `https://quaiscan.io/address/${account.addr}` : "https://quaiscan.io"}
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