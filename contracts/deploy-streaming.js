const quais = require('quais')
const { deployMetadata } = require("hardhat");
require('dotenv').config()

// Import contract artifacts
const SmartChefNativeJson = require('../artifacts/contracts/SmartChefNative.sol/SmartChefNative.json')

/**
 * Note on transaction receipt handling in quais.js:
 * 
 * The wait() method DOES check for transaction success!
 * - If receipt.status === 0 (failed), wait() throws a CALL_EXCEPTION error
 * - If receipt.status === 1 (success) or null, wait() returns the receipt
 * 
 * This means our current code will automatically catch failed transactions
 * and handle them in the catch blocks.
 */

async function deploySmartChefNative() {
  console.log('Starting deployment of SmartChefNative contract...\n')

  // Config provider and wallet
  const provider = new quais.JsonRpcProvider(process.env.RPC_URL, undefined, { usePathing: true })
  const wallet = new quais.Wallet(process.env.CYPRUS1_PK, provider)

  console.log('Deploying from address:', wallet.address)
  console.log("Wallet balance:", quais.formatQuai(await provider.getBalance(wallet.address)))
  console.log('Network: Cyprus-1')
  console.log('RPC URL:', process.env.RPC_URL)

  console.log('\n=== Deploying SmartChefNative Contract ===')
  try {
    // Get current block (informational)
    const currentBlock = await provider.getBlockNumber()

    // Configuration - consistent with frontend config
    const poolLimitPerUser = quais.parseQuai('1000') // 1000 QUAI max per user

    // Set periods to 10 minutes for testing (600 seconds)
    const rewardDelayPeriod = 600 // 10 minutes reward delay
    const exitPeriod = 600 // 10 minutes exit period

    console.log('Current block:', currentBlock)
    console.log('Pool limit per user:', quais.formatQuai(poolLimitPerUser), 'QUAI')
    console.log('Reward delay period:', rewardDelayPeriod, 'seconds')
    console.log('Exit period:', exitPeriod, 'seconds')

    const ipfsHash = await deployMetadata.pushMetadataToIPFS("SmartChefNative")
    const SmartChefNativeFactory = new quais.ContractFactory(
      SmartChefNativeJson.abi,
      SmartChefNativeJson.bytecode,
      wallet,
      ipfsHash
    )

    // New constructor signature:
    // constructor(uint256 _poolLimitPerUser, uint256 _rewardDelayPeriod, uint256 _exitPeriod)
    const smartChefNative = await SmartChefNativeFactory.deploy(
      poolLimitPerUser,
      rewardDelayPeriod,
      exitPeriod
    )

    console.log('SmartChefNative deployment transaction:', smartChefNative.deploymentTransaction().hash)
    await smartChefNative.waitForDeployment()
    const contractAddress = await smartChefNative.getAddress()
    console.log('SmartChefNative deployed to:', contractAddress)

    console.log('\n🎉 Deployment successful!')
    console.log('Contract Address:', contractAddress)
    console.log('\n⚠️ Remember to:')
    console.log('1. Update .env with NEXT_PUBLIC_STAKING_CONTRACT_ADDRESS=' + contractAddress)
    console.log('2. Fund the contract with rewards using fundRewards()')
    console.log('3. Set emission rate (stream) with setEmissionRateByDuration(SECONDS) or setEmissionRate(ratePerSecond)')

    // Optional: set default emission rate to stream over 30 days
    try {
      const staking = new quais.Contract(contractAddress, SmartChefNativeJson.abi, wallet)
      const targetDuration = 30 * 24 * 60 * 60 // 30 days
      console.log('Setting emission to deplete rewards over ~30 days (if funded) ...')
      // First try convenience method (new ABI)
      try {
        const txSet = await staking.setEmissionRateByDuration(targetDuration)
        await txSet.wait()
        console.log('Emission rate configured via setEmissionRateByDuration.')
      } catch (e1) {
        console.log('setEmissionRateByDuration not available in ABI, falling back to setEmissionRate ...')
        // Fallback: compute rate = budget / duration, then setEmissionRate
        let budget = 0n
        try {
          budget = await staking.getRewardBalance()
        } catch (e2) {
          // Compute from native balance minus principal as last resort
          const bal = await provider.getBalance(contractAddress)
          let total = 0n
          try { total = await staking.totalStaked() } catch { }
          budget = bal - total > 0n ? bal - total : 0n
        }
        const rate = budget / BigInt(targetDuration)
        if (rate > 0n) {
          const txSet2 = await staking.setEmissionRate(rate)
          await txSet2.wait()
          console.log('Emission rate configured via setEmissionRate.')
        } else {
          console.log('No reward budget detected; skipping emission setup.')
        }
      }
    } catch (e) {
      console.log('Note: emission setup not executed (method not in ABI). You can run:\n  node contracts/set-emission.js ' + contractAddress + ' --byDuration 2592000')
    }

    return contractAddress

  } catch (error) {
    console.error('Error deploying SmartChefNative:', error.message)
    throw error
  }
}

deploySmartChefNative()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
