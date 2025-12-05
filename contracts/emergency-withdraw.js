#!/usr/bin/env node
/*
  Trigger emergencyWithdraw() for the caller on a staking contract (requires contract paused).

  Usage:
    RPC_URL=https://rpc.quai.network CYPRUS1_PK=0x... node contracts/emergency-withdraw.js <stakingContract>

  Notes:
    - Works for both Native and LP staking if they expose emergencyWithdraw() external whenPaused.
*/

const quais = require('quais');
require('dotenv').config();

function isAddr(x){ return /^0x[0-9a-fA-F]{40}$/.test(x||''); }

async function main(){
  const [, , ca] = process.argv;
  if (!isAddr(ca)) {
    console.error('Usage: node contracts/emergency-withdraw.js <stakingContract>');
    process.exit(1);
  }
  const RPC = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.quai.network';
  const PK  = process.env.CYPRUS1_PK || process.env.PRIVATE_KEY || process.env.DEPLOYER_KEY;
  if (!PK) { console.error('Missing private key: set CYPRUS1_PK/PRIVATE_KEY'); process.exit(1); }

  console.log('RPC_URL:', RPC);
  console.log('Target contract:', ca);

  const provider = new quais.JsonRpcProvider(RPC, undefined, { usePathing: true });
  const wallet = new quais.Wallet(PK, provider);
  const from = await wallet.getAddress();
  console.log('Caller:', from);

  // Minimal ABI
  const ABI = [
    { inputs: [], name: 'paused', outputs: [{type:'bool'}], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'emergencyWithdraw', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{name:'',type:'address'}], name: 'userInfo', outputs: [
      {type:'uint256', name:'amount'},
      {type:'uint256', name:'effectiveAmount'},
      {type:'uint256', name:'rewardDebt'},
      {type:'uint256', name:'debtClaimablePS'},
      {type:'uint256', name:'lockStartTime'}
    ], stateMutability:'view', type:'function' },
  ];
  const c = new quais.Contract(ca, ABI, wallet);

  const paused = await c.paused().catch(()=>false);
  console.log('paused:', paused);
  if (!paused) console.warn('Warning: contract not paused. emergencyWithdraw will revert.');

  // Preflight: show user amount
  const info = await c.userInfo(from).catch(()=>null);
  if (info) console.log('Current user.amount:', quais.formatQuai(info.amount || 0n));

  try {
    const tx = await c.emergencyWithdraw({ gasLimit: 500000 });
    console.log('emergencyWithdraw() tx:', tx.hash);
    const rc = await tx.wait();
    console.log('Confirmed in block', rc.blockNumber);
  } catch (e) {
    console.error('emergencyWithdraw failed:', e?.reason || e?.message || e);
    process.exit(1);
  }
}

main().catch(e => { console.error('Fatal:', e?.message || e); process.exit(1); });

