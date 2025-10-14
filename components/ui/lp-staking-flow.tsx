import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// Using native-like toggle buttons for tabs (no shadcn Tabs here)
import { Progress } from '@/components/ui/progress';
import { ArrowRight, Plus, Zap, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import useLPStaking from '@/lib/hooks/useLPStaking';
import { useDEX } from '@/lib/hooks/useDEX';
import { TokenSwap } from '@/components/ui/token-swap';
import Image from 'next/image';
import { formatBalance } from '@/lib/utils/formatBalance';

interface LPStakingFlowProps {
  poolId: string;
  onComplete?: () => void;
  initialMode?: 'stake' | 'manage'; // New prop to determine initial mode
}

// Token Logo Component
const TokenLogo = ({ token, size = 24 }: { token: string, size?: number }) => {
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

  return (
    <Image
      src={getTokenLogo(token)}
      alt={token}
      width={size}
      height={size}
      className="rounded-full"
    />
  );
};

export function LPStakingFlow({ poolId, onComplete, initialMode = 'stake' }: LPStakingFlowProps) {
  const { poolInfo, isLoading, isTransacting, error, approveToken, checkAllowance, refreshData, stakeLPTokens, withdrawLPTokens, claimLPRewards, emergencyWithdrawLP } = useLPStaking(poolId);
  const { addLiquidity, getOptimalAmounts, isTransacting: isDEXTransacting, error: dexError } = useDEX();
  const [currentStep, setCurrentStep] = useState(1);
  const [token0Amount, setToken0Amount] = useState('');
  const [token1Amount, setToken1Amount] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'rewards'>('deposit');
  const [needsToken0, setNeedsToken0] = useState(false);
  const [needsToken1, setNeedsToken1] = useState(false);
  const [isCalculatingOptimal, setIsCalculatingOptimal] = useState(false);

  // Check what user needs and auto-advance logic
  useEffect(() => {
    if (poolInfo) {
      // In manage mode, always show the management view
      if (initialMode === 'manage') {
        setCurrentStep(3);
        return;
      }
      
      const token0Balance = poolInfo.token0Balance?.balance || BigInt(0);
      const token1Balance = poolInfo.token1Balance?.balance || BigInt(0);
      const userLPBalance = poolInfo.userLPBalance || BigInt(0);
      
      // Define minimum required amounts (10 tokens each)
      const minAmount = BigInt('10000000000000000000'); // 10 tokens with 18 decimals
      
      // For QUAI pools, check native QUAI balance differently
      const hasEnoughToken0 = token0Balance >= minAmount;
      const hasEnoughToken1 = poolInfo.tokens[1] === 'QUAI' 
        ? token1Balance >= minAmount // For QUAI, check the wrapped balance shown to user
        : token1Balance >= minAmount;
      
      setNeedsToken0(!hasEnoughToken0);
      setNeedsToken1(!hasEnoughToken1);
      
      // If user has LP tokens, allow them to skip to step 2
      if (userLPBalance > BigInt(0)) {
        setCurrentStep(2); // Skip to staking step
      }
      // Auto-advance if user has enough of both tokens (at least 10 each)
      else if (hasEnoughToken0 && hasEnoughToken1) {
        setCurrentStep(2); // Skip to LP creation
      }
    }
  }, [poolInfo, initialMode]);

  // Handle token0 amount change and calculate optimal token1 amount
  const handleToken0AmountChange = async (value: string) => {
    setToken0Amount(value);
    
    if (!poolInfo || !value || isNaN(Number(value)) || Number(value) <= 0) {
      setToken1Amount('');
      return;
    }

    setIsCalculatingOptimal(true);
    try {
      const optimal = await getOptimalAmounts(
        poolInfo.tokens[0],
        poolInfo.tokens[1],
        value,
        poolInfo.lpToken?.address || ''
      );
      
      if (optimal) {
        setToken1Amount(formatBalance(optimal.amountB));
      }
    } catch (err) {
      console.error('Error calculating optimal token1 amount:', err);
    } finally {
      setIsCalculatingOptimal(false);
    }
  };

  // Handle token1 amount change and calculate optimal token0 amount
  const handleToken1AmountChange = async (value: string) => {
    setToken1Amount(value);
    
    if (!poolInfo || !value || isNaN(Number(value)) || Number(value) <= 0) {
      setToken0Amount('');
      return;
    }

    setIsCalculatingOptimal(true);
    try {
      const optimal = await getOptimalAmounts(
        poolInfo.tokens[1],
        poolInfo.tokens[0],
        value,
        poolInfo.lpToken?.address || ''
      );
      
      if (optimal) {
        setToken0Amount(formatBalance(optimal.amountB));
      }
    } catch (err) {
      console.error('Error calculating optimal token0 amount:', err);
    } finally {
      setIsCalculatingOptimal(false);
    }
  };

  // Handle adding liquidity
  const handleAddLiquidity = async () => {
    if (!poolInfo || !token0Amount || !token1Amount) return;
    
    try {
      await addLiquidity({
        tokenA: poolInfo.tokens[0],
        tokenB: poolInfo.tokens[1],
        amountADesired: token0Amount,
        amountBDesired: token1Amount,
        slippageTolerance: 0.5
      });
      
      // Refresh data after adding liquidity
      await refreshData();
      
      // Move to next step
      setCurrentStep(3);
    } catch (err) {
      console.error('Add liquidity failed:', err);
    }
  };

  // Handle LP token staking
  const handleStakeLPTokens = async () => {
    if (!stakeAmount) return;
    
    try {
      const success = await stakeLPTokens(stakeAmount);
      if (success) {
        setStakeAmount('');
        onComplete?.();
      }
    } catch (err) {
      console.error('LP staking failed:', err);
    }
  };

  if (isLoading) {
    return (
      <Card className="modern-card">
        <CardContent className="p-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-[#999999]">Loading pool information...</p>
        </CardContent>
      </Card>
    );
  }

  if (!poolInfo) {
    return (
      <Card className="modern-card">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-4" />
          <p className="text-white font-medium mb-2">Pool Not Found</p>
          <p className="text-[#999999] text-sm">The requested LP pool is not available yet.</p>
        </CardContent>
      </Card>
    );
  }

  const stepProgress = (currentStep / 3) * 100;

  return (
    <div className="space-y-6">
      {/* Progress Header (hidden in manage mode) */}
      {initialMode !== 'manage' && (
        <Card className="modern-card">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between mb-2">
              <CardTitle className="text-xl text-white">{poolInfo.name} Staking Flow</CardTitle>
              <div className="text-sm text-[#999999]">Step {currentStep}/3</div>
            </div>
            <Progress value={stepProgress} className="h-2" />
            <div className="flex justify-between text-xs text-[#999999] mt-2">
              <span className={currentStep >= 1 ? 'text-orange-400' : ''}>Get Tokens</span>
              <span className={currentStep >= 2 ? 'text-orange-400' : ''}>Create LP</span>
              <span className={currentStep >= 3 ? 'text-orange-400' : ''}>Stake LP</span>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Step 1: Get Required Tokens */}
      {currentStep === 1 && (
        <Card className="modern-card">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-orange-400" />
              Step 1: Get Required Tokens
            </CardTitle>
            <CardDescription className="text-[#999999]">
              You need both {poolInfo.tokens[0]} and {poolInfo.tokens[1]} to create LP tokens
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Token Balances */}
            <div className="grid grid-cols-2 gap-4">
              {/* Token 0 */}
              <div className="border border-[#333333] rounded-lg p-4 bg-[#0a0a0a]">
                <div className="flex items-center gap-2 mb-2">
                  <TokenLogo token={poolInfo.tokens[0]} size={20} />
                  <span className="text-white font-medium">{poolInfo.tokens[0]}</span>
                  {needsToken0 && <AlertCircle className="h-4 w-4 text-red-400" />}
                  {!needsToken0 && <CheckCircle className="h-4 w-4 text-green-400" />}
                </div>
                <div className="text-sm text-[#999999]">Balance:</div>
                <div className="text-white font-bold">
                  {poolInfo.token0Balance?.balanceFormatted || '0'} {poolInfo.tokens[0]}
                </div>
                <div className="text-xs text-[#666666] mt-1">
                  Minimum: 10 {poolInfo.tokens[0]}
                </div>
                {needsToken0 && (
                  <Button size="sm" className="w-full mt-2 bg-red-600 hover:bg-red-700">
                    Buy {poolInfo.tokens[0]}
                  </Button>
                )}
              </div>

              {/* Token 1 */}
              <div className="border border-[#333333] rounded-lg p-4 bg-[#0a0a0a]">
                <div className="flex items-center gap-2 mb-2">
                  <TokenLogo token={poolInfo.tokens[1]} size={20} />
                  <span className="text-white font-medium">{poolInfo.tokens[1]}</span>
                  {needsToken1 && <AlertCircle className="h-4 w-4 text-red-400" />}
                  {!needsToken1 && <CheckCircle className="h-4 w-4 text-green-400" />}
                </div>
                <div className="text-sm text-[#999999]">Balance:</div>
                <div className="text-white font-bold">
                  {poolInfo.token1Balance?.balanceFormatted || '0'} {poolInfo.tokens[1]}
                </div>
                <div className="text-xs text-[#666666] mt-1">
                  Minimum: 10 {poolInfo.tokens[1]}
                </div>
                {needsToken1 && (
                  <Button size="sm" className="w-full mt-2 bg-red-600 hover:bg-red-700">
                    {poolInfo.tokens[1] === 'QUAI' ? 'You have QUAI' : `Buy ${poolInfo.tokens[1]}`}
                  </Button>
                )}
              </div>
            </div>

            {/* LP Balance Display - Show if user has any LP tokens */}
            {poolInfo.userLPBalance > BigInt(0) && (
              <div className="bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-green-900/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  <span className="text-green-400 font-medium">You already have LP tokens!</span>
                </div>
                <div className="text-white text-lg font-bold">
                  {poolInfo.userLPBalanceFormatted} {poolInfo.tokens.join('/')} LP
                </div>
                <p className="text-sm text-[#999999] mt-2">
                  You can skip to Step 2 to stake your existing LP tokens or create more LP tokens here.
                </p>
              </div>
            )}

            {/* Token Swap Interfaces */}
            {(needsToken0 || needsToken1) && (
              <div className="space-y-4">
                {needsToken0 && (
                  <TokenSwap
                    fromToken="QUAI"
                    toToken={poolInfo.tokens[0]}
                    onSwapComplete={(amount) => {
                      // Refresh pool info after swap
                      refreshData();
                    }}
                  />
                )}
                
                {needsToken1 && poolInfo.tokens[1] !== 'QUAI' && (
                  <TokenSwap
                    fromToken="QUAI"
                    toToken={poolInfo.tokens[1]}
                    onSwapComplete={(amount) => {
                      // Refresh pool info after swap
                      refreshData();
                    }}
                  />
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between items-center pt-6 mt-6 border-t border-[#333333] gap-4">
              <Button variant="outline" disabled className="px-6 min-w-[120px]">
                Previous
              </Button>
              <div className="flex-1"></div>
              <Button 
                onClick={() => setCurrentStep(2)}
                disabled={(needsToken0 || needsToken1) && poolInfo.userLPBalance === BigInt(0)}
                className="modern-button px-6 min-w-[140px]"
              >
                {poolInfo.userLPBalance > BigInt(0) ? 'Next: Stake LP' : 'Next: Create LP'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Create LP Tokens */}
      {currentStep === 2 && (
        <Card className="modern-card">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Plus className="h-5 w-5 text-orange-400" />
              Step 2: Create LP Tokens
            </CardTitle>
            <CardDescription className="text-[#999999]">
              Add liquidity to the {poolInfo.name} pool to receive LP tokens
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* LP Creation Form */}
            <div className="space-y-4">
              {/* Token 0 Input */}
              <div className="border border-[#333333] rounded-lg p-4 bg-[#0a0a0a]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <TokenLogo token={poolInfo.tokens[0]} size={20} />
                    <span className="text-white font-medium">{poolInfo.tokens[0]}</span>
                  </div>
                  <div className="text-sm text-[#999999]">
                    Balance: {poolInfo.token0Balance?.balanceFormatted || '0'}
                  </div>
                </div>
                <Input
                  type="number"
                  placeholder="0.0"
                  value={token0Amount}
                  onChange={(e) => handleToken0AmountChange(e.target.value)}
                  className="bg-[#222222] border-[#333333] text-white"
                />
                {isCalculatingOptimal && (
                  <div className="text-xs text-blue-400 mt-1 flex items-center gap-1">
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-400"></div>
                    Calculating optimal amounts...
                  </div>
                )}
              </div>

              {/* Plus Icon */}
              <div className="flex justify-center">
                <div className="bg-[#333333] rounded-full p-2">
                  <Plus className="h-4 w-4 text-white" />
                </div>
              </div>

              {/* Token 1 Input */}
              <div className="border border-[#333333] rounded-lg p-4 bg-[#0a0a0a]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <TokenLogo token={poolInfo.tokens[1]} size={20} />
                    <span className="text-white font-medium">{poolInfo.tokens[1]}</span>
                  </div>
                  <div className="text-sm text-[#999999]">
                    Balance: {poolInfo.token1Balance?.balanceFormatted || '0'}
                  </div>
                </div>
                <Input
                  type="number"
                  placeholder="0.0"
                  value={token1Amount}
                  onChange={(e) => handleToken1AmountChange(e.target.value)}
                  className="bg-[#222222] border-[#333333] text-white"
                />
                {isCalculatingOptimal && (
                  <div className="text-xs text-blue-400 mt-1 flex items-center gap-1">
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-400"></div>
                    Calculating optimal amounts...
                  </div>
                )}
              </div>
            </div>

            {/* Current LP Balance */}
            {poolInfo.userLPBalance > BigInt(0) && (
              <div className="bg-green-900/20 border border-green-900/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <span className="text-green-400 font-medium">Existing LP Position</span>
                </div>
                <p className="text-sm text-[#999999]">
                  You have {poolInfo.userLPBalanceFormatted} LP tokens
                </p>
              </div>
            )}

            {/* DEX Error Display */}
            {dexError && (
              <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="text-red-400 text-sm">{dexError}</span>
                </div>
              </div>
            )}

            {/* Add Liquidity Button */}
            <Button 
              className="w-full modern-button"
              disabled={!token0Amount || !token1Amount || isTransacting || isDEXTransacting}
              onClick={handleAddLiquidity}
            >
              {isTransacting || isDEXTransacting ? 'Adding Liquidity...' : 'Add Liquidity'}
            </Button>

            {/* Navigation */}
            <div className="flex justify-between items-center pt-6 mt-6 border-t border-[#333333] gap-4">
              <Button variant="outline" onClick={() => setCurrentStep(1)} className="px-6 min-w-[120px]">
                Previous
              </Button>
              <div className="flex-1"></div>
              <Button 
                onClick={() => setCurrentStep(3)}
                disabled={poolInfo.userLPBalance === BigInt(0)}
                className="modern-button px-6 min-w-[140px]"
              >
                Next: Stake LP
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Stake LP Tokens / Manage */}
      {currentStep === 3 && (
        <Card className="modern-card">
          <CardHeader>
            <CardTitle className="text-lg text-white text-center">{poolInfo.name} Management</CardTitle>
            <CardDescription className="text-[#999999] text-center">
              Deposit LP tokens, withdraw during grace, and claim rewards
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* (No stake period selector in manage view) */}
            {/* User Staking Info (list view like native) */}
            <div className="pt-1 space-y-2">
              <div className="flex justify-between">
                <span className="text-[#999999]">Your Stake</span>
                <span className="font-medium text-white">{poolInfo.stakingInfo?.stakedAmountFormatted || '0'} LP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#999999]">Claimable Rewards</span>
                <span className="font-medium text-green-400">{poolInfo.stakingInfo?.claimableRewardsFormatted || '0'} QUAI</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#999999]">Locked Rewards</span>
                <span className="font-medium text-yellow-400">
                  {poolInfo.stakingInfo ?
                    formatBalance(
                      Number(poolInfo.stakingInfo.totalDelayedRewardsFormatted) - Number(poolInfo.stakingInfo.claimableRewardsFormatted)
                    ) : '0'} QUAI
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#999999]">Status</span>
                <span className={cn('font-medium', poolInfo.stakingInfo?.isLocked ? 'text-yellow-400' : (poolInfo.stakingInfo?.isInGracePeriod ? 'text-green-400' : 'text-white'))}>
                  {poolInfo.stakingInfo?.isLocked
                    ? `Locked (${poolInfo.stakingInfo.timeUntilUnlock}s)`
                    : poolInfo.stakingInfo?.isInGracePeriod
                      ? `Grace Period (${poolInfo.stakingInfo.timeLeftInGracePeriod}s)`
                      : 'Unlocked'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#999999]">Current Cycle</span>
                <span className="font-medium text-white">{poolInfo.stakingInfo?.currentCycle ?? 0}</span>
              </div>
            </div>

            {/* Action Tabs (native-like buttons) */}
            <div className="pt-4">
              <div className="flex gap-2 mb-4">
                <Button
                  variant={activeTab === 'deposit' ? 'default' : 'outline'}
                  onClick={() => setActiveTab('deposit')}
                  className={cn('flex-1', activeTab === 'deposit' ? 'bg-red-9 hover:bg-red-10 text-white' : 'border-[#333333] text-[#999999] hover:bg-[#222222]')}
                >
                  Deposit
                </Button>
                <Button
                  variant={activeTab === 'withdraw' ? 'default' : 'outline'}
                  onClick={() => setActiveTab('withdraw')}
                  className={cn('flex-1', activeTab === 'withdraw' ? 'bg-red-9 hover:bg-red-10 text-white' : 'border-[#333333] text-[#999999] hover:bg-[#222222]')}
                >
                  Withdraw
                </Button>
                <Button
                  variant={activeTab === 'rewards' ? 'default' : 'outline'}
                  onClick={() => setActiveTab('rewards')}
                  className={cn('flex-1', activeTab === 'rewards' ? 'bg-red-9 hover:bg-red-10 text-white' : 'border-[#333333] text-[#999999] hover:bg-[#222222]')}
                >
                  Rewards
                </Button>
              </div>

              {activeTab === 'deposit' && (
                <div className="space-y-3">
                  <div className="text-sm text-[#999999]">Available: {poolInfo.userLPBalanceFormatted} LP</div>
                  <Input
                    type="number"
                    placeholder="Amount to deposit (LP)"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    className="bg-[#222222] border-[#333333] text-white"
                  />
                  <Button
                    onClick={handleStakeLPTokens}
                    disabled={isTransacting || !stakeAmount || parseFloat(stakeAmount) <= 0}
                    className="w-full bg-red-9 hover:bg-red-10 text-white"
                  >
                    {isTransacting ? 'Processing...' : 'Deposit'}
                  </Button>
                </div>
              )}

              {activeTab === 'withdraw' && (
                <div className="space-y-3">
                  <Input
                    type="number"
                    placeholder="Amount to withdraw (LP)"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="bg-[#222222] border-[#333333] text-white"
                    disabled={!poolInfo.stakingInfo?.isInGracePeriod || isTransacting}
                  />
                  <Button
                    onClick={async () => { if (withdrawAmount) await withdrawLPTokens(withdrawAmount); }}
                    disabled={
                      isTransacting || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || !poolInfo.stakingInfo?.isInGracePeriod
                    }
                    className={cn('w-full', !poolInfo.stakingInfo?.isInGracePeriod ? 'bg-[#333333] text-[#999999]' : 'bg-red-9 hover:bg-red-10 text-white')}
                  >
                    {isTransacting ? 'Processing...' : (!poolInfo.stakingInfo?.isInGracePeriod ? 'Locked' : 'Withdraw')}
                  </Button>
                  {!poolInfo.stakingInfo?.isInGracePeriod && (
                    <p className="text-xs text-yellow-400 text-center">Withdraw is only available during the grace period</p>
                  )}
                </div>
              )}

              {activeTab === 'rewards' && (
                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-[#999999]">Claimable Now</div>
                    <div className="text-2xl font-bold text-green-400">{poolInfo.stakingInfo?.claimableRewardsFormatted || '0'} QUAI</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 bg-[#0a0a0a] rounded-lg">
                      <div className="text-xs text-[#999999]">Locked (Delayed) Rewards</div>
                      <div className="text-lg font-bold text-yellow-400">
                        {poolInfo.stakingInfo ?
                          formatBalance(
                            Number(poolInfo.stakingInfo.totalDelayedRewardsFormatted) - Number(poolInfo.stakingInfo.claimableRewardsFormatted)
                          ) : '0'} QUAI
                      </div>
                    </div>
                    <div className="p-3 bg-[#0a0a0a] rounded-lg">
                      <div className="text-xs text-[#999999]">Next Unlock</div>
                      <div className="text-sm font-medium text-white">
                        {(() => {
                          const list = poolInfo.stakingInfo?.delayedRewards || [];
                          const next = list
                            .filter((r) => r.timeUntilUnlock > 0)
                            .reduce((min, r) => Math.min(min, r.timeUntilUnlock), Infinity);
                          return Number.isFinite(next)
                            ? new Date(Date.now() + (next as number) * 1000).toLocaleString()
                            : '-';
                        })()}
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={claimLPRewards}
                    disabled={isTransacting || !poolInfo.stakingInfo || (poolInfo.stakingInfo.claimableRewards === BigInt(0) && poolInfo.stakingInfo.pendingRewards === BigInt(0))}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isTransacting ? 'Processing...' : 'Claim Rewards'}
                  </Button>
                </div>
              )}
            </div>

            {/* Footer Navigation (optional) */}
            <div className="flex justify-between items-center pt-4 mt-2 border-t border-[#333333] gap-4">
              <Button variant="outline" onClick={() => setCurrentStep(2)} className="px-6 min-w-[120px]">
                Back
              </Button>
              <div className="flex-1" />
              <Button onClick={onComplete} className="modern-button px-6 min-w-[140px]">
                Done
                <CheckCircle className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Card className="modern-card bg-red-900/20 border-red-700/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="h-4 w-4" />
              <span className="font-medium">Error</span>
            </div>
            <p className="text-red-300 text-sm mt-1">{error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
