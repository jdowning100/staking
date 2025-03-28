import React, { useState } from 'react';
import { VestingSchedule } from '@/lib/hooks/useVesting';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { TOKEN_SYMBOL } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronDown, ChevronUp, ExternalLink, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatQuai } from '@/lib/hooks/useVesting';

interface VestingInfoProps {
  vestingSchedule: VestingSchedule | null;
  isChecking: boolean;
  isClaiming: boolean;
  onClaim: () => Promise<void>;
  onRefresh: () => void;
  error: string | null;
}

export function VestingInfo({ vestingSchedule, isChecking, isClaiming, onClaim, onRefresh, error }: VestingInfoProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Prevent double submission
  const handleClaim = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onClaim();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Validate vesting schedule data
  const isValidVestingSchedule = (schedule: VestingSchedule) => {
    return (
      schedule &&
      BigInt(schedule.rawTotalAmount) > BigInt(0) &&
      schedule.startBlock > 0 &&
      schedule.durationInBlocks > 0 &&
      schedule.cliffBlock > 0
    );
  };

  if (isChecking) {
    return (
      <Card className="bg-[#1a1a1a] border border-[#333333] rounded-xl overflow-hidden shadow-none">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-white">Loading Vesting Information</CardTitle>
          <CardDescription className="text-[#999999]">
            Please wait while we fetch your vesting details...
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-6">
          <Loader2 className="h-8 w-8 animate-spin text-red-9" />
        </CardContent>
      </Card>
    );
  }

  if (!vestingSchedule || !isValidVestingSchedule(vestingSchedule)) {
    return (
      <Card className="bg-[#1a1a1a] border border-[#333333] rounded-xl overflow-hidden shadow-none">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-white">No Vesting Schedule Found</CardTitle>
          <CardDescription className="text-[#999999]">
            The connected wallet does not have a vesting schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-6">
          <p className="text-[#999999] text-sm">Please refresh or contact support if you believe this is an mistake.</p>
        </CardContent>
        <CardFooter className="flex justify-center pb-6">
          <Button variant="outline" onClick={onRefresh} className="border-[#333333] text-[#999999] hover:bg-[#222222]">
            Refresh
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // At this point vestingSchedule is guaranteed to be non-null
  const AVERAGE_BLOCK_TIME = 5; // seconds per block

  // Calculate time until next unlock (start)
  const blocksUntilNextUnlock =
    vestingSchedule.currentBlock < vestingSchedule.startBlock
      ? vestingSchedule.startBlock - vestingSchedule.currentBlock
      : 0;
  const secondsUntilNextUnlock = blocksUntilNextUnlock * AVERAGE_BLOCK_TIME;
  const hoursUntilNextUnlock = Math.floor(secondsUntilNextUnlock / 3600);
  const daysUntilNextUnlock = Math.floor(hoursUntilNextUnlock / 24);

  // Calculate time until cliff is reached
  const secondsUntilCliff = vestingSchedule.blocksUntilCliff * AVERAGE_BLOCK_TIME;
  const hoursUntilCliff = Math.floor(secondsUntilCliff / 3600);
  const daysUntilCliff = Math.floor(hoursUntilCliff / 24);
  const cliffTimeRemaining =
    daysUntilCliff > 0
      ? `~${daysUntilCliff} days`
      : hoursUntilCliff > 0
        ? `~${hoursUntilCliff} hours`
        : `~${Math.ceil(secondsUntilCliff / 60)} minutes`;

  // Determine if claim button should be enabled
  const canClaim =
    !isClaiming &&
    !isSubmitting &&
    vestingSchedule.cliffReached &&
    BigInt(vestingSchedule.rawClaimableAmount) > BigInt(0) &&
    vestingSchedule.contractBalance >= vestingSchedule.rawClaimableAmount &&
    vestingSchedule.userQuaiBalance >= BigInt(1000000000000000);

  return (
    <Card className="bg-[#1a1a1a] border border-[#333333] rounded-xl overflow-hidden shadow-none">
      <CardHeader>
        <CardTitle className="text-xl text-white text-center flex items-center justify-center gap-2">
          Your Token Vesting
          {!vestingSchedule.cliffReached && <Lock className="h-5 w-5 text-yellow-400" />}
        </CardTitle>
        <CardDescription className="text-[#999999] text-center">
          Track and claim your vested {TOKEN_SYMBOL} tokens
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="p-3 bg-red-500/10 text-red-400 rounded-md text-sm mb-4">{error}</div>}

        {/* Add warning for insufficient contract balance */}
        {vestingSchedule.contractBalance && vestingSchedule.contractBalance < vestingSchedule.rawClaimableAmount && (
          <div className="p-3 bg-yellow-500/10 text-yellow-400 rounded-md text-sm mb-4">
            Warning: The contract does not have enough tokens to fulfill your claim. Contract balance:{' '}
            {formatQuai(vestingSchedule.contractBalance)} QUAI, Required: {vestingSchedule.claimableAmount} QUAI
          </div>
        )}

        {/* Add warning for insufficient QUAI balance */}
        {vestingSchedule.userQuaiBalance !== undefined &&
          vestingSchedule.userQuaiBalance < BigInt(1000000000000000) && (
            <div className="p-3 bg-yellow-500/10 text-yellow-400 rounded-md text-sm mb-4">
              Warning: You need at least 0.001 QUAI to cover transaction fees. Your balance is{' '}
              {formatQuai(vestingSchedule.userQuaiBalance)} QUAI.
            </div>
          )}

        {/* Add warning for cliff not reached */}
        {!vestingSchedule.cliffReached && (
          <div className="p-3 bg-yellow-500/10 text-yellow-400 rounded-md text-sm mb-4 flex items-start gap-2">
            <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium mb-1">Cliff Period Not Reached</p>
              <p>
                Your tokens are vesting but you cannot claim them until the cliff period ends in {cliffTimeRemaining} (
                {vestingSchedule.blocksUntilCliff.toLocaleString()} blocks).
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-[#999999]">Total Allocation</span>
            <span className="font-medium text-white">
              {vestingSchedule.totalAmount} {TOKEN_SYMBOL}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#999999]">Claimed Amount</span>
            <span className="font-medium text-white">
              {vestingSchedule.releasedAmount} {TOKEN_SYMBOL}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#999999]">Vested Amount</span>
            <span className="font-semibold text-white">
              {vestingSchedule.vestedAmount} {TOKEN_SYMBOL}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#999999]">Claimable Amount</span>
            <span className={`font-semibold ${vestingSchedule.cliffReached ? 'text-red-9' : 'text-yellow-400'}`}>
              {vestingSchedule.cliffReached ? vestingSchedule.claimableAmount : '0'} {TOKEN_SYMBOL}
              {!vestingSchedule.cliffReached && BigInt(vestingSchedule.rawVestedAmount) > BigInt(0) && (
                <span className="text-xs ml-1 text-yellow-400 justify-center items-center">
                  <Lock className="h-3 w-3 inline-block" />
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-white">Vesting Progress</span>
            <span className="text-white">{vestingSchedule.progress.toFixed(2)}%</span>
          </div>
          <Progress value={vestingSchedule.progress} className="h-2 bg-[#333333]" />
        </div>

        {/* Details toggle button */}
        <Button
          variant="outline"
          onClick={() => setShowDetails(!showDetails)}
          className="w-full mt-2 border-[#333333] text-[#999999] hover:bg-[#222222] flex items-center justify-center"
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

        {/* Detailed information (only shown when toggled) */}
        {showDetails && (
          <div className="mt-4 pt-4 border-t border-[#333333] space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-[#999999]">Current Block</p>
                <p className="font-medium text-white">
                  <a
                    href={`https://quaiscan.io/block/${vestingSchedule.currentBlock}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center hover:text-red-9"
                  >
                    {vestingSchedule.currentBlock}
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[#999999]">Start Block</p>
                <p className="font-medium text-white">
                  <a
                    href={`https://quaiscan.io/block/${vestingSchedule.startBlock}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center hover:text-red-9"
                  >
                    {vestingSchedule.startBlock}
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[#999999]">Cliff Block</p>
                <p className="font-medium text-white">
                  <a
                    href={`https://quaiscan.io/block/${vestingSchedule.cliffBlock}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center hover:text-red-9"
                  >
                    {vestingSchedule.cliffBlock}
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                  {!vestingSchedule.cliffReached && (
                    <span className="text-xs ml-2 text-yellow-400">
                      <Lock className="h-3 w-3 inline-block mr-1" /> {cliffTimeRemaining} remaining
                    </span>
                  )}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[#999999]">End Block</p>
                <p className="font-medium text-white">
                  <a
                    href={`https://quaiscan.io/block/${vestingSchedule.startBlock + vestingSchedule.durationInBlocks}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center hover:text-red-9"
                  >
                    {vestingSchedule.startBlock + vestingSchedule.durationInBlocks}
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[#999999]">Duration</p>
                <p className="font-medium text-white">{vestingSchedule.durationInBlocks} blocks</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[#999999]">Estimated Time Until Complete</p>
              <p className="font-medium text-white">
                {vestingSchedule.progress < 100
                  ? `~${Math.ceil((((100 - vestingSchedule.progress) / 100) * vestingSchedule.durationInBlocks * AVERAGE_BLOCK_TIME) / 86400)} days`
                  : 'Vesting Complete'}
              </p>
            </div>

            {vestingSchedule.currentBlock < vestingSchedule.startBlock && (
              <div className="p-3 bg-yellow-500/10 text-yellow-400 rounded-md text-sm">
                <p>
                  Vesting hasn&apos;t started yet.{' '}
                  {daysUntilNextUnlock > 0
                    ? `~${daysUntilNextUnlock} days remaining`
                    : `~${hoursUntilNextUnlock} hours remaining`}{' '}
                  until the vesting period begins.
                </p>
              </div>
            )}

            <div className="p-3 rounded-md text-sm bg-[#222222]">
              <p className="text-white font-medium mb-1">How Vesting Works</p>
              <p className="text-[#bbbbbb]">
                Your tokens vest linearly from the start block to the end block. The cliff period only affects when you
                can claim tokens, not how tokens vest. Once the cliff period is reached, you can claim all tokens that
                have vested up to that point.
              </p>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex gap-4">
        <Button
          onClick={handleClaim}
          className={cn('flex-1', !canClaim ? 'bg-[#333333] text-[#999999]' : 'bg-red-9 hover:bg-red-10 text-white')}
          disabled={!canClaim}
        >
          {isClaiming || isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Claiming...
            </>
          ) : (
            <>
              {!vestingSchedule.cliffReached ? (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Locked Until Cliff
                </>
              ) : (
                'Claim Tokens'
              )}
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={onRefresh}
          disabled={isChecking}
          className="border-[#333333] text-[#999999] hover:bg-[#222222]"
        >
          Refresh
        </Button>
      </CardFooter>
    </Card>
  );
}
