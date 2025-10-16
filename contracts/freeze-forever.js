#!/usr/bin/env node
/*
  Permanently freeze (pause) a staking contract (owner-only).

  Usage:
    RPC_URL=https://rpc.quai.network CYPRUS1_PK=0x... node contracts/freeze-forever.js <stakingContract>
*/

const quais = require('quais');
require('dotenv').config();

function isAddr(x){ return /^0x[0-9a-fA-F]{40}$/.test(x||''); }

async function main(){
  const [, , ca] = process.argv;
  if (!isAddr(ca)) {
    console.error('Usage: node contracts/freeze-forever.js <stakingContract>');
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

  // Minimal ABI for freeze and ownership check
  const ABI = [
    { inputs: [], name: 'owner', outputs: [{type:'address'}], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'freezePermanently', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [], name: 'paused', outputs: [{type:'bool'}], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'isPermanentlyFrozen', outputs: [{type:'bool'}], stateMutability: 'view', type: 'function' },
  ];
  const c = new quais.Contract(ca, ABI, wallet);

  const owner = await c.owner().catch(() => null);
  if (!owner) console.warn('Warning: owner() not found; proceeding anyway.');
  if (owner && owner.toLowerCase() !== from.toLowerCase()) {
    console.error('Signer is not the owner. Owner:', owner, 'Signer:', from);
    process.exit(1);
  }

  try {
    const tx = await c.freezePermanently({ gasLimit: 400000 });
    console.log('freezePermanently() tx:', tx.hash);
    const rc = await tx.wait();
    console.log('Confirmed in block', rc.blockNumber);
    const paused = await c.paused().catch(()=>undefined);
    const frozen = await c.isPermanentlyFrozen?.().catch(()=>undefined);
    console.log('paused:', paused, 'permanentlyFrozen:', frozen);
  } catch (e) {
    console.error('freezePermanently failed:', e?.reason || e?.message || e);
    process.exit(1);
  }
}

main().catch(e => { console.error('Fatal:', e?.message || e); process.exit(1); });

