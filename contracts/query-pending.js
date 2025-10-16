#!/usr/bin/env node
/*
  Query claimable and related fields for SmartChef Native or LP staking.

  Usage:
    RPC_URL=https://rpc.quai.network node contracts/query-pending.js <stakingContract> <userAddress>

  Works with both native and LP variants by probing multiple view methods.
*/

const quais = require('quais');
require('dotenv').config();

function isAddr(x) { return /^0x[0-9a-fA-F]{40}$/.test(x || ''); }

async function tryCall(c, method, args = []) {
  if (!c[method]) return undefined;
  try { return await c[method](...args); } catch { return undefined; }
}

function fmt(v) {
  try { return quais.formatQuai(v); } catch { return v?.toString?.() ?? String(v); }
}

async function main() {
  const [, , ca, user] = process.argv;
  if (!isAddr(ca) || !isAddr(user)) {
    console.error('Usage: node contracts/query-pending.js <stakingContract> <userAddress>');
    process.exit(1);
  }
  const RPC = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.quai.network';
  const provider = new quais.JsonRpcProvider(RPC, undefined, { usePathing: true });

  // Aggregate ABI with optional methods used across Native and LP
  const ABI = [
    // global pool info
    { inputs: [], name: 'rewardPerBlock', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'startBlock', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'getRewardBalance', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'REWARD_DELAY_PERIOD', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },

    // user views (common)
    { inputs: [{ name: '_user', type: 'address' }], name: 'claimableView', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ name: '_user', type: 'address' }], name: 'lockedView', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    // legacy names
    { inputs: [{ name: '_user', type: 'address' }], name: 'claimableRewards', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ name: '_user', type: 'address' }], name: 'totalDelayedRewards', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },

    { inputs: [{ name: '_user', type: 'address' }], name: 'pendingReward', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'pendingReward', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ name: '_user', type: 'address' }], name: 'timeUntilUnlock', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ name: '_user', type: 'address' }], name: 'timeUntilWithdrawalAvailable', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ name: '_user', type: 'address' }], name: 'isInExitPeriod', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },

    // structs
    {
      inputs: [{ name: '', type: 'address' }], name: 'userInfo', outputs: [
        { type: 'uint256', name: 'amount' },
        { type: 'uint256', name: 'effectiveAmount' },
        { type: 'uint256', name: 'rewardDebt' },
        { type: 'uint256', name: 'debtClaimablePS' },
        { type: 'uint256', name: 'lockStartTime' }, // native may use lockStartBlock
        { type: 'uint256', name: 'lockDuration' },
        { type: 'uint256', name: 'withdrawRequestTime' },
        { type: 'uint256', name: 'withdrawalAmount' },
        { type: 'uint256', name: 'delayedReward' },
        { type: 'uint256', name: 'delayedUnlockBlock' }
      ], stateMutability: 'view', type: 'function'
    },
  ];

  const c = new quais.Contract(ca, ABI, provider);
  const currentBlock = await provider.getBlockNumber("cyprus1")
  const [rewardPerBlock, startBlock, rewardBal, delaySec] = await Promise.all([
    tryCall(c, 'rewardPerBlock'), tryCall(c, 'startBlock'), tryCall(c, 'getRewardBalance'), tryCall(c, 'REWARD_DELAY_PERIOD')
  ]);

  // user views with fallbacks
  let claimable = await tryCall(c, 'claimableView', [user]);
  if (claimable === undefined) claimable = await tryCall(c, 'claimableRewards', [user]);
  let locked = await tryCall(c, 'lockedView', [user]);
  if (locked === undefined) locked = await tryCall(c, 'totalDelayedRewards', [user]);

  // pending (best-effort)
  let pending = await tryCall(c, 'pendingReward', [user]);
  if (pending === undefined) pending = await tryCall(c, 'pendingReward', []);

  const tUnlock = await tryCall(c, 'timeUntilUnlock', [user]);
  const tExitAvail = await tryCall(c, 'timeUntilWithdrawalAvailable', [user]);
  const inExit = await tryCall(c, 'isInExitPeriod', [user]);

  const uInfo = await tryCall(c, 'userInfo', [user]);

  const out = {
    network: RPC,
    contract: ca,
    user,
    currentBlock,
    startBlock: startBlock ? Number(startBlock) : undefined,
    rewardPerBlock: rewardPerBlock ? rewardPerBlock.toString() : undefined,
    rewardPerBlockFormatted: rewardPerBlock ? fmt(rewardPerBlock) : undefined,
    rewardBalance: rewardBal ? rewardBal.toString() : undefined,
    rewardBalanceFormatted: rewardBal ? fmt(rewardBal) : undefined,
    rewardDelaySec: delaySec ? Number(delaySec) : undefined,
    userViews: {
      claimable: claimable ? claimable.toString() : '0',
      claimableFormatted: claimable ? fmt(claimable) : '0',
      locked: locked ? locked.toString() : '0',
      lockedFormatted: locked ? fmt(locked) : '0',
      pending: pending ? pending.toString() : '0',
      pendingFormatted: pending ? fmt(pending) : '0',
      timeUntilUnlock: tUnlock ? Number(tUnlock) : 0,
      timeUntilWithdrawalAvailable: tExitAvail ? Number(tExitAvail) : 0,
      isInExitPeriod: Boolean(inExit),
    },
    userInfo: uInfo ? {
      amount: uInfo.amount?.toString?.(),
      effectiveAmount: uInfo.effectiveAmount?.toString?.(),
      rewardDebt: uInfo.rewardDebt?.toString?.(),
      debtClaimablePS: uInfo.debtClaimablePS?.toString?.(),
      lockStartTime: uInfo.lockStartTime?.toString?.(),
      lockDuration: uInfo.lockDuration?.toString?.(),
      withdrawRequestTime: uInfo.withdrawRequestTime?.toString?.(),
      withdrawalAmount: uInfo.withdrawalAmount?.toString?.(),
      delayedReward: uInfo.delayedReward?.toString?.(),
      delayedUnlockBlock: uInfo.delayedUnlockBlock?.toString?.(),
    } : undefined,
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error('Fatal:', e?.message || e); process.exit(1); });

