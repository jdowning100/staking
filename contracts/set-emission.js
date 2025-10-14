const quais = require('quais');
require('dotenv').config();

// Usage:
//  node contracts/set-emission.js <contractAddress> --byDuration <seconds>
//  node contracts/set-emission.js <contractAddress> --rate <quaiPerSecond>

const SmartChefNativeJson = require('../artifacts/contracts/SmartChefNative.sol/SmartChefNative.json');

async function main() {
  const [addr, flag, value] = process.argv.slice(2);
  if (!addr || !flag || !value) {
    console.log('Usage: node contracts/set-emission.js <contractAddress> --byDuration <seconds> | --rate <quaiPerSecond>');
    process.exit(1);
  }

  const provider = new quais.JsonRpcProvider(process.env.RPC_URL, undefined, { usePathing: true });
  const wallet = new quais.Wallet(process.env.CYPRUS1_PK, provider);
  const staking = new quais.Contract(addr, SmartChefNativeJson.abi, wallet);

  console.log('Using wallet:', wallet.address);
  console.log('Target contract:', addr);

  if (flag === '--byDuration') {
    const seconds = BigInt(value);
    console.log('Setting emission by duration (seconds):', seconds.toString());
    const tx = await staking.setEmissionRateByDuration(seconds);
    console.log('Tx:', tx.hash);
    await tx.wait();
  } else if (flag === '--rate') {
    // Input in QUAI per second (string), convert to wei
    const rateWei = quais.parseQuai(value);
    console.log('Setting emission rate (wei per second):', rateWei.toString());
    const tx = await staking.setEmissionRate(rateWei);
    console.log('Tx:', tx.hash);
    await tx.wait();
  } else {
    console.log('Unknown flag:', flag);
    process.exit(1);
  }

  const current = await staking.emissionRate();
  console.log('Current emissionRate (wei/s):', current.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

