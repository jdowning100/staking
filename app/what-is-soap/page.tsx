'use client';
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function WhatIsSOAP() {
  return (
    <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4 bg-background">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <Card className="bg-[#1a1a1a] border border-[#333333]">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-white">What is SOAP?</CardTitle>
            <CardDescription className="text-[#999999]">
              Understanding the Staked Operations Acquisition Protocol
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Introduction */}
            <section className="space-y-4">
              <div className="bg-gradient-to-r from-red-900/20 to-purple-900/20 border border-red-900/50 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-white mb-4">SOAP Overview</h2>
                <p className="text-[#999999] leading-relaxed">
                  SOAP (Staked Operations Acquisition Protocol) is an innovative mechanism that uses daily QUAI buybacks 
                  to reward stakers and reduce token supply through strategic burning. It creates sustainable value for 
                  QUAI holders while incentivizing long-term network participation.
                </p>
              </div>
            </section>

            {/* How SOAP Works */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-white">How SOAP Works</h2>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-red-9 rounded-full flex items-center justify-center text-white font-bold">
                    1
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-lg font-medium text-white">Daily QUAI Buybacks</h3>
                    <p className="text-[#999999]">
                      SOAP conducts regular buybacks of QUAI tokens from the open market using protocol revenue and treasury funds.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-red-9 rounded-full flex items-center justify-center text-white font-bold">
                    2
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-lg font-medium text-white">Token Distribution</h3>
                    <p className="text-[#999999]">
                      Purchased tokens are split between burning (reducing supply) and rewards distribution to stakers across different pools.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-red-9 rounded-full flex items-center justify-center text-white font-bold">
                    3
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-lg font-medium text-white">Staker Rewards</h3>
                    <p className="text-[#999999]">
                      Remaining tokens are distributed to stakers based on their pool allocation and stake size, creating sustainable yield.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Key Features */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Key Features</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-4">
                  <h3 className="text-lg font-medium text-red-9 mb-2 flex items-center gap-2">
                    🔥 Token Burning
                  </h3>
                  <p className="text-[#999999] text-sm">
                    A percentage of buyback tokens are permanently burned, reducing total supply and creating deflationary pressure.
                  </p>
                </div>
                
                <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-4">
                  <h3 className="text-lg font-medium text-green-400 mb-2 flex items-center gap-2">
                    💰 Staking Rewards
                  </h3>
                  <p className="text-[#999999] text-sm">
                    Stakers receive regular QUAI rewards based on their participation in various pools with different risk/reward profiles.
                  </p>
                </div>
                
                <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-4">
                  <h3 className="text-lg font-medium text-blue-400 mb-2 flex items-center gap-2">
                    🏊 Multiple Pools
                  </h3>
                  <p className="text-[#999999] text-sm">
                    Different staking pools offer varying APRs: locked QUAI, LP tokens, and stable pairs to suit different risk appetites.
                  </p>
                </div>
                
                <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-4">
                  <h3 className="text-lg font-medium text-purple-400 mb-2 flex items-center gap-2">
                    📊 Dynamic APRs
                  </h3>
                  <p className="text-[#999999] text-sm">
                    Rewards automatically adjust based on TVL and buyback amounts, creating market-responsive yield optimization.
                  </p>
                </div>
              </div>
            </section>

            {/* Staking Pools */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-white">SOAP Staking Pools</h2>
              <div className="space-y-4">
                <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-lg font-medium text-red-400">Locked QUAI Pool</h3>
                    <span className="text-sm text-red-300 bg-red-900/30 px-2 py-1 rounded">Highest APR</span>
                  </div>
                  <p className="text-[#999999] text-sm mb-2">
                    Time-locked QUAI staking with 6-month commitment periods. Offers the highest rewards but requires long-term commitment.
                  </p>
                  <div className="text-xs text-red-300">
                    • Lock period: 6 months • Grace period for withdrawal • Emergency withdrawal available (forfeit rewards)
                  </div>
                </div>

                <div className="bg-green-900/20 border border-green-900/50 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-lg font-medium text-green-400">QUAI/USDC LP Pool</h3>
                    <span className="text-sm text-green-300 bg-green-900/30 px-2 py-1 rounded">High APR + Trading Fees</span>
                  </div>
                  <p className="text-[#999999] text-sm mb-2">
                    Provide liquidity to the main QUAI trading pair. Earn both SOAP rewards and trading fee income.
                  </p>
                  <div className="text-xs text-green-300">
                    • Primary trading pair • Dual rewards: SOAP + fees • Higher volume = higher returns
                  </div>
                </div>

                <div className="bg-purple-900/20 border border-purple-900/50 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-lg font-medium text-purple-400">WQI/QUAI LP Pool</h3>
                    <span className="text-sm text-purple-300 bg-purple-900/30 px-2 py-1 rounded">Stable Exposure</span>
                  </div>
                  <p className="text-[#999999] text-sm mb-2">
                    Balanced exposure between QUAI and WQI flatcoin. Lower volatility with steady rewards.
                  </p>
                  <div className="text-xs text-purple-300">
                    • Flatcoin pairing • Reduced volatility • Stable purchasing power
                  </div>
                </div>

                <div className="bg-amber-900/20 border border-amber-900/50 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-lg font-medium text-amber-400">WQI/USDC LP Pool</h3>
                    <span className="text-sm text-amber-300 bg-amber-900/30 px-2 py-1 rounded">Conservative</span>
                  </div>
                  <p className="text-[#999999] text-sm mb-2">
                    Most conservative option with stable asset pairing. Lower risk, steady returns.
                  </p>
                  <div className="text-xs text-amber-300">
                    • Stablecoin liquidity • Lowest risk • Predictable returns
                  </div>
                </div>
              </div>
            </section>

            {/* Benefits */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Benefits of SOAP</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="bg-blue-900/20 border border-blue-900/50 rounded-lg p-4 text-center">
                  <div className="text-2xl mb-2">📈</div>
                  <h3 className="text-lg font-medium text-blue-400 mb-2">Sustainable Yield</h3>
                  <p className="text-[#999999] text-sm">
                    Protocol-backed rewards create sustainable yield without relying on token inflation.
                  </p>
                </div>
                
                <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4 text-center">
                  <div className="text-2xl mb-2">🔥</div>
                  <h3 className="text-lg font-medium text-red-400 mb-2">Deflationary Pressure</h3>
                  <p className="text-[#999999] text-sm">
                    Regular token burns reduce supply over time, creating upward price pressure.
                  </p>
                </div>
                
                <div className="bg-green-900/20 border border-green-900/50 rounded-lg p-4 text-center">
                  <div className="text-2xl mb-2">🎯</div>
                  <h3 className="text-lg font-medium text-green-400 mb-2">Aligned Incentives</h3>
                  <p className="text-[#999999] text-sm">
                    Rewards long-term holders and active participants in the ecosystem.
                  </p>
                </div>
              </div>
            </section>

            {/* CTA */}
            <div className="bg-gradient-to-r from-red-900/20 to-purple-900/20 border border-red-900/50 rounded-lg p-6 text-center">
              <h3 className="text-xl font-semibold text-white mb-2">Ready to Join SOAP?</h3>
              <p className="text-[#999999] mb-4">
                Start earning sustainable rewards through the SOAP protocol today.
              </p>
              <div className="flex gap-4 justify-center">
                <Link href="/">
                  <Button className="bg-red-9 hover:bg-red-10 text-white">
                    Start Staking
                  </Button>
                </Link>
                <Link href="/calculator">
                  <Button variant="outline" className="border-[#333333] text-[#999999] hover:bg-[#222222]">
                    Use Calculator
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}