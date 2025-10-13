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
        // Get current block and set start block
        const currentBlock = await provider.getBlockNumber()
        const startBlock = currentBlock + 10
        
        // Configuration
        const rewardPerBlock = quais.parseQuai('0.001') // 0.001 QUAI per block
        const poolLimitPerUser = quais.parseQuai('1000') // 1000 QUAI max per user
        
        console.log('Current block:', currentBlock)
        console.log('Start block:', startBlock)
        console.log('Reward per block:', quais.formatQuai(rewardPerBlock), 'QUAI')
        console.log('Pool limit per user:', quais.formatQuai(poolLimitPerUser), 'QUAI')
        
        const ipfsHash = await deployMetadata.pushMetadataToIPFS("SmartChefNative")
        const SmartChefNativeFactory = new quais.ContractFactory(
            SmartChefNativeJson.abi, 
            SmartChefNativeJson.bytecode, 
            wallet, 
            ipfsHash
        )
        
        const smartChefNative = await SmartChefNativeFactory.deploy(
            rewardPerBlock,
            startBlock,
            poolLimitPerUser
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