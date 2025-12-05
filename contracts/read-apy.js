const quais = require('quais');
require('dotenv').config();

// Usage: node contracts/read-apy.js <contractAddress>
const SmartChefNativeJson = require('../artifacts/contracts/SmartChefNative.sol/SmartChefNative.json');

async function main() {
  const [addr] = process.argv.slice(2);
  if (!addr) {
    console.log('Usage: node contracts/read-apy.js <contractAddress>');
    process.exit(1);
  }

  const provider = new quais.JsonRpcProvider(process.env.RPC_URL, undefined, { usePathing: true });
  const staking = new quais.Contract(addr, SmartChefNativeJson.abi, provider);

  const [emissionRate, totalStaked, rewardBalance] = await Promise.all([
    staking.emissionRate ? staking.emissionRate() : 0n,
    staking.totalStaked(),
    staking.getRewardBalance ? staking.getRewardBalance() : 0n,
  ]);

  let apy30 = 0n, apy90 = 0n;
  try { apy30 = await staking.getEstimatedAPY(30 * 24 * 60 * 60); } catch {}
  try { apy90 = await staking.getEstimatedAPY(90 * 24 * 60 * 60); } catch {}

  console.log('Contract:', addr);
  console.log('emissionRate (wei/s):', emissionRate.toString());
  console.log('totalStaked (wei):', totalStaked.toString());
  console.log('rewardBalance (wei):', rewardBalance.toString());
  console.log('APR 30D (bps):', apy30.toString());
  console.log('APR 90D (bps):', apy90.toString());
}

main().catch((e) => { console.error(e); process.exit(1); });

