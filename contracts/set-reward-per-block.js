// Update SmartChefNative.rewardPerBlock via owner-only function
// Usage:
//   node contracts/set-reward-per-block.js <contractAddress> <rewardPerBlock> [--wei]
// Examples:
//   node contracts/set-reward-per-block.js 0xABC... 0.002            # 0.002 QUAI per block
//   node contracts/set-reward-per-block.js 0xABC... 2000000000000000 --wei  # 2e15 wei per block

const quais = require('quais');
require('dotenv').config();

const SmartChefNativeJson = require('../artifacts/contracts/SmartChefNative.sol/SmartChefNative.json');

async function main() {
  const [contractAddress, rewardArg, maybeWei] = process.argv.slice(2);

  if (!contractAddress || !rewardArg) {
    console.log('Usage: node contracts/set-reward-per-block.js <contractAddress> <rewardPerBlock> [--wei]');
    process.exit(1);
  }

  // Provider + signer
  const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.quai.network';
  const pk = process.env.ADMIN_PK || process.env.CYPRUS1_PK;
  if (!pk) {
    console.error('Missing ADMIN_PK (or CYPRUS1_PK) in .env');
    process.exit(1);
  }

  const provider = new quais.JsonRpcProvider(rpcUrl, undefined, { usePathing: true });
  const wallet = new quais.Wallet(pk, provider);

  const isWei = (maybeWei || '').toLowerCase() === '--wei';
  const newRewardPerBlock = isWei ? BigInt(rewardArg) : quais.parseQuai(rewardArg);

  console.log('Updating rewardPerBlock');
  console.log('- RPC:', rpcUrl);
  console.log('- From:', wallet.address);
  console.log('- Contract:', contractAddress);
  console.log('- New rewardPerBlock:', isWei ? `${newRewardPerBlock} wei` : `${rewardArg} QUAI`);

  const contract = new quais.Contract(contractAddress, SmartChefNativeJson.abi, wallet);

  // Read current value
  const current = await contract.rewardPerBlock();
  console.log('- Current rewardPerBlock:', quais.formatQuai(current), 'QUAI');

  // Send tx
  const tx = await contract.setRewardPerBlock(newRewardPerBlock, { gasLimit: 500_000 });
  console.log('> Tx sent:', tx.hash);
  const receipt = await tx.wait();
  console.log('> Confirmed in block', receipt.blockNumber, 'status:', receipt.status);

  const updated = await contract.rewardPerBlock();
  console.log('- Updated rewardPerBlock:', quais.formatQuai(updated), 'QUAI');
}

main().catch((e) => {
  console.error('Failed to update rewardPerBlock:', e.message || e);
  process.exit(1);
});

