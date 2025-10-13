import React, { useState, useEffect, useMemo, useContext } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowUpDown, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useDEX } from '@/lib/hooks/useDEX';
import { StateContext } from '@/store';

interface TokenSwapProps {
  fromToken: string;
  toToken: string;
  onSwapComplete?: (amount: string) => void;
  className?: string;
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

export function TokenSwap({ fromToken, toToken, onSwapComplete, className }: TokenSwapProps) {
  const { account } = useContext(StateContext);
  const { swapTokens, getAmountsOut, getSwapPath, getTokenBalance, isTransacting, error, setError } = useDEX();
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);
  const [slippage, setSlippage] = useState(0.5); // 0.5% default slippage
  const [fromBalance, setFromBalance] = useState('0');
  const [toBalance, setToBalance] = useState('0');

  // Get swap path for price calculation
  const swapPath = useMemo(() => {
    return getSwapPath(fromToken, toToken);
  }, [fromToken, toToken, getSwapPath]);

  // Fetch token balances
  const fetchBalances = async () => {
    if (!account?.addr) {
      setFromBalance('0');
      setToBalance('0');
      return;
    }

    try {
      const [fromBal, toBal] = await Promise.all([
        getTokenBalance(fromToken),
        getTokenBalance(toToken)
      ]);
      setFromBalance(fromBal);
      setToBalance(toBal);
    } catch (err) {
      console.error('Error fetching balances:', err);
      setFromBalance('0');
      setToBalance('0');
    }
  };

  // Fetch balances when component mounts or account/tokens change
  useEffect(() => {
    fetchBalances();
  }, [account?.addr, fromToken, toToken]);

  // Calculate output amount when input changes
  const handleFromAmountChange = async (value: string) => {
    setFromAmount(value);
    setError(null);
    
    if (!value || isNaN(Number(value)) || Number(value) <= 0) {
      setToAmount('');
      return;
    }

    setIsCalculating(true);
    try {
      const amounts = await getAmountsOut(value, swapPath);
      if (amounts && amounts.length > 0) {
        const outputAmount = amounts[amounts.length - 1];
        setToAmount(parseFloat(outputAmount).toFixed(6));
      } else {
        setToAmount('');
      }
    } catch (err) {
      console.error('Error calculating output amount:', err);
      setToAmount('');
    } finally {
      setIsCalculating(false);
    }
  };

  // Handle swap execution
  const handleSwap = async () => {
    if (!account?.addr) {
      setError('Please connect your wallet');
      return;
    }
    
    if (!fromAmount || !toAmount || Number(fromAmount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    try {
      const tx = await swapTokens({
        fromToken,
        toToken,
        amountIn: fromAmount,
        slippageTolerance: slippage
      });
      
      // Notify parent component of successful swap
      onSwapComplete?.(toAmount);
      
      // Refresh balances
      await fetchBalances();
      
      // Reset form
      setFromAmount('');
      setToAmount('');
    } catch (err: any) {
      console.error('Swap failed:', err);
      // Error is handled by useDEX hook
    }
  };

  return (
    <Card className={cn("modern-card", className)}>
      <CardHeader>
        <CardTitle className="text-lg text-white flex items-center gap-2">
          <ArrowUpDown className="h-5 w-5 text-orange-400" />
          Token Swap
        </CardTitle>
        <CardDescription className="text-[#999999]">
          Swap {fromToken} for {toToken} using integrated DEX
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* From Token */}
        <div className="space-y-2">
          <label className="text-sm text-[#999999]">From</label>
          <div className="border border-[#333333] rounded-lg p-3 bg-[#0a0a0a]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TokenLogo token={fromToken} size={20} />
                <span className="text-white font-medium">{fromToken}</span>
              </div>
              <span className="text-sm text-[#999999]">Balance: {parseFloat(fromBalance).toFixed(4)}</span>
            </div>
            <Input
              type="number"
              placeholder="0.0"
              value={fromAmount}
              onChange={(e) => handleFromAmountChange(e.target.value)}
              className="bg-transparent border-none p-0 text-xl font-semibold text-white focus:outline-none"
            />
          </div>
        </div>

        {/* Swap Direction Arrow */}
        <div className="flex justify-center">
          <div className="bg-[#333333] rounded-full p-2 cursor-pointer hover:bg-[#444444] transition-colors">
            <ArrowUpDown className="h-4 w-4 text-white" />
          </div>
        </div>

        {/* To Token */}
        <div className="space-y-2">
          <label className="text-sm text-[#999999]">To</label>
          <div className="border border-[#333333] rounded-lg p-3 bg-[#0a0a0a]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TokenLogo token={toToken} size={20} />
                <span className="text-white font-medium">{toToken}</span>
              </div>
              <span className="text-sm text-[#999999]">Balance: {parseFloat(toBalance).toFixed(4)}</span>
            </div>
            <Input
              type="number"
              placeholder="0.0"
              value={toAmount}
              readOnly
              className="bg-transparent border-none p-0 text-xl font-semibold text-white focus:outline-none"
            />
          </div>
        </div>

        {/* Exchange Rate & Price Impact */}
        {fromAmount && toAmount && !isCalculating && (
          <div className="bg-orange-900/20 border border-orange-900/50 rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm text-[#999999]">Exchange Rate</div>
              <div className="text-sm text-[#999999]">Slippage: {slippage}%</div>
            </div>
            <div className="text-white font-medium">
              1 {fromToken} = {(Number(toAmount) / Number(fromAmount)).toFixed(6)} {toToken}
            </div>
          </div>
        )}

        {/* Loading calculation */}
        {isCalculating && (
          <div className="bg-blue-900/20 border border-blue-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
              <span className="text-blue-400 text-sm">Calculating best price...</span>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <span className="text-red-400 text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Swap Button */}
        <Button 
          className="w-full modern-button"
          disabled={!account?.addr || !fromAmount || !toAmount || isTransacting || isCalculating}
          onClick={handleSwap}
        >
          {!account?.addr 
            ? 'Connect Wallet' 
            : isTransacting 
            ? 'Swapping...' 
            : isCalculating 
            ? 'Calculating...'
            : `Swap ${fromToken} for ${toToken}`
          }
        </Button>

      </CardContent>
    </Card>
  );
}