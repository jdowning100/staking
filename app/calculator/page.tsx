'use client';
import React, { useState, useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

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

const SOAPDistributionModel = () => {
  const [inputs, setInputs] = useState({
    dailyBuyback: 200000,
    quaiPrice: 0.05,
    wqiPrice: 1.00,
    burnPercentage: 50,
  });

  const [pools, setPools] = useState({
    lockedQuai: {
      name: 'Locked QUAI',
      tvl: 5000000,
      allocation: 40,
      color: '#E22901',
      lockPeriod: '6 months',
      description: 'Time-locked QUAI staking',
      tokens: ['QUAI'],
    },
    quaiUsdc: {
      name: 'QUAI/USDC LP',
      tvl: 300000,
      allocation: 25,
      color: '#f97316',
      tradingFeeApr: 8,
      description: 'Primary trading pair',
      tokens: ['QUAI', 'USDC'],
    },
    wqiQuai: {
      name: 'WQI/QUAI LP',
      tvl: 200000,
      allocation: 20,
      color: '#ea580c',
      tradingFeeApr: 12,
      description: 'Flatcoin stable pair',
      tokens: ['WQI', 'QUAI'],
    },
    wqiUsdc: {
      name: 'WQI/USDC LP',
      tvl: 150000,
      allocation: 15,
      color: '#dc2626',
      tradingFeeApr: 6,
      description: 'Stablecoin liquidity',
      tokens: ['WQI', 'USDC'],
    },
  });

  const metrics = useMemo(() => {
    const dailyBurned = inputs.dailyBuyback * (inputs.burnPercentage / 100);
    const dailyToStakers = inputs.dailyBuyback * ((100 - inputs.burnPercentage) / 100);
    const annualBuyback = inputs.dailyBuyback * 365;
    const annualBurned = dailyBurned * 365;
    const annualToStakers = dailyToStakers * 365;
    const dailyBuybackUsd = inputs.dailyBuyback * inputs.quaiPrice;
    const annualBuybackUsd = annualBuyback * inputs.quaiPrice;
    const dailyBurnedUsd = dailyBurned * inputs.quaiPrice;
    const dailyToStakersUsd = dailyToStakers * inputs.quaiPrice;

    const poolMetrics = Object.entries(pools).map(([key, pool]) => {
      const dailyRewards = dailyToStakers * (pool.allocation / 100);
      const annualRewards = dailyRewards * 365;
      const annualRewardsUsd = annualRewards * inputs.quaiPrice;

      let apr, totalApr, tvlUsd;

      if (key === 'lockedQuai') {
        tvlUsd = pool.tvl * inputs.quaiPrice;
        apr = (annualRewardsUsd / tvlUsd) * 100;
        totalApr = apr;
      } else {
        tvlUsd = pool.tvl;
        const tradingApr = (pool as any).tradingFeeApr || 0;
        apr = (annualRewardsUsd / tvlUsd) * 100;
        totalApr = apr + tradingApr;
      }

      return {
        key,
        name: pool.name,
        tvl: tvlUsd,
        dailyRewards,
        annualRewards,
        annualRewardsUsd,
        rewardsApr: apr,
        tradingApr: (pool as any).tradingFeeApr || 0,
        totalApr,
        allocation: pool.allocation,
        color: pool.color,
        description: pool.description,
        tokens: pool.tokens,
      };
    });

    const totalTvl = poolMetrics.reduce((sum, p) => sum + p.tvl, 0);
    const weightedApr = poolMetrics.reduce((sum, p) => sum + (p.totalApr * (p.tvl / totalTvl)), 0);

    return {
      poolMetrics,
      totalTvl,
      weightedApr,
      dailyBuybackUsd,
      annualBuybackUsd,
      dailyBurned,
      annualBurned,
      dailyToStakers,
      annualToStakers,
      dailyBurnedUsd,
      dailyToStakersUsd,
    };
  }, [inputs, pools]);

  const updatePoolTvl = (key: string, value: string | number) => {
    setPools((prev: any) => ({
      ...prev,
      [key]: { ...prev[key], tvl: Number(value) || 0 }
    }));
  };

  const updatePoolAllocation = (key: string, value: string | number) => {
    const numValue = Number(value) || 0;
    setPools((prev: any) => ({
      ...prev,
      [key]: { ...prev[key], allocation: numValue }
    }));
  };

  const totalAllocation = Object.values(pools).reduce((sum, p) => sum + p.allocation, 0);

  const aprComparisonData = metrics.poolMetrics.map(p => ({
    name: p.name,
    'Rewards APR': Number(p.rewardsApr.toFixed(1)),
    'Trading Fees APR': Number(p.tradingApr.toFixed(1)),
    'Total APR': Number(p.totalApr.toFixed(1)),
  }));

  const allocationData = metrics.poolMetrics.map(p => ({
    name: p.name,
    value: p.allocation,
    label: `${p.name}\n${p.allocation}%`,
  }));

  const tvlData = metrics.poolMetrics.map(p => ({
    name: p.name,
    tvl: (p.tvl / 1000).toFixed(0),
  }));

  return (
    <main className="flex min-h-screen flex-col items-center pt-32 pb-8 px-4">
      <div className="w-full max-w-7xl mx-auto space-y-6">
        <Card className="modern-card">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-white">SOAP Buyback Distribution Model</CardTitle>
            <CardDescription className="text-[#999999]">
              Model how daily QUAI buybacks translate to APRs across different pool TVLs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-lg">
                <div className="text-sm text-red-400 font-semibold">Daily Buyback</div>
                <div className="text-2xl font-bold text-red-300">{inputs.dailyBuyback.toLocaleString()} QUAI</div>
                <div className="text-xs text-red-400">${metrics.dailyBuybackUsd.toLocaleString()}</div>
              </div>
              <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-lg">
                <div className="text-sm text-red-400 font-semibold">Daily Burned ({inputs.burnPercentage}%)</div>
                <div className="text-2xl font-bold text-red-300">{metrics.dailyBurned.toLocaleString()} QUAI</div>
                <div className="text-xs text-red-400">${metrics.dailyBurnedUsd.toLocaleString()}</div>
              </div>
              <div className="bg-orange-900/20 border border-orange-900/50 p-4 rounded-lg">
                <div className="text-sm text-orange-400 font-semibold">To Stakers ({100 - inputs.burnPercentage}%)</div>
                <div className="text-2xl font-bold text-orange-300">{metrics.dailyToStakers.toLocaleString()} QUAI</div>
                <div className="text-xs text-orange-400">${metrics.dailyToStakersUsd.toLocaleString()}</div>
              </div>
              <div className="bg-orange-800/20 border border-orange-800/50 p-4 rounded-lg">
                <div className="text-sm text-orange-300 font-semibold">Weighted APR</div>
                <div className="text-2xl font-bold text-orange-200">{metrics.weightedApr.toFixed(1)}%</div>
                <div className="text-xs text-orange-300">Total TVL: ${(metrics.totalTvl / 1000).toFixed(0)}K</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="modern-card">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-white">Buyback Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#999999] mb-1">
                  Daily QUAI Buyback Amount
                </label>
                <Input
                  type="number"
                  value={inputs.dailyBuyback}
                  onChange={(e) => setInputs({...inputs, dailyBuyback: Number(e.target.value)})}
                  className="bg-[#222222] border-[#333333] text-white"
                />
                <div className="text-xs text-[#666666] mt-1">
                  Annual: {(inputs.dailyBuyback * 365).toLocaleString()} QUAI
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#999999] mb-1">
                  Burn Percentage: {inputs.burnPercentage}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={inputs.burnPercentage}
                  onChange={(e) => setInputs({...inputs, burnPercentage: Number(e.target.value)})}
                  className="w-full h-2 bg-[#333333] rounded-lg appearance-none cursor-pointer custom-slider"
                  style={{
                    background: `linear-gradient(to right, #E22901 0%, #E22901 ${inputs.burnPercentage}%, #16a34a ${inputs.burnPercentage}%, #16a34a 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-[#666666] mt-1">
                  <span>🔥 Burn: {metrics.dailyBurned.toLocaleString()} QUAI/day</span>
                  <span>💰 Stakers: {metrics.dailyToStakers.toLocaleString()} QUAI/day</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#999999] mb-1">
                    QUAI Price ($)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={inputs.quaiPrice}
                    onChange={(e) => setInputs({...inputs, quaiPrice: Number(e.target.value)})}
                    className="bg-[#222222] border-[#333333] text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#999999] mb-1">
                    WQI Price ($)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={inputs.wqiPrice}
                    onChange={(e) => setInputs({...inputs, wqiPrice: Number(e.target.value)})}
                    className="bg-[#222222] border-[#333333] text-white"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="modern-card">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-white">Buyback Allocation</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={allocationData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${(value as number).toFixed(1)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {allocationData.map((entry, index) => {
                      if (index === allocationData.length - 1) {
                        return <Cell key={`cell-${index}`} fill="#ef4444" />;
                      }
                      return <Cell key={`cell-${index}`} fill={metrics.poolMetrics[index].color} />;
                    })}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1a1a1a', 
                      border: '1px solid #333333',
                      borderRadius: '8px' 
                    }}
                    labelStyle={{ color: '#999999' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card className="modern-card">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-white">Pool Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(pools).map(([key, pool]) => {
              const poolData = metrics.poolMetrics.find(p => p.key === key);
              return (
                <div key={key} className="border border-[#333333] rounded-xl p-6 bg-gradient-to-br from-[#0a0a0a] to-[#111111] hover:border-red-900/50 transition-all duration-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <TokenLogos tokens={pool.tokens} size={32} />
                      <div>
                        <h3 className="text-lg font-semibold text-white">{pool.name}</h3>
                        <p className="text-sm text-[#999999]">{pool.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-orange-400">{poolData?.totalApr.toFixed(1)}%</div>
                      <div className="text-xs text-[#666666]">Total APR</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#999999] mb-1">
                        TVL {key === 'lockedQuai' ? '(QUAI)' : '(USD)'}
                      </label>
                      <Input
                        type="number"
                        value={pool.tvl}
                        onChange={(e) => updatePoolTvl(key, e.target.value)}
                        className="bg-[#222222] border-[#333333] text-white"
                      />
                      <div className="text-xs text-[#666666] mt-1">
                        ${key === 'lockedQuai' ? (pool.tvl * inputs.quaiPrice).toLocaleString() : pool.tvl.toLocaleString()} USD
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#999999] mb-1">
                        Allocation (%)
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={pool.allocation}
                        onChange={(e) => updatePoolAllocation(key, e.target.value)}
                        className="bg-[#222222] border-[#333333] text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#999999] mb-1">
                        Daily Rewards
                      </label>
                      <div className="px-3 py-2 bg-[#222222] rounded-md text-white font-medium">
                        {poolData?.dailyRewards.toLocaleString()} QUAI
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="bg-red-900/20 p-2 rounded border border-red-900/50">
                      <div className="text-xs text-red-400">Rewards APR</div>
                      <div className="font-semibold text-red-300">{poolData?.rewardsApr.toFixed(1)}%</div>
                    </div>
                    {key !== 'lockedQuai' && (
                      <div className="bg-orange-900/20 p-2 rounded border border-orange-900/50">
                        <div className="text-xs text-orange-400">Trading Fees APR</div>
                        <div className="font-semibold text-orange-300">{poolData?.tradingApr.toFixed(1)}%</div>
                      </div>
                    )}
                    <div className="bg-orange-800/20 p-2 rounded border border-orange-800/50">
                      <div className="text-xs text-orange-300">Annual Rewards</div>
                      <div className="font-semibold text-orange-200">{((poolData?.annualRewards || 0) / 1000).toFixed(1)}K</div>
                    </div>
                    <div className="bg-amber-900/20 p-2 rounded border border-amber-900/50">
                      <div className="text-xs text-amber-400">Value</div>
                      <div className="font-semibold text-amber-300">${((poolData?.annualRewardsUsd || 0) / 1000).toFixed(1)}K</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="modern-card">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-white">APR Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={aprComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
                  <XAxis 
                    dataKey="name" 
                    angle={-15} 
                    textAnchor="end" 
                    height={80} 
                    stroke="#999999"
                    tick={{ fill: '#999999' }}
                  />
                  <YAxis 
                    label={{ value: 'APR (%)', angle: -90, position: 'insideLeft', style: { fill: '#999999' } }}
                    stroke="#999999"
                    tick={{ fill: '#999999' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1a1a1a', 
                      border: '1px solid #333333',
                      borderRadius: '8px' 
                    }}
                    labelStyle={{ color: '#999999' }}
                  />
                  <Legend 
                    wrapperStyle={{ color: '#999999' }}
                  />
                  <Bar dataKey="Rewards APR" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="Trading Fees APR" stackId="a" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="modern-card">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-white">TVL Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={tvlData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
                  <XAxis 
                    dataKey="name" 
                    angle={-15} 
                    textAnchor="end" 
                    height={80}
                    stroke="#999999"
                    tick={{ fill: '#999999' }}
                  />
                  <YAxis 
                    label={{ value: 'TVL ($K)', angle: -90, position: 'insideLeft', style: { fill: '#999999' } }}
                    stroke="#999999"
                    tick={{ fill: '#999999' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1a1a1a', 
                      border: '1px solid #333333',
                      borderRadius: '8px' 
                    }}
                    labelStyle={{ color: '#999999' }}
                  />
                  <Bar dataKey="tvl" fill="#8b5cf6">
                    {tvlData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={metrics.poolMetrics[index].color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card className="modern-card">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-white">Detailed Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-[#0a0a0a] rounded-lg">
              <div className="text-center">
                <div className="text-sm text-[#999999] font-medium">SOAP Daily Buyback</div>
                <div className="text-2xl font-bold text-white">{inputs.dailyBuyback.toLocaleString()} QUAI</div>
                <div className="text-sm text-orange-400">${metrics.dailyBuybackUsd.toLocaleString()}</div>
                <div className="text-xs text-[#666666] mt-2">
                  Annual: {(inputs.dailyBuyback * 365).toLocaleString()} QUAI
                </div>
                <div className="text-xs text-orange-300">${metrics.annualBuybackUsd.toLocaleString()}</div>
              </div>
              <div className="text-center border-l border-r border-[#333333]">
                <div className="text-sm text-red-400 font-medium">🔥 Burned ({inputs.burnPercentage}%)</div>
                <div className="text-2xl font-bold text-red-400">{metrics.dailyBurned.toLocaleString()} QUAI</div>
                <div className="text-sm text-red-300">${metrics.dailyBurnedUsd.toLocaleString()}</div>
                <div className="text-xs text-[#666666] mt-2">
                  Annual: {metrics.annualBurned.toLocaleString()} QUAI
                </div>
                <div className="text-xs text-red-300">${(metrics.annualBurned * inputs.quaiPrice).toLocaleString()}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-orange-400 font-medium">💰 To Stakers ({100 - inputs.burnPercentage}%)</div>
                <div className="text-2xl font-bold text-orange-400">{metrics.dailyToStakers.toLocaleString()} QUAI</div>
                <div className="text-sm text-orange-300">${metrics.dailyToStakersUsd.toLocaleString()}</div>
                <div className="text-xs text-[#666666] mt-2">
                  Annual: {metrics.annualToStakers.toLocaleString()} QUAI
                </div>
                <div className="text-xs text-orange-300">${(metrics.annualToStakers * inputs.quaiPrice).toLocaleString()}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gradient-to-r from-red-900/10 to-orange-900/10 rounded-lg">
              <div className="text-center">
                <div className="text-sm text-[#999999] font-medium">QUAI Price</div>
                <div className="text-2xl font-bold text-orange-400">${inputs.quaiPrice.toFixed(2)}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-[#999999] font-medium">QI Price (Flatcoin)</div>
                <div className="text-2xl font-bold text-red-400">${inputs.wqiPrice.toFixed(2)}</div>
                <div className="text-xs text-[#666666]">
                  Tracks purchasing power
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[#333333]">
                    <th className="text-left py-3 px-4 font-semibold text-[#999999]">Pool</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#999999]">TVL</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#999999]">Allocation</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#999999]">Daily Rewards</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#999999]">Annual Rewards</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#999999]">Rewards APR</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#999999]">Total APR</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.poolMetrics.map((pool, idx) => (
                    <tr key={idx} className="border-b border-[#333333]">
                      <td className="py-3 px-4 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <TokenLogos tokens={pool.tokens} size={20} />
                          {pool.name}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-[#999999]">${(pool.tvl / 1000).toFixed(0)}K</td>
                      <td className="py-3 px-4 text-right text-[#999999]">{pool.allocation}%</td>
                      <td className="py-3 px-4 text-right text-[#999999]">{pool.dailyRewards.toLocaleString()} QUAI</td>
                      <td className="py-3 px-4 text-right text-[#999999]">${(pool.annualRewardsUsd / 1000).toFixed(1)}K</td>
                      <td className="py-3 px-4 text-right font-semibold text-red-400">
                        {pool.rewardsApr.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-orange-400">
                        {pool.totalApr.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[#333333] font-semibold">
                    <td className="py-3 px-4 text-white">TOTAL</td>
                    <td className="py-3 px-4 text-right text-white">${(metrics.totalTvl / 1000).toFixed(0)}K</td>
                    <td className="py-3 px-4 text-right text-white">{totalAllocation}%</td>
                    <td className="py-3 px-4 text-right text-white">{metrics.dailyToStakers.toLocaleString()} QUAI</td>
                    <td className="py-3 px-4 text-right text-white">${((metrics.annualToStakers * inputs.quaiPrice) / 1000).toFixed(1)}K</td>
                    <td className="py-3 px-4 text-right">-</td>
                    <td className="py-3 px-4 text-right text-orange-400">{metrics.weightedApr.toFixed(1)}%</td>
                  </tr>
                  <tr className="bg-red-900/20 border-t border-[#333333]">
                    <td className="py-3 px-4 font-semibold text-red-400">🔥 BURNED</td>
                    <td className="py-3 px-4 text-right">-</td>
                    <td className="py-3 px-4 text-right font-semibold text-red-400">{inputs.burnPercentage}%</td>
                    <td className="py-3 px-4 text-right font-semibold text-red-400">{metrics.dailyBurned.toLocaleString()} QUAI</td>
                    <td className="py-3 px-4 text-right font-semibold text-red-400">${((metrics.annualBurned * inputs.quaiPrice) / 1000).toFixed(1)}K</td>
                    <td className="py-3 px-4 text-right">-</td>
                    <td className="py-3 px-4 text-right text-red-400">Supply reduction</td>
                  </tr>
                  <tr className="bg-red-900/20 border-t-2 border-[#444444] font-bold">
                    <td className="py-3 px-4 text-red-400">TOTAL BUYBACK</td>
                    <td className="py-3 px-4 text-right">-</td>
                    <td className="py-3 px-4 text-right text-red-400">100%</td>
                    <td className="py-3 px-4 text-right text-red-400">{inputs.dailyBuyback.toLocaleString()} QUAI</td>
                    <td className="py-3 px-4 text-right text-red-400">${(metrics.annualBuybackUsd / 1000).toFixed(1)}K</td>
                    <td className="py-3 px-4 text-right">-</td>
                    <td className="py-3 px-4 text-right">-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-red-900/20 to-red-900/10 border border-red-900/50">
            <CardContent className="p-4">
              <h3 className="font-semibold text-white mb-2">🎯 Recommended Ratios</h3>
              <div className="text-sm text-[#999999] space-y-1">
                <p>• Locked QUAI: 30-40% (long-term holders)</p>
                <p>• QUAI/USDC: 25-35% (main trading pair)</p>
                <p>• WQI/QUAI: 15-25% (stable exposure)</p>
                <p>• WQI/USDC: 10-20% (conservative)</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-900/20 to-orange-900/10 border border-orange-900/50">
            <CardContent className="p-4">
              <h3 className="font-semibold text-white mb-2">📊 Competitive APRs</h3>
              <div className="text-sm text-[#999999] space-y-1">
                <p>• Locked staking: 20-40% target</p>
                <p>• QUAI pairs: 15-30% target</p>
                <p>• Stable pairs: 10-20% target</p>
                <p>• Must beat lending markets (5-8%)</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-800/20 to-orange-800/10 border border-orange-800/50">
            <CardContent className="p-4">
              <h3 className="font-semibold text-white mb-2">⚖️ TVL Targets</h3>
              <div className="text-sm text-[#999999] space-y-1">
                <p>• Start conservative with TVL</p>
                <p>• Higher TVL = lower APR but more stable</p>
                <p>• Lower TVL = higher APR but volatile</p>
                <p>• Adjust as protocol matures</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
};

export default SOAPDistributionModel;