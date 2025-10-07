const quais = require('quais')
const { deployMetadata } = require("hardhat");
require('dotenv').config()

// Import contract artifacts
const SmartChefJson = require('../artifacts/contracts/SmartChef.sol/SmartChef.json')

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

async function deploySmartChef() {
    console.log('Starting deployment of SmartChef contract...\n')

    // Config provider and wallet
    const provider = new quais.JsonRpcProvider(hre.network.config.url, undefined, { usePathing: true })
    const wallet = new quais.Wallet(hre.network.config.accounts[0], provider)

    console.log('Deploying from address:', wallet.address)
    console.log("Wallet balance:", quais.formatQuai(await provider.getBalance(wallet.address)))
    console.log('Network:', hre.network.name)
    console.log('RPC URL:', hre.network.config.url)

    console.log('\n=== Deploying SmartChef Contract ===')
    try {
        const ipfsHashSmartChef = await deployMetadata.pushMetadataToIPFS("SmartChef")
        const SmartChefFactory = new quais.ContractFactory(SmartChefJson.abi, SmartChefJson.bytecode, wallet, ipfsHashSmartChef)
        const smartChef = await SmartChefFactory.deploy()
        console.log('SmartChef deployment transaction:', smartChef.deploymentTransaction().hash)
        await smartChef.waitForDeployment()
        const smartChefAddress = await smartChef.getAddress()
        console.log('SmartChef deployed to:', smartChefAddress)

        // Run basic tests
        console.log('\nRunning SmartChef basic tests...')

    } catch (error) {
        console.error('Error deploying/testing SmartChef:', error.message)
    }
}

deploySmartChef()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })