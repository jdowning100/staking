#!/usr/bin/env node
/*
  Owner script: withdraw reward funds from staking contract via emergencyRewardWithdraw.

  Usage:
    RPC_URL=https://rpc.quai.network CYPRUS1_PK=0x... \
    node contracts/emergency-reward-withdraw.js <stakingContract> <amountInQUAI>

  Notes:
    - Works for both SmartChefNative and SmartChefLP (both expose emergencyRewardWithdraw(uint256)).
    - Amount is in QUAI (native) and converted to wei using quais.parseQuai.
*/

const quais = require('quais');
require('dotenv').config();

function isAddr(x){ return /^0x[0-9a-fA-F]{40}$/.test(x||''); }

async function main(){
  const [, , ca, amtStr] = process.argv;
  if (!isAddr(ca) || !amtStr || isNaN(Number(amtStr))) {
    console.error('Usage: node contracts/emergency-reward-withdraw.js <stakingContract> <amountInQUAI>');
    process.exit(1);
  }
  const RPC = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.quai.network';
  const PK  = process.env.CYPRUS1_PK || process.env.PRIVATE_KEY || process.env.DEPLOYER_KEY;
  if (!PK) { console.error('Missing private key: set CYPRUS1_PK/PRIVATE_KEY'); process.exit(1); }

  const amountWei = quais.parseQuai(amtStr);
  console.log('RPC_URL:', RPC);
  console.log('Contract:', ca);
  console.log('Amount (QUAI):', amtStr, '— wei:', amountWei.toString());

  const provider = new quais.JsonRpcProvider(RPC, undefined, { usePathing: true });
  const wallet = new quais.Wallet(PK, provider);
  const from = await wallet.getAddress();

  // Minimal ABI
  const ABI = [
    { inputs: [], name: 'owner', outputs: [{type:'address'}], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'getRewardBalance', outputs: [{type:'uint256'}], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'paused', outputs: [{type:'bool'}], stateMutability: 'view', type: 'function' },
    { inputs: [{name:'_amount',type:'uint256'}], name: 'emergencyRewardWithdraw', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  ];
  const c = new quais.Contract(ca, ABI, wallet);

  // Ownership check
  const owner = await c.owner().catch(()=>null);
  if (owner && owner.toLowerCase() !== from.toLowerCase()) {
    console.error('Signer is not the owner. Owner:', owner, 'Signer:', from);
    process.exit(1);
  }

  // Preflight
  const paused = await c.paused().catch(()=>undefined);
  const rewardBal = await c.getRewardBalance().catch(()=>undefined);
  if (rewardBal !== undefined) {
    console.log('getRewardBalance:', quais.formatQuai(rewardBal), 'QUAI');
    if (rewardBal < amountWei) {
      console.warn('Warning: requested amount exceeds available reward balance');
    }
  }
  if (paused !== undefined) console.log('paused:', paused);

  try {
    const tx = await c.emergencyRewardWithdraw(amountWei, { gasLimit: 500000 });
    console.log('emergencyRewardWithdraw() tx:', tx.hash);
    const rc = await tx.wait();
    console.log('Confirmed in block', rc.blockNumber);
  } catch (e) {
    console.error('emergencyRewardWithdraw failed:', e?.reason || e?.message || e);
    process.exit(1);
  }
}

main().catch(e => { console.error('Fatal:', e?.message || e); process.exit(1); });

