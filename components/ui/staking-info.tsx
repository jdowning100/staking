import React, { useState } from 'react';
import { UserStakingInfo, ContractInfo, DelayedReward } from '@/lib/hooks/useStaking';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { TOKEN_SYMBOL } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronDown, ChevronUp, ExternalLink, Lock, Clock, Timer, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatQuai } from '@/lib/hooks/useStaking';
import { formatBalance } from '@/lib/utils/formatBalance';
import { REWARD_DELAY_PERIOD, EXIT_PERIOD } from '@/lib/config';

interface StakingInfoProps {
  userInfo: UserStakingInfo | null;
  contractInfo: ContractInfo | null;
  isLoading: boolean;
  isTransacting: boolean;
  error: string | null;
  transactionHash: string | null;
  onDeposit: (amount: string, durationSeconds: number) => Promise<void>;
  onRequestWithdraw: (amount: string) => Promise<void>;
  onExecuteWithdraw: () => Promise<void>;
  onCancelWithdraw: () => Promise<void>;
  onClaimRewards: () => Promise<void>;
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
  onRequestWithdraw,
  onExecuteWithdraw,
  onCancelWithdraw,
  onClaimRewards,
  onRefresh
}: StakingInfoProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'rewards'>('deposit');
  const [stakePeriod, setStakePeriod] = useState<600 | 1200>(600);

  // If user already has an active position, enforce matching duration
  const existingLock = userInfo && userInfo.stakedAmount > BigInt(0) ? (userInfo.lockDurationSeconds || 0) : 0;
  const mustMatchExisting = existingLock === 600 || existingLock === 1200;
  const isMismatchedSelection = mustMatchExisting && stakePeriod !== existingLock;

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) return;
    await onDeposit(depositAmount, stakePeriod);
    setDepositAmount('');
  };

  const handleRequestWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) return;
    await onRequestWithdraw(withdrawAmount);
    setWithdrawAmount('');
  };

  const handleExecuteWithdraw = async () => {
    await onExecuteWithdraw();
  };

  const handleCancelWithdraw = async () => {
    await onCancelWithdraw();
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
      <Card className="modern-card overflow-hidden">
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

  // Precompute UI fragments to simplify JSX
  const lockStatusNode = (() => {
    if (!userInfo) return 'Unlocked';
    if (userInfo.isLocked) {
      return (
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" />
          {`Locked (${formatTimeRemaining(userInfo.timeUntilUnlock)})`}
        </span>
      );
    }
    return 'Unlocked';
  })();

  const depositBtnContent = isTransacting ? (
    <span className="inline-flex items-center">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Processing...
    </span>
  ) : (
    'Deposit'
  );

  const canWithdraw = !!(userInfo && (userInfo.isInExitPeriod || userInfo.canExecuteWithdraw));
  const withdrawBtnContent = isTransacting ? (
    <span className="inline-flex items-center">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Processing...
    </span>
  ) : !canWithdraw ? (
    <span className="inline-flex items-center">
      <Lock className="mr-2 h-4 w-4" />
      Locked
    </span>
  ) : (
    'Withdraw'
  );

  const claimBtnContent = isTransacting
    ? (
      <span className="inline-flex items-center">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Processing...
      </span>
    )
    : `Claim ${userInfo?.pendingRewardsFormatted ?? ''} ${TOKEN_SYMBOL}`;

  // Component for displaying delayed rewards
  const DelayedRewardsDisplay = () => {
    if (!userInfo?.delayedRewards.length) {
      return (
        <div className="text-center py-4">
          <p className="text-[#999999]">No delayed rewards</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <h4 className="font-medium text-white">Vesting Rewards</h4>
        {userInfo.delayedRewards.map((reward, index) => (
          <div key={index} className="p-3 bg-[#222222] rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-white font-medium">
                {reward.amountFormatted} {TOKEN_SYMBOL}
              </span>
              <span className={cn(
                "text-sm",
                reward.timeUntilUnlock <= 0 ? "text-green-400" : "text-yellow-400"
              )}>
                {reward.timeUntilUnlock <= 0 ? 'Ready!' : formatTimeRemaining(reward.timeUntilUnlock)}
              </span>
            </div>
          </div>
        ))}
        {userInfo && userInfo.claimableRewards > BigInt(0) ? (
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
              `Claim ${userInfo.claimableRewardsFormatted} QUAI`
            )}
          </Button>
        ) : (
          <div className="text-center text-sm text-[#999999]">
            No rewards available to claim yet.
          </div>
        )}
      </div>
    );
  };

  // Component for displaying withdrawal status and actions
  const WithdrawalStatusDisplay = () => {
    if (!userInfo?.isInExitPeriod) {
      return null;
    }

    return (
      <div className="space-y-3">
        <div className={cn(
          "p-3 rounded-lg text-center",
          userInfo.canExecuteWithdraw
            ? "bg-green-500/10 text-green-400"
            : "bg-orange-500/10 text-orange-400"
        )}>
          <div className="flex items-center justify-center gap-2 mb-2">
            {userInfo.canExecuteWithdraw ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <Timer className="h-5 w-5" />
            )}
            <span className="font-medium">
              {userInfo.canExecuteWithdraw ? 'Withdrawal Ready' : 'In Exit Period'}
            </span>
          </div>
          <p className="text-sm">
            {userInfo.canExecuteWithdraw
              ? 'You can now complete your withdrawal'
              : `Time remaining: ${formatTimeRemaining(userInfo.timeUntilWithdrawalAvailable)}`
            }
          </p>
        </div>

        <div className="flex gap-2">
          {userInfo.canExecuteWithdraw ? (
            <Button
              onClick={handleExecuteWithdraw}
              disabled={isTransacting}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {isTransacting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Complete Withdrawal'
              )}
            </Button>
          ) : null}

          <Button
            onClick={handleCancelWithdraw}
            disabled={isTransacting}
            variant="outline"
            className={cn(
              userInfo.canExecuteWithdraw ? "flex-1" : "w-full",
              "border-orange-500 text-orange-400 hover:bg-orange-500 hover:text-white"
            )}
          >
            {isTransacting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Cancel Request'
            )}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="modern-card overflow-hidden">
        <CardHeader>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 text-red-400 rounded-md text-sm mb-4">
              {error}
            </div>
          )}

          {transactionHash && (
            <div className="p-3 bg-green-500/10 text-green-400 rounded-md text-sm mb-2">
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


          {/* User Staking Info */}
          {userInfo && userInfo.stakedAmount > BigInt(0) && (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-[#999999]">Your Stake</span>
                <span className="font-medium text-white">
                  {userInfo.stakedAmountFormatted} {TOKEN_SYMBOL}
                </span>
              </div>
              {/* Reward Metrics */}
              <div className="flex justify-between">
                <span className="text-[#999999]">Claimable Rewards</span>
                <span className="font-medium text-white">
                  {userInfo.claimableRewardsFormatted} {TOKEN_SYMBOL}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#999999]">Vesting Rewards</span>
                <span className="font-medium text-white">
                  {userInfo.totalDelayedRewardsFormatted} {TOKEN_SYMBOL}
                </span>
              </div>
              {(() => {
                const totalEarned =
                  (userInfo.claimableRewards || BigInt(0)) +
                  (userInfo.totalDelayedRewards || BigInt(0));
                const totalEarnedFormatted = formatBalance(formatQuai(totalEarned));
                return (
                  <div className="flex justify-between">
                    <span className="text-[#999999]">Total Rewards</span>
                    <span className="font-medium text-white">
                      {totalEarnedFormatted} {TOKEN_SYMBOL}
                    </span>
                  </div>
                );
              })()}
              <div className="flex justify-between">
                <span className="text-[#999999]">Unlock Status</span>
                <span className="font-medium text-sm text-white">
                  {userInfo.userStatus}
                </span>
              </div>
              {userInfo.lockEndTime && userInfo.lockEndTime > Math.floor(Date.now() / 1000) && (
                <div className="flex justify-between">
                  <span className="text-[#999999]">Unlock Date</span>
                  <span className="font-medium text-white text-sm">
                    {new Date(userInfo.lockEndTime * 1000).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#999999]">Vesting Status</span>
                <span className="font-medium text-sm text-white">
                  {userInfo.lockStartTime ? (
                    Math.floor(Date.now() / 1000) >= userInfo.lockStartTime + Math.floor(REWARD_DELAY_PERIOD)
                      ? 'Rewards Vesting'
                      : `Vesting in ${Math.max(0, Math.ceil((userInfo.lockStartTime + Math.floor(REWARD_DELAY_PERIOD) - Math.floor(Date.now() / 1000)) / 60))}m`
                  ) : 'No Stake'}
                </span>
              </div>
              {userInfo.isInExitPeriod && (
                <div className="flex justify-between">
                  <span className="text-[#999999]">Exit Progress</span>
                  <span className="font-medium text-orange-400">
                    {userInfo.canExecuteWithdraw ? 'Complete!' : formatTimeRemaining(userInfo.timeUntilWithdrawalAvailable)}
                  </span>
                </div>
              )}
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
              <Button
                variant={activeTab === 'rewards' ? 'default' : 'outline'}
                onClick={() => setActiveTab('rewards')}
                className={cn(
                  'flex-1',
                  activeTab === 'rewards'
                    ? 'bg-red-9 hover:bg-red-10 text-white'
                    : 'border-[#333333] text-[#999999] hover:bg-[#222222]'
                )}
              >
                Rewards
              </Button>
            </div>

            {activeTab === 'deposit' && (
              <div className="space-y-3">
                {/* Guidance for existing positions: match lock + lock reset note */}
                {userInfo && userInfo.stakedAmount > BigInt(0) && (
                  <div className="p-3 bg-yellow-500/10 text-yellow-400 rounded-lg text-xs">
                    <p>
                      You already have an active position locked for {existingLock === 1200 ? '20m' : '10m'}. Top-ups must match your current lock.
                    </p>
                    <p className="mt-1">
                      Adding to your position resets your lock start to now for the same period, and any matured rewards are auto‑claimed before the top‑up.
                    </p>
                  </div>
                )}

                <Input
                  type="number"
                  placeholder={`Amount to deposit (${TOKEN_SYMBOL})`}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="bg-[#222222] border-[#333333] text-white"
                  disabled={isTransacting || userInfo?.isInExitPeriod}
                />
                <div className="text-center">
                  <div className="text-xs text-[#666666] mb-1">Stake Period</div>
                  <div className="flex justify-center gap-1 mb-3">
                    <button
                      onClick={() => setStakePeriod(600)}
                      disabled={mustMatchExisting && existingLock !== 600}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                        stakePeriod === 600 ?
                          (mustMatchExisting && existingLock !== 600 ? "bg-[#222222] text-[#555555] border border-[#333333]" : "bg-red-900/50 text-white border border-red-700") :
                          (mustMatchExisting && existingLock !== 600 ? "bg-[#1c1c1c] text-[#444444] cursor-not-allowed" : "bg-[#222222] text-[#666666] hover:text-[#999999]")
                      )}
                    >
                      10m
                    </button>
                    <button
                      onClick={() => setStakePeriod(1200)}
                      disabled={mustMatchExisting && existingLock !== 1200}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                        stakePeriod === 1200 ?
                          (mustMatchExisting && existingLock !== 1200 ? "bg-[#222222] text-[#555555] border border-[#333333]" : "bg-red-900/50 text-white border border-red-700") :
                          (mustMatchExisting && existingLock !== 1200 ? "bg-[#1c1c1c] text-[#444444] cursor-not-allowed" : "bg-[#222222] text-[#666666] hover:text-[#999999]")
                      )}
                    >
                      20m
                    </button>
                  </div>
                  {/* warnings moved above amount input */}
                  
                  {/* Stake Information */}
                  {depositAmount && parseFloat(depositAmount) > 0 && (
                    <div className="bg-[#0a0a0a] rounded-lg p-3 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#999999]">Stake Unlocks:</span>
                        <span className="text-white">
                          {new Date(Date.now() + stakePeriod * 1000).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#999999]">Rewards Begin Vesting:</span>
                        <span className="text-yellow-400">
                          {new Date(Date.now() + REWARD_DELAY_PERIOD * 1000).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      {contractInfo && (
                        <div className="flex justify-between">
                          <span className="text-[#999999]">Estimated APR After Deposit:</span>
                          <span className="text-blue-400">
                            {(() => {
                              // Calculate projected APR after deposit is added to pool
                              const currentTotalStaked = parseFloat((contractInfo.activeStakedFormatted ?? contractInfo.totalStakedFormatted) || '0');
                              const newDeposit = parseFloat(depositAmount);
                              const projectedTotalStaked = currentTotalStaked + newDeposit;
                              
                              // Get current reward rate (rewardPerBlock or emissionRate)
                              const currentRewardBalance = parseFloat(contractInfo.rewardBalanceFormatted || '0');
                              
                              if (projectedTotalStaked === 0 || currentRewardBalance === 0) {
                                return 'TBD';
                              }
                              
                              // Simple APR calculation: (annual rewards / total staked) * 100
                              // Assuming current reward distribution continues
                              const currentApy = stakePeriod === 600 
                                ? (contractInfo.apy30 ?? contractInfo.apy)
                                : (contractInfo.apy90 ?? contractInfo.apy);
                              
                              // Estimate annual rewards from current APY and current pool size
                              const estimatedAnnualRewards = (currentTotalStaked * currentApy / 100);
                              
                              // Calculate projected APR with larger pool
                              const projectedApr = projectedTotalStaked > 0 
                                ? (estimatedAnnualRewards / projectedTotalStaked) * 100 
                                : currentApy;
                              
                              return `${projectedApr.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
                            })()}
                          </span>
                        </div>
                      )}
                      {contractInfo && (
                        <div className="flex justify-between">
                          <span className="text-[#999999]">Your Period Earnings:</span>
                          <span className="text-green-400">
                            {(() => {
                              // Use the projected APR for earnings calculation
                              const currentTotalStaked = parseFloat((contractInfo.activeStakedFormatted ?? contractInfo.totalStakedFormatted) || '0');
                              const newDeposit = parseFloat(depositAmount);
                              const projectedTotalStaked = currentTotalStaked + newDeposit;
                              
                              const currentApy = stakePeriod === 600 
                                ? (contractInfo.apy30 ?? contractInfo.apy)
                                : (contractInfo.apy90 ?? contractInfo.apy);
                              
                              let projectedApr = currentApy;
                              if (projectedTotalStaked > 0 && currentTotalStaked > 0) {
                                const estimatedAnnualRewards = (currentTotalStaked * currentApy / 100);
                                projectedApr = (estimatedAnnualRewards / projectedTotalStaked) * 100;
                              }
                              
                              const periodInSeconds = stakePeriod;
                              const annualReturn = (newDeposit * projectedApr / 100);
                              const periodReturn = (annualReturn * periodInSeconds) / (365 * 24 * 60 * 60);
                              return `${periodReturn.toFixed(4)} QUAI`;
                            })()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  onClick={handleDeposit}
                  disabled={
                    isTransacting ||
                    !depositAmount ||
                    parseFloat(depositAmount) <= 0 ||
                    userInfo?.isInExitPeriod ||
                    isMismatchedSelection
                  }
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
                {userInfo?.isInExitPeriod && (
                  <p className="text-xs text-orange-400 text-center">
                    Cannot deposit during exit period
                  </p>
                )}
              </div>
            )}

            {activeTab === 'withdraw' && (
              <div className="space-y-4">
                <div className="p-3 bg-orange-500/10 text-orange-400 rounded-lg text-xs">
                  <p className="font-medium mb-1">Exit Window System:</p>
                  <p>Withdrawals require a {Math.floor(EXIT_PERIOD / 60)}-minute exit window. During this period, you earn no rewards and cannot deposit more tokens.</p>
                </div>
                <WithdrawalStatusDisplay />

                {!userInfo?.isInExitPeriod && (
                  <div className="space-y-3">
                    <Input
                      type="number"
                      placeholder={`Amount to withdraw (${TOKEN_SYMBOL})`}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="bg-[#222222] border-[#333333] text-white"
                      disabled={isTransacting || !userInfo?.canRequestWithdraw}
                    />
                    <Button
                      onClick={handleRequestWithdraw}
                      disabled={
                        isTransacting ||
                        !withdrawAmount ||
                        parseFloat(withdrawAmount) <= 0 ||
                        !userInfo?.canRequestWithdraw
                      }
                      className={cn(
                        'w-full',
                        !userInfo?.canRequestWithdraw
                          ? 'bg-[#333333] text-[#999999]'
                          : 'bg-red-9 hover:bg-red-10 text-white'
                      )}
                    >
                      {isTransacting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : !userInfo?.canRequestWithdraw ? (
                        <>
                          <Lock className="mr-2 h-4 w-4" />
                          {userInfo?.isLocked ? 'Locked' : 'Cannot Withdraw'}
                        </>
                      ) : (
                        'Request Withdrawal'
                      )}
                    </Button>
                    {userInfo?.isLocked && (
                      <div className="text-xs text-center space-y-1">
                        <p className="text-yellow-400">
                          Withdrawal available in {formatTimeRemaining(userInfo.timeUntilUnlock)}
                        </p>
                        <p className="text-red-400">
                          Early withdrawal forfeits all pending rewards
                        </p>
                        <p className="text-orange-400">
                          All withdrawals require {Math.floor(EXIT_PERIOD / 60)}-minute exit window
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'rewards' && (
              <div className="space-y-4">
                <div className="p-3 bg-yellow-500/10 text-yellow-400 rounded-lg text-xs">
                  <p className="font-medium mb-1">Reward Vesting System:</p>
                  <p>As you earn rewards, they are placed in a {Math.floor(REWARD_DELAY_PERIOD / 60)}-minute delay queue before becoming claimable. Once the delay has passed, you can claim them immediately.</p>
                </div>
                <DelayedRewardsDisplay />
              </div>
            )}
          </div>



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
                      <span>{contractInfo.currentBlock}</span>
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

            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
