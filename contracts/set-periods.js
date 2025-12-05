const quais = require('quais');
require('dotenv').config();

// Usage:
//  node contracts/set-periods.js <contractAddress> --delay 600 --exit 600

const SmartChefNativeJson = require('../artifacts/contracts/SmartChefNative.sol/SmartChefNative.json');

async function main() {
  const [addr, flag1, val1, flag2, val2] = process.argv.slice(2);
  if (!addr || flag1 !== '--delay' || !val1 || flag2 !== '--exit' || !val2) {
    console.log('Usage: node contracts/set-periods.js <contractAddress> --delay <seconds> --exit <seconds>');
    process.exit(1);
  }

  const provider = new quais.JsonRpcProvider(process.env.RPC_URL, undefined, { usePathing: true });
  const wallet = new quais.Wallet(process.env.CYPRUS1_PK, provider);
  const staking = new quais.Contract(addr, SmartChefNativeJson.abi, wallet);

  const delay = BigInt(val1);
  const exit = BigInt(val2);
  console.log('Setting periods on', addr, 'delay:', delay.toString(), 'exit:', exit.toString());

  const tx = await staking.updatePeriods(delay, exit);
  console.log('tx', tx.hash);
  await tx.wait();
  console.log('Updated.');
}

main().catch((e) => { console.error(e); process.exit(1); });

