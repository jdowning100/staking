import React, { useState } from 'react';
import { VestingSchedule } from '@/lib/hooks/useVesting';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { TOKEN_SYMBOL } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
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

  if (!vestingSchedule || BigInt(vestingSchedule.rawTotalAmount) === BigInt(0)) {
    return (
      <Card className="bg-[#1a1a1a] border border-[#333333] rounded-xl overflow-hidden shadow-none">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-white">No Vesting Schedule Found</CardTitle>
          <CardDescription className="text-[#999999]">
            You don&apos;t have any vested tokens in this contract.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-6">
          <p className="text-[#999999] text-sm">
            This wallet address is not registered as a beneficiary in the vesting contract.
          </p>
        </CardContent>
        <CardFooter className="flex justify-center pb-6">
          <Button variant="outline" onClick={onRefresh} className="border-[#333333] text-[#999999] hover:bg-[#222222]">
            Refresh
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Calculate estimated time until next unlock
  const AVERAGE_BLOCK_TIME = 5; // seconds per block
  const blocksUntilNextUnlock =
    vestingSchedule.currentBlock < vestingSchedule.startBlock
      ? vestingSchedule.startBlock - vestingSchedule.currentBlock
      : 0;
  const secondsUntilNextUnlock = blocksUntilNextUnlock * AVERAGE_BLOCK_TIME;
  const hoursUntilNextUnlock = Math.floor(secondsUntilNextUnlock / 3600);
  const daysUntilNextUnlock = Math.floor(hoursUntilNextUnlock / 24);

  return (
    <Card className="bg-[#1a1a1a] border border-[#333333] rounded-xl overflow-hidden shadow-none">
      <CardHeader>
        <CardTitle className="text-xl text-white text-center">Your Token Vesting</CardTitle>
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
              Warning: You have insufficient QUAI balance to cover transaction fees. Current balance:{' '}
              {formatQuai(vestingSchedule.userQuaiBalance)} QUAI. You need at least 0.001 QUAI to cover transaction
              fees.
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
            <span className="text-[#999999]">Claimable Amount</span>
            <span className="font-semibold text-red-9">
              {vestingSchedule.claimableAmount} {TOKEN_SYMBOL}
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
          </div>
        )}
      </CardContent>
      <CardFooter className="flex gap-4">
        <Button
          onClick={onClaim}
          className={cn(
            'flex-1',
            isClaiming || !vestingSchedule || BigInt(vestingSchedule.rawClaimableAmount) <= BigInt(0)
              ? 'bg-[#333333] text-[#999999]'
              : 'bg-red-9 hover:bg-red-10 text-white'
          )}
          disabled={isClaiming || !vestingSchedule || BigInt(vestingSchedule.rawClaimableAmount) <= BigInt(0)}
        >
          {isClaiming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Claiming...
            </>
          ) : (
            'Claim Tokens'
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
