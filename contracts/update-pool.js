#!/usr/bin/env node
/*
  Usage:
    RPC_URL=https://rpc.quai.network CYPRUS1_PK=0x... node contracts/update-pool.js 0xYourContractAddress

  Calls updatePool() on the provided staking contract address.
  Works for both native and LP staking contracts since the function signature is identical.
*/

const quais = require('quais');
// Load environment variables
require('dotenv').config();

async function main() {
  const [, , contractAddress] = process.argv;
  if (!contractAddress || !/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
    console.error('Error: Please provide a valid contract address.');
    console.error('Example: node scripts/update-pool.js 0x1234...');
    process.exit(1);
  }

  // Prefer project-standard env vars
  const RPC_URL = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.quai.network';
  const PRIVATE_KEY = process.env.CYPRUS1_PK || process.env.PRIVATE_KEY || process.env.DEPLOYER_KEY;

  if (!PRIVATE_KEY) {
    console.error('Error: PRIVATE_KEY (or DEPLOYER_KEY) env var is required to send a transaction.');
    process.exit(1);
  }

  // Minimal ABI for updatePool()
  const UPDATE_POOL_ABI = [
    {
      inputs: [],
      name: 'updatePool',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    }
  ];

  console.log('Using RPC:', RPC_URL);
  console.log('Target contract:', contractAddress);

  const provider = new quais.JsonRpcProvider(RPC_URL, undefined, { usePathing: true });
  const wallet = new quais.Wallet(PRIVATE_KEY, provider);
  const contract = new quais.Contract(contractAddress, UPDATE_POOL_ABI, wallet);

  try {
    // Code presence check
    const code = await provider.getCode(contractAddress);
    if (!code || code === '0x') {
      console.error('No contract code at target address. Are you on the right network/shard?');
      process.exit(1);
    }

    // Light shape probe (optional): try reading typical fields
    try {
      await contract.getFunction('updatePool'); // ethers v6 pattern; may throw in quais
    } catch {}

    // Attempt a gas estimate to catch reverts early if supported
    try {
      if (contract.estimateGas && contract.estimateGas.updatePool) {
        await contract.estimateGas.updatePool();
      }
    } catch (pre) {
      console.error('Estimate failed (likely revert). Common causes:');
      console.error('- Incorrect contract address (not a staking contract)');
      console.error('- Network/shard mismatch for the provided RPC');
      console.error('- Contract conditions not satisfied (e.g., misconfigured/start not reached)');
      console.error('Revert:', pre?.reason || pre?.message || pre);
      // Continue anyway in case the estimate path is stricter than execution
    }

    const tx = await contract.updatePool({ gasLimit: 300000 });
    console.log('updatePool() tx sent:', tx.hash);
    await tx.wait();
    console.log('updatePool() confirmed.');
  } catch (err) {
    console.error('updatePool() failed:', err?.reason || err?.message || err);
    // Probe if the address is an ERC20 (LP token) instead of the staking contract
    try {
      const erc20Abi = [{ inputs: [], name: 'name', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' }];
      const probe = new quais.Contract(contractAddress, erc20Abi, wallet);
      const name = await probe.name().catch(() => null);
      if (name) {
        console.error(`Note: target looks like an ERC20 token (name=${name}). Did you pass the LP token instead of the staking contract?`);
      }
    } catch {}
    process.exit(1);
  }
}

main();
