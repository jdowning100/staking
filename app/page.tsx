'use client';
import React, { useContext, useState, useRef, useEffect } from 'react';
import { StateContext } from '@/store';
import { APP_TITLE, LOCK_PERIOD, REWARD_DELAY_PERIOD, EXIT_PERIOD } from '@/lib/config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronDown, ChevronUp, Users, Calendar, TrendingUp, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import Link from 'next/link';
import { useStaking } from '@/lib/hooks/useStaking';
import useLPStaking from '@/lib/hooks/useLPStaking';
import { LP_POOLS } from '@/lib/config';
import { formatBalance } from '@/lib/utils/formatBalance';

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

// Separate pools into categories
const quaiStakingPool = {
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
};

const lpStakingPools = [
  {
    id: 'wqi-quai',
    name: 'WQI/QUAI LP',
    tokens: ['WQI', 'QUAI'],
    baseApr: 6.8,
    lockPeriods: [
      { days: 30, multiplier: 1.0, apr: 6.8 }
    ],
    totalStaked: 1200000,
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

const PoolCard = ({ pool, stakingData, lpStakingData, isStakingLoading, isLPLoading }: {
  pool: typeof quaiStakingPool | typeof lpStakingPools[0],
  stakingData?: any,
  lpStakingData?: any,
  isStakingLoading?: boolean,
  isLPLoading?: boolean
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const { account } = useContext(StateContext);
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
      const particleCount = 16; // More particles

      for (let i = 0; i < particleCount; i++) {
        const sizes = ['size-small', 'size-medium', 'size-large'];
        const size = sizes[Math.floor(Math.random() * sizes.length)];

        const particle = document.createElement('div');
        particle.className = `particle ${size}`;
        particle.style.opacity = '0';

        // More spread out positioning - use padding from edges
        const padding = 20;
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

    const createBurstParticle = (x: number, y: number) => {
      const sizes = ['size-small', 'size-medium', 'size-large'];
      const size = sizes[Math.floor(Math.random() * sizes.length)];

      const particle = document.createElement('div');
      particle.className = `particle ${size}`;

      const vx = (Math.random() - 0.5) * 12;
      const vy = (Math.random() - 0.5) * 12;

      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;

      canvas.appendChild(particle);

      const particleData = {
        id: Date.now() + Math.random(),
        x,
        y,
        vx,
        vy,
        targetX: x,
        targetY: y,
        size,
        element: particle
      };

      particlesRef.current.push(particleData);

      // Remove burst particle after some time
      setTimeout(() => {
        const index = particlesRef.current.findIndex(p => p.id === particleData.id);
        if (index > -1) {
          particlesRef.current.splice(index, 1);
          if (particle.parentNode) {
            particle.parentNode.removeChild(particle);
          }
        }
      }, 2000);
    };

    const updateParticles = () => {
      const rect = button.getBoundingClientRect();

      particlesRef.current.forEach((particle, index) => {
        // Check if this is a pre-loaded particle (id < 25) or burst particle
        const isPreLoaded = particle.id < 25;

        if (isPreLoaded && isHovered.current) {
          // Cape/swarm physics - particles trail behind mouse with lag
          const dx = mousePos.current.x - particle.x;
          const dy = mousePos.current.y - particle.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Each particle has different lag/responsiveness for swarm effect
          const lag = 0.015 + (index * 0.008); // Slightly reduced responsiveness for more spread
          const followDistance = 30 + (index * 8); // Larger follow distances for more spread

          // Only apply force if mouse is moving or particle is too far
          if (isMouseMoving.current || distance > followDistance) {
            // Attraction force towards mouse with individual particle lag
            particle.vx += dx * lag;
            particle.vy += dy * lag;

            // Add more turbulence for natural swarm movement and spread
            if (isMouseMoving.current) {
              particle.vx += (Math.random() - 0.5) * 0.8;
              particle.vy += (Math.random() - 0.5) * 0.8;
            }
          }

          // Swarm cohesion - particles slightly attract to nearby particles
          particlesRef.current.forEach((otherParticle, otherIndex) => {
            if (otherIndex !== index && otherParticle.id < 25) {
              const pdx = otherParticle.x - particle.x;
              const pdy = otherParticle.y - particle.y;
              const pDistance = Math.sqrt(pdx * pdx + pdy * pdy);

              // Increased cohesion distance but reduced force for more spread
              if (pDistance > 0 && pDistance < 50) {
                const cohesionForce = 0.003;
                particle.vx += (pdx / pDistance) * cohesionForce;
                particle.vy += (pdy / pDistance) * cohesionForce;
              }

              // Add separation force to prevent clustering
              if (pDistance > 0 && pDistance < 25) {
                const separationForce = 0.01;
                particle.vx -= (pdx / pDistance) * separationForce;
                particle.vy -= (pdy / pDistance) * separationForce;
              }
            }
          });

          // Apply drag/friction based on whether mouse is moving
          const friction = isMouseMoving.current ? 0.90 : 0.85;
          particle.vx *= friction;
          particle.vy *= friction;
        } else {
          // Physics simulation for burst particles
          particle.vx *= 0.98; // Friction
          particle.vy *= 0.98;
          particle.vy += 0.1; // Gravity
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

        // Update position
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

      // Check if mouse actually moved
      const dx = mousePos.current.x - prevMousePos.current.x;
      const dy = mousePos.current.y - prevMousePos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      isMouseMoving.current = distance > 1; // Consider moving if moved more than 1px

      // Reset mouse moving flag after a short delay
      if (mouseTimeoutRef.current) {
        clearTimeout(mouseTimeoutRef.current);
      }
      mouseTimeoutRef.current = setTimeout(() => {
        isMouseMoving.current = false;
      }, 100);
    };

    const handleMouseEnter = () => {
      isHovered.current = true;
      // Show pre-loaded particles
      particlesRef.current.forEach(particle => {
        if (particle.id < 25) { // Pre-loaded particles
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
      // Hide pre-loaded particles but keep them
      particlesRef.current.forEach(particle => {
        if (particle.id < 25) { // Pre-loaded particles
          particle.element.style.opacity = '0';
        }
      });
      // Remove only burst particles
      particlesRef.current = particlesRef.current.filter(particle => {
        if (particle.id >= 25) { // Burst particles
          if (particle.element.parentNode) {
            particle.element.parentNode.removeChild(particle.element);
          }
          return false;
        }
        return true;
      });
    };

    const handleClick = (e: MouseEvent) => {
      const rect = button.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Create burst effect
      for (let i = 0; i < 16; i++) {
        setTimeout(() => {
          createBurstParticle(
            x + (Math.random() - 0.5) * 20,
            y + (Math.random() - 0.5) * 20
          );
        }, i * 12);
      }

      // Disperse existing particles
      particlesRef.current.forEach(particle => {
        const dx = particle.x - x;
        const dy = particle.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const force = 100 / (distance + 1);

        particle.vx += (dx / distance) * force;
        particle.vy += (dy / distance) * force;
        particle.element.classList.add('dispersing');
      });
    };

    // Initialize particles on component mount
    initializeParticles();

    button.addEventListener('mousemove', handleMouseMove);
    button.addEventListener('mouseenter', handleMouseEnter);
    button.addEventListener('mouseleave', handleMouseLeave);
    button.addEventListener('click', handleClick);

    return () => {
      button.removeEventListener('mousemove', handleMouseMove);
      button.removeEventListener('mouseenter', handleMouseEnter);
      button.removeEventListener('mouseleave', handleMouseLeave);
      button.removeEventListener('click', handleClick);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}K`;
    }
    return num.toLocaleString();
  };

  const safeIndex = Math.max(0, Math.min(selectedPeriod, pool.lockPeriods.length - 1));
  const currentPeriod = pool.lockPeriods[safeIndex];

  // Native QUAI uses the contract's lock mechanism, other pools use selectable periods
  const isNativeQuai = pool.id === 'native-quai';
  const isWQIQuaiLP = pool.id === 'wqi-quai';
  const hasRealLPData = isWQIQuaiLP && lpStakingData && (LP_POOLS as any)[pool.id]?.isActive;

  // Use real data for native QUAI and WQI/QUAI LP, mock for others
  let userStake;
  if (isNativeQuai && stakingData) {
    userStake = {
      staked: Number(stakingData.userInfo?.stakedAmountFormatted || 0),
      earned:
        Number(stakingData.userInfo?.claimableRewardsFormatted || 0) +
        Number(stakingData.userInfo?.totalDelayedRewardsFormatted || 0),
      lockPeriod: stakingData.userInfo?.isLocked ? 30 : null,
      endDate: stakingData.userInfo?.lockEndTime ? new Date(stakingData.userInfo.lockEndTime * 1000).toLocaleDateString() : null
    };
  } else if (hasRealLPData && lpStakingData.stakingInfo) {
    userStake = {
      staked: Number(lpStakingData.stakingInfo.stakedAmountFormatted || 0),
      earned:
        Number(lpStakingData.stakingInfo.claimableRewardsFormatted || 0) +
        Number(lpStakingData.stakingInfo.totalDelayedRewardsFormatted || 0),
      lockPeriod: lpStakingData.stakingInfo.isLocked ? 30 : null,
      endDate: lpStakingData.stakingInfo.lockStartTime ?
        new Date((lpStakingData.stakingInfo.lockStartTime + 30 * 24 * 60 * 60) * 1000).toLocaleDateString() :
        null
    };
  } else {
    userStake = userStakingData[pool.id as keyof typeof userStakingData];
  }

  const hasStake = userStake.staked > 0;

  return (
    <Card className="modern-card h-full group flex flex-col">
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

      <CardContent className="space-y-4 flex-grow flex flex-col">
        {/* APR Display */}
        <div>
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-sm text-[#999999]">APR:</span>
            {isNativeQuai && isStakingLoading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                <span className="text-sm text-[#666666]">Loading...</span>
              </div>
            ) : hasRealLPData && isLPLoading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                <span className="text-sm text-[#666666]">Loading...</span>
              </div>
            ) : (
              <>
                {/* Native QUAI APR Display */}
                {isNativeQuai ? (
                  stakingData?.contractInfo ? (
                    (() => {
                      const totalStakedNum = Number((stakingData.contractInfo.activeStakedFormatted ?? stakingData.contractInfo.totalStakedFormatted) || 0);
                      const rewardsNum = Number(stakingData.contractInfo.rewardBalanceFormatted || 0);
                      if (totalStakedNum <= 0 && rewardsNum > 0) {
                        return (
                          <span className="text-sm text-[#999999]">APR appears after first stake</span>
                        );
                      }
                      const apyVal = selectedPeriod === 0
                        ? (stakingData.contractInfo.apy30 ?? stakingData.contractInfo.apy)
                        : (stakingData.contractInfo.apy90 ?? stakingData.contractInfo.apy);
                      return (
                        <span className="text-xl font-bold text-white">{apyVal.toLocaleString('en-US', { maximumFractionDigits: 1 })}%</span>
                      );
                    })()
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                      <span className="text-sm text-[#666666]">Loading...</span>
                    </div>
                  )
                ) : (
                  /* LP Pool APR Display */
                  hasRealLPData ? (
                    lpStakingData.poolMetrics ? (
                      (() => {
                        const apyVal = selectedPeriod === 0
                          ? (lpStakingData.poolMetrics.apy30 ?? lpStakingData.poolMetrics.apr)
                          : (lpStakingData.poolMetrics.apy90 ?? lpStakingData.poolMetrics.apr);
                        return (
                          <span className="text-xl font-bold text-white">{apyVal.toLocaleString('en-US', { maximumFractionDigits: 1 })}%</span>
                        );
                      })()
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                        <span className="text-sm text-[#666666]">Loading...</span>
                      </div>
                    )
                  ) : (
                    /* Mock LP Pool APR */
                    <>
                      <span className="text-xl font-bold text-white">
                        {currentPeriod.apr.toLocaleString('en-US', { maximumFractionDigits: 1 })}%
                      </span>
                      <span className="text-sm text-[#999999]">
                        ~ {(currentPeriod.apr * 1.2).toLocaleString('en-US', { maximumFractionDigits: 1 })}%
                      </span>
                    </>
                  )
                )}
              </>
            )}
          </div>
        </div>

        {/* Stake Periods selector (now also for native and WQI/QUAI LP) */}
        {isNativeQuai || isWQIQuaiLP ? (
          <div>
            <div className="text-sm font-semibold text-white mb-2">Stake Periods:
              {[10, 20].map((mins, index) => (
                <button
                  key={mins}
                  onClick={() => setSelectedPeriod(index)}
                  className={cn(
                    "ml-2 px-2 py-0.5 rounded text-xs font-medium transition-colors",
                    selectedPeriod === index
                      ? "bg-red-900/50 text-white border border-red-700"
                      : "bg-[#222222] text-[#666666] hover:text-[#999999]"
                  )}
                >
                  {mins}m
                </button>
              ))}
            </div>
            {/* Inline Vesting / Exit summary (no header) */}
            <div className="text-xs sm:text-sm font-semibold text-white underline underline-offset-2 decoration-red-600">
              {isNativeQuai && isStakingLoading ? (
                <span className="inline-flex items-center gap-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-b border-red-600"></div>
                  Loading...
                </span>
              ) : (
                <>
                  {Math.floor(REWARD_DELAY_PERIOD / 60)}m reward vesting • {Math.floor(EXIT_PERIOD / 60)}m exit window
                </>
              )}
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
                    "ml-2 px-2 py-0.5 rounded text-xs font-medium transition-colors",
                    selectedPeriod === index
                      ? "bg-red-900/50 text-white border border-red-700"
                      : "bg-[#222222] text-[#666666] hover:text-[#999999]"
                  )}
                >
                  {period.days}D
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active Staked (excludes exit) */}
        <div>
          <div className="text-sm font-semibold text-white">
            Active Staked: {/* Native QUAI Active Staked Display */}
            {isNativeQuai ? (
              stakingData?.contractInfo ? (
                <>
                  {(() => {
                    const v = stakingData.contractInfo.activeStakedFormatted ?? stakingData.contractInfo.totalStakedFormatted;
                    const n = Number(v || '0');
                    return n.toLocaleString('en-US', { maximumFractionDigits: 3 });
                  })()} {pool.tokens[0]}
                  <span className="text-xs text-[#666666] ml-2">
                    ~${formatNumber(Number(stakingData.contractInfo.activeStakedFormatted ?? stakingData.contractInfo.totalStakedFormatted) * 0.05)}
                  </span>
                </>
              ) : (
                <div className="inline-flex items-center gap-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-b border-red-600"></div>
                  <span className="text-xs text-[#666666]">Loading...</span>
                </div>
              )
            ) : (
              /* LP Pool Total Staked Display */
              hasRealLPData ? (
                lpStakingData.poolMetrics ? (
                  <>
                    {(() => {
                      const n = Number(lpStakingData.poolMetrics.totalStakedFormatted || '0');
                      return n.toLocaleString('en-US', { maximumFractionDigits: 3 });
                    })()} LP
                    <span className="text-xs text-[#666666] ml-2">
                      ~${formatNumber(Number(lpStakingData.poolMetrics.totalStakedFormatted) * 0.05)}
                    </span>
                  </>
                ) : (
                  <div className="inline-flex items-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-red-600"></div>
                    <span className="text-xs text-[#666666]">Loading...</span>
                  </div>
                )
              ) : (
                /* Mock LP Pool Total Staked */
                <>
                  {formatNumber(pool.totalStaked)} {pool.tokens.length > 1 ? 'LP' : pool.tokens[0]}
                  <span className="text-xs text-[#666666] ml-2">
                    ~${formatNumber(pool.totalStaked * 0.05)}
                  </span>
                </>
              )
            )}
          </div>
        </div>

        {/* User Position (if staked) */}
        {hasStake && account?.addr && (
          <div className="bg-gradient-to-r from-white/5 to-red-900/10 border border-red-900/30 rounded-lg p-4 mt-3">
            <div className="flex items-center gap-2 mb-3">
              <Coins className="h-4 w-4 text-red-400" />
              <span className="text-sm text-red-400 font-medium">Your Position</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-[#999999]">Staked:</span>
                <div className="text-white font-semibold text-sm">
                  {formatNumber(userStake.staked)} {pool.tokens.length > 1 ? 'LP' : pool.tokens[0]}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-[#999999]">Earned:</span>
                <div className="text-orange-400 font-semibold text-sm">
                  {Number(userStake.earned || 0).toLocaleString('en-US', { maximumFractionDigits: 3 })} {isWQIQuaiLP ? 'QUAI' : pool.tokens[0]}
                </div>
              </div>
            </div>
            {/* Show lock info only for native QUAI, not LP */}
            {isNativeQuai && userStake.lockPeriod && (
              <div className="text-xs text-[#999999] mt-3 pt-3 border-t border-red-900/20">
                🔒 Locked for {userStake.lockPeriod} days • Ends {userStake.endDate}
              </div>
            )}
          </div>
        )}

        {/* Spacer to push button to bottom */}
        <div className="flex-grow"></div>

        {/* Stake Button */}
        <div className="pt-4">
          <div className="rotating-border-wrapper">
            <Link href={`/stake/${pool.id}${hasStake ? '?mode=manage' : ''}`} className="block">
              <Button
                ref={buttonRef}
                className="w-full h-16 bg-transparent hover:bg-black/30 text-white font-medium rounded border-0 particle-button"
              >
                <div ref={canvasRef} className="particle-canvas"></div>
                {hasStake ? 'Manage' : 'Stake'}
              </Button>
            </Link>
          </div>
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
              {isNativeQuai || isWQIQuaiLP ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-[#999999]">Stake Period:</span>
                    <span className="text-white">
                      {LOCK_PERIOD >= 3600 
                        ? `${Math.floor(LOCK_PERIOD / 3600)} hour${Math.floor(LOCK_PERIOD / 3600) !== 1 ? 's' : ''}`
                        : `${Math.floor(LOCK_PERIOD / 60)} minute${Math.floor(LOCK_PERIOD / 60) !== 1 ? 's' : ''}`
                      } (testing)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#999999]">Reward Vesting:</span>
                    <span className="text-sm sm:text-base text-white font-bold underline underline-offset-2 text-right">
                      {REWARD_DELAY_PERIOD >= 3600
                        ? `${Math.floor(REWARD_DELAY_PERIOD / 3600)} hour${Math.floor(REWARD_DELAY_PERIOD / 3600) !== 1 ? 's' : ''} delay before claim`
                        : `${Math.floor(REWARD_DELAY_PERIOD / 60)} minute${Math.floor(REWARD_DELAY_PERIOD / 60) !== 1 ? 's' : ''} delay before claim`
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#999999]">Exit Window:</span>
                    <span className="text-sm sm:text-base text-white font-bold underline underline-offset-2 text-right">
                      {EXIT_PERIOD >= 3600
                        ? `${Math.floor(EXIT_PERIOD / 3600)} hour${Math.floor(EXIT_PERIOD / 3600) !== 1 ? 's' : ''} wait to complete withdrawal`
                        : `${Math.floor(EXIT_PERIOD / 60)} minute${Math.floor(EXIT_PERIOD / 60) !== 1 ? 's' : ''} wait to complete withdrawal`
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#999999]">During Exit:</span>
                    <span className="text-orange-400">No rewards earned</span>
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
  const wqiQuaiLPStaking = useLPStaking('wqi-quai');

  return (
    <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4">
      <div className="w-full max-w-5xl mx-auto">
        <Tabs defaultValue="stake-quai" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="stake-quai">Stake QUAI</TabsTrigger>
            <TabsTrigger value="lp-staking">LP Staking</TabsTrigger>
          </TabsList>

          <TabsContent value="stake-quai" className="space-y-6">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-3">Real Proof-of-Work Powered Yield.</h1>
              <p className="text-lg text-[#999999]">
                Stake your $QUAI and receive rewards powered by{' '}
                <Link href="/what-is-soap" className="text-red-400 hover:text-red-300 underline">
                  SOAP
                </Link>
                .
              </p>
            </div>

            {/* Single QUAI Staking Pool */}
            <div className="flex justify-center">
              <div className="w-full max-w-lg">
                <PoolCard
                  pool={quaiStakingPool}
                  stakingData={staking}
                  isStakingLoading={staking.isLoading}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="lp-staking" className="space-y-6">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-3">Amplify Your Yields with Liquidity.</h1>
              <p className="text-lg text-[#999999]">
                Provide liquidity to earn dual rewards from trading fees and{' '}
                <Link href="/what-is-soap" className="text-red-400 hover:text-red-300 underline">
                  SOAP
                </Link>
                {' '}revenue.
              </p>
            </div>

            {/* LP Pools Grid - One per row on mobile */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {lpStakingPools.map((pool) => (
                <PoolCard
                  key={pool.id}
                  pool={pool}
                  lpStakingData={pool.id === 'wqi-quai' ? wqiQuaiLPStaking.poolInfo : undefined}
                  isLPLoading={pool.id === 'wqi-quai' ? wqiQuaiLPStaking.isLoading : false}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
