import React, { useState } from 'react';
import { UserStakingInfo, ContractInfo } from '@/lib/hooks/useStaking';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { TOKEN_SYMBOL } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronDown, ChevronUp, ExternalLink, Lock, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatQuai } from '@/lib/hooks/useStaking';

interface StakingInfoProps {
  userInfo: UserStakingInfo | null;
  contractInfo: ContractInfo | null;
  isLoading: boolean;
  isTransacting: boolean;
  error: string | null;
  transactionHash: string | null;
  onDeposit: (amount: string) => Promise<void>;
  onWithdraw: (amount: string) => Promise<void>;
  onClaimRewards: () => Promise<void>;
  onEmergencyWithdraw: () => Promise<void>;
  onRefresh: () => void;
}

export function StakingInfo({
  userInfo,
  contractInfo,
  isLoading,
  isTransacting,
  error,
  transactionHash,
  onDeposit,
  onWithdraw,
  onClaimRewards,
  onEmergencyWithdraw,
  onRefresh
}: StakingInfoProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) return;
    await onDeposit(depositAmount);
    setDepositAmount('');
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) return;
    await onWithdraw(withdrawAmount);
    setWithdrawAmount('');
  };

  const formatTimeRemaining = (seconds: number) => {
    if (seconds <= 0) return 'Ready';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-[#1a1a1a] border border-[#333333] rounded-xl overflow-hidden shadow-none">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-white">Loading Staking Information</CardTitle>
          <CardDescription className="text-[#999999]">
            Please wait while we fetch your staking details...
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-6">
          <Loader2 className="h-8 w-8 animate-spin text-red-9" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border border-[#333333] rounded-xl overflow-hidden shadow-none">
        <CardHeader>
          <CardTitle className="text-xl text-white text-center">
            Staking Pool
          </CardTitle>
          <CardDescription className="text-[#999999] text-center">
            Stake {TOKEN_SYMBOL} to earn rewards
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 text-red-400 rounded-md text-sm mb-4">
              {error}
            </div>
          )}

          {transactionHash && (
            <div className="p-3 bg-green-500/10 text-green-400 rounded-md text-sm mb-4">
              Transaction submitted:{' '}
              <a
                href={`https://quaiscan.io/tx/${transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-green-300"
              >
                View on Explorer <ExternalLink className="inline h-3 w-3" />
              </a>
            </div>
          )}

          {/* Pool Stats */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-[#999999]">Total Staked</span>
              <span className="font-medium text-white">
                {contractInfo?.totalStakedFormatted || '0'} {TOKEN_SYMBOL}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#999999]">APY</span>
              <span className="font-medium text-green-400">
                {contractInfo?.apy ? `${contractInfo.apy.toFixed(2)}%` : '0%'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#999999]">Your Balance</span>
              <span className="font-medium text-white">
                {contractInfo?.userQuaiBalanceFormatted || '0'} {TOKEN_SYMBOL}
              </span>
            </div>
          </div>

          {/* User Staking Info */}
          {userInfo && userInfo.stakedAmount > BigInt(0) && (
            <div className="pt-4 border-t border-[#333333] space-y-2">
              <div className="flex justify-between">
                <span className="text-[#999999]">Your Stake</span>
                <span className="font-medium text-white">
                  {userInfo.stakedAmountFormatted} {TOKEN_SYMBOL}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#999999]">Pending Rewards</span>
                <span className="font-medium text-green-400">
                  {userInfo.pendingRewardsFormatted} {TOKEN_SYMBOL}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#999999]">Lock Status</span>
                <span className={`font-medium flex items-center gap-1 ${userInfo.isLocked ? 'text-yellow-400' : 'text-green-400'}`}>
                  {userInfo.isLocked ? (
                    <>
                      <Lock className="h-3 w-3" />
                      Locked ({formatTimeRemaining(userInfo.timeUntilUnlock)})
                    </>
                  ) : userInfo.isInGracePeriod ? (
                    <>
                      <Clock className="h-3 w-3" />
                      Grace Period ({formatTimeRemaining(userInfo.timeLeftInGracePeriod)})
                    </>
                  ) : (
                    'Unlocked'
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#999999]">Current Cycle</span>
                <span className="font-medium text-white">
                  {userInfo.currentCycle}
                </span>
              </div>
            </div>
          )}

          {/* Action Tabs */}
          <div className="pt-4">
            <div className="flex gap-2 mb-4">
              <Button
                variant={activeTab === 'deposit' ? 'default' : 'outline'}
                onClick={() => setActiveTab('deposit')}
                className={cn(
                  'flex-1',
                  activeTab === 'deposit' 
                    ? 'bg-red-9 hover:bg-red-10 text-white' 
                    : 'border-[#333333] text-[#999999] hover:bg-[#222222]'
                )}
              >
                Deposit
              </Button>
              <Button
                variant={activeTab === 'withdraw' ? 'default' : 'outline'}
                onClick={() => setActiveTab('withdraw')}
                className={cn(
                  'flex-1',
                  activeTab === 'withdraw' 
                    ? 'bg-red-9 hover:bg-red-10 text-white' 
                    : 'border-[#333333] text-[#999999] hover:bg-[#222222]'
                )}
              >
                Withdraw
              </Button>
            </div>

            {activeTab === 'deposit' ? (
              <div className="space-y-3">
                <Input
                  type="number"
                  placeholder={`Amount to deposit (${TOKEN_SYMBOL})`}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="bg-[#222222] border-[#333333] text-white"
                  disabled={isTransacting}
                />
                <Button
                  onClick={handleDeposit}
                  disabled={isTransacting || !depositAmount || parseFloat(depositAmount) <= 0}
                  className="w-full bg-red-9 hover:bg-red-10 text-white"
                >
                  {isTransacting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Deposit'
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Input
                  type="number"
                  placeholder={`Amount to withdraw (${TOKEN_SYMBOL})`}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="bg-[#222222] border-[#333333] text-white"
                  disabled={isTransacting || !userInfo?.canWithdraw}
                />
                <Button
                  onClick={handleWithdraw}
                  disabled={
                    isTransacting || 
                    !withdrawAmount || 
                    parseFloat(withdrawAmount) <= 0 ||
                    !userInfo?.canWithdraw
                  }
                  className={cn(
                    'w-full',
                    !userInfo?.canWithdraw
                      ? 'bg-[#333333] text-[#999999]'
                      : 'bg-red-9 hover:bg-red-10 text-white'
                  )}
                >
                  {isTransacting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : !userInfo?.canWithdraw ? (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Locked
                    </>
                  ) : (
                    'Withdraw'
                  )}
                </Button>
                {userInfo && userInfo.isLocked && (
                  <p className="text-xs text-yellow-400 text-center">
                    Withdrawal available in {formatTimeRemaining(userInfo.timeUntilUnlock)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Claim Rewards Button */}
          {userInfo && userInfo.pendingRewards > BigInt(0) && (
            <Button
              onClick={onClaimRewards}
              disabled={isTransacting}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {isTransacting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Claim ${userInfo.pendingRewardsFormatted} ${TOKEN_SYMBOL}`
              )}
            </Button>
          )}

          {/* Details Toggle */}
          <Button
            variant="outline"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full border-[#333333] text-[#999999] hover:bg-[#222222] flex items-center justify-center"
          >
            {showDetails ? (
              <>
                <ChevronUp className="w-4 h-4 mr-2" />
                Hide Details
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-2" />
                Show Details
              </>
            )}
          </Button>

          {/* Detailed Information */}
          {showDetails && contractInfo && (
            <div className="pt-4 border-t border-[#333333] space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-[#999999]">Current Block</p>
                  <p className="font-medium text-white">
                    <a
                      href={`https://quaiscan.io/block/${contractInfo.currentBlock}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center hover:text-red-9"
                    >
                      {contractInfo.currentBlock}
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[#999999]">Reward Per Block</p>
                  <p className="font-medium text-white">
                    {contractInfo.rewardPerBlockFormatted} {TOKEN_SYMBOL}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-[#999999]">Contract Balance</p>
                  <p className="font-medium text-white">
                    {contractInfo.contractBalanceFormatted} {TOKEN_SYMBOL}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[#999999]">Reward Balance</p>
                  <p className="font-medium text-white">
                    {contractInfo.rewardBalanceFormatted} {TOKEN_SYMBOL}
                  </p>
                </div>
              </div>

              {contractInfo.hasUserLimit && (
                <div className="p-3 bg-[#222222] rounded-md">
                  <p className="text-[#999999] text-sm">
                    Pool Limit Per User: {contractInfo.poolLimitPerUserFormatted} {TOKEN_SYMBOL}
                  </p>
                </div>
              )}

              {/* Emergency Withdraw */}
              {userInfo && userInfo.stakedAmount > BigInt(0) && (
                <div className="pt-3 border-t border-[#333333]">
                  <p className="text-xs text-[#999999] mb-2">
                    Emergency withdraw will forfeit all pending rewards
                  </p>
                  <Button
                    onClick={onEmergencyWithdraw}
                    variant="outline"
                    disabled={isTransacting}
                    className="w-full border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                  >
                    Emergency Withdraw
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={isLoading || isTransacting}
            className="w-full border-[#333333] text-[#999999] hover:bg-[#222222]"
          >
            Refresh
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}