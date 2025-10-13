'use client';
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function HowToStake() {
  return (
    <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <Card className="bg-[#1a1a1a] border border-[#333333]">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-white">How to Stake QUAI</CardTitle>
            <CardDescription className="text-[#999999]">
              Learn how to stake your QUAI tokens and earn rewards
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Prerequisites */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Prerequisites</h2>
              <div className="space-y-3">
                <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-4">
                  <h3 className="text-lg font-medium text-red-9 mb-2">1. Pelagus Wallet</h3>
                  <p className="text-[#999999] mb-2">
                    You need to have Pelagus wallet installed in your browser to interact with the Quai Network.
                  </p>
                  <a 
                    href="https://chromewebstore.google.com/detail/pelagus/nhccebmfjcbhghphpclcfdkkekheegop" 
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm" className="border-[#333333] text-[#999999] hover:bg-[#222222]">
                      Install Pelagus Wallet →
                    </Button>
                  </a>
                </div>
                
                <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-4">
                  <h3 className="text-lg font-medium text-red-9 mb-2">2. QUAI Tokens</h3>
                  <p className="text-[#999999]">
                    You need QUAI tokens in your wallet to stake. Make sure you have enough QUAI for staking plus a small amount for gas fees.
                  </p>
                </div>
              </div>
            </section>

            {/* Staking Steps */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Staking Process</h2>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-red-9 rounded-full flex items-center justify-center text-white font-bold">
                    1
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-lg font-medium text-white">Connect Your Wallet</h3>
                    <p className="text-[#999999]">
                      Click the &ldquo;Connect&rdquo; button in the header to connect your Pelagus wallet. Make sure you&apos;re on the Cyprus-1 network.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-red-9 rounded-full flex items-center justify-center text-white font-bold">
                    2
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-lg font-medium text-white">Enter Staking Amount</h3>
                    <p className="text-[#999999]">
                      Navigate to the Stake tab and enter the amount of QUAI you want to stake. The interface will show you the current APY and your expected rewards.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-red-9 rounded-full flex items-center justify-center text-white font-bold">
                    3
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-lg font-medium text-white">Confirm Transaction</h3>
                    <p className="text-[#999999]">
                      Click &ldquo;Deposit&rdquo; and confirm the transaction in your Pelagus wallet. Your tokens will be staked after the transaction is confirmed.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-red-9 rounded-full flex items-center justify-center text-white font-bold">
                    4
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-lg font-medium text-white">Earn Rewards</h3>
                    <p className="text-[#999999]">
                      Your staked QUAI will start earning rewards immediately. You can claim your rewards at any time without unstaking your principal.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Lock Mechanism */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Understanding the Lock Mechanism</h2>
              <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-6 space-y-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-white flex items-center gap-2">
                    🔒 Lock Period
                  </h3>
                  <p className="text-[#999999]">
                    When you stake QUAI, your tokens enter a lock period. During this time, you cannot withdraw your staked tokens, but you continue to earn rewards.
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-white flex items-center gap-2">
                    ⏰ Grace Period
                  </h3>
                  <p className="text-[#999999]">
                    After the lock period ends, you enter a grace period where you can withdraw your tokens. If you don&apos;t withdraw during the grace period, your tokens automatically re-enter a new lock cycle.
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-white flex items-center gap-2">
                    🚨 Emergency Withdraw
                  </h3>
                  <p className="text-[#999999]">
                    In case of emergency, you can withdraw your staked tokens at any time, but you will forfeit all pending rewards.
                  </p>
                </div>
              </div>
            </section>

            {/* Tips */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Tips for Stakers</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-blue-900/20 border border-blue-900/50 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-blue-400 mb-2">💡 Maximize Rewards</h3>
                  <p className="text-[#999999] text-sm">
                    Stake for longer periods to maximize your rewards. The lock mechanism ensures committed stakers earn the best returns.
                  </p>
                </div>
                
                <div className="bg-green-900/20 border border-green-900/50 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-green-400 mb-2">⚡ Gas Optimization</h3>
                  <p className="text-[#999999] text-sm">
                    Batch your transactions when possible. Claiming rewards and re-staking in one session saves on gas fees.
                  </p>
                </div>
                
                <div className="bg-purple-900/20 border border-purple-900/50 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-purple-400 mb-2">📊 Monitor APY</h3>
                  <p className="text-[#999999] text-sm">
                    Keep an eye on the APY as it can change based on the total staked amount and reward distribution.
                  </p>
                </div>
                
                <div className="bg-amber-900/20 border border-amber-900/50 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-amber-400 mb-2">🔄 Auto-Compound</h3>
                  <p className="text-[#999999] text-sm">
                    Consider claiming and re-staking your rewards periodically to benefit from compound interest.
                  </p>
                </div>
              </div>
            </section>

            {/* CTA */}
            <div className="flex justify-center pt-4">
              <Link href="/">
                <Button className="bg-red-9 hover:bg-red-10 text-white">
                  Start Staking Now →
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}