#!/usr/bin/env node
/*
  Owner script: updatePoolLimitPerUser(hasUserLimit, poolLimitPerUser)

  Usage:
    RPC_URL=https://rpc.quai.network CYPRUS1_PK=0x... \
    node contracts/update-pool-limit.js <stakingContract> <hasUserLimit:0|1> <limitInQUAI>

  Notes:
    - Works for both SmartChefNative and SmartChefLP, which expose updatePoolLimitPerUser(bool,uint256).
    - The limit value is interpreted as 18‑decimals (QUAI or LP tokens), parsed via quais.parseQuai.
*/

const quais = require('quais');
require('dotenv').config();

function isAddr(x){ return /^0x[0-9a-fA-F]{40}$/.test(x||''); }

async function main(){
  const [, , ca, hasStr, limitStr] = process.argv;
  if (!isAddr(ca) || (hasStr !== '0' && hasStr !== '1') || !limitStr || isNaN(Number(limitStr))) {
    console.error('Usage: node contracts/update-pool-limit.js <stakingContract> <hasUserLimit:0|1> <limitInQUAI>');
    process.exit(1);
  }
  const hasUserLimit = hasStr === '1';
  const limitWei = quais.parseQuai(limitStr);

  const RPC = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.quai.network';
  const PK  = process.env.CYPRUS1_PK || process.env.PRIVATE_KEY || process.env.DEPLOYER_KEY;
  if (!PK) { console.error('Missing private key: set CYPRUS1_PK/PRIVATE_KEY'); process.exit(1); }

  console.log('RPC_URL:', RPC);
  console.log('Contract:', ca);
  console.log('hasUserLimit:', hasUserLimit);
  console.log('New limit (QUAI/LP units):', limitStr, '— wei:', limitWei.toString());

  const provider = new quais.JsonRpcProvider(RPC, undefined, { usePathing: true });
  const wallet = new quais.Wallet(PK, provider);
  const from = await wallet.getAddress();

  // Minimal ABI
  const ABI = [
    { inputs: [], name: 'owner', outputs: [{type:'address'}], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'hasUserLimit', outputs: [{type:'bool'}], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'poolLimitPerUser', outputs: [{type:'uint256'}], stateMutability: 'view', type: 'function' },
    { inputs: [ {name:'_hasUserLimit',type:'bool'}, {name:'_poolLimitPerUser',type:'uint256'} ], name: 'updatePoolLimitPerUser', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  ];
  const c = new quais.Contract(ca, ABI, wallet);

  // Ownership check
  const owner = await c.owner().catch(()=>null);
  if (owner && owner.toLowerCase() !== from.toLowerCase()) {
    console.error('Signer is not the owner. Owner:', owner, 'Signer:', from);
    process.exit(1);
  }

  // Show current values
  const curHas = await c.hasUserLimit().catch(()=>undefined);
  const curLim = await c.poolLimitPerUser().catch(()=>undefined);
  if (curHas !== undefined) console.log('Current hasUserLimit:', curHas);
  if (curLim !== undefined) console.log('Current poolLimitPerUser:', quais.formatQuai(curLim), '(raw:', curLim.toString() + ')');

  try {
    const tx = await c.updatePoolLimitPerUser(hasUserLimit, limitWei, { gasLimit: 500000 });
    console.log('updatePoolLimitPerUser() tx:', tx.hash);
    const rc = await tx.wait();
    console.log('Confirmed in block', rc.blockNumber);
    const newHas = await c.hasUserLimit().catch(()=>undefined);
    const newLim = await c.poolLimitPerUser().catch(()=>undefined);
    if (newHas !== undefined) console.log('New hasUserLimit:', newHas);
    if (newLim !== undefined) console.log('New poolLimitPerUser:', quais.formatQuai(newLim), '(raw:', newLim.toString() + ')');
  } catch (e) {
    console.error('updatePoolLimitPerUser failed:', e?.reason || e?.message || e);
    process.exit(1);
  }
}

main().catch(e => { console.error('Fatal:', e?.message || e); process.exit(1); });

