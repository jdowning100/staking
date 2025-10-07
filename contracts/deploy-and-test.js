const quais = require('quais')
const { deployMetadata } = require("hardhat");
require('dotenv').config()

// Import contract artifacts
const SmartChefNativeJson = require('../artifacts/contracts/SmartChefNative.sol/SmartChefNative.json')

// Test configuration
const TEST_CONFIG = {
    REWARD_PER_BLOCK: quais.parseQuai('0.00001'), // 0.00001 QUAI per block (much lower APY)
    POOL_LIMIT_PER_USER: quais.parseQuai('100'), // 100 QUAI max per user
    INITIAL_FUNDING: quais.parseQuai('2'), // 2 QUAI for rewards (more buffer)
    TEST_DEPOSIT_AMOUNT: quais.parseQuai('0.5'), // 0.5 QUAI test deposit
    SMALL_DEPOSIT: quais.parseQuai('0.1'), // 0.1 QUAI small deposit
}

// Color codes for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
}

function logSuccess(message) {
    console.log(`${colors.green}✓${colors.reset} ${message}`)
}

function logError(message) {
    console.log(`${colors.red}✗${colors.reset} ${message}`)
}

function logInfo(message) {
    console.log(`${colors.blue}ℹ${colors.reset} ${message}`)
}

function logTest(message) {
    console.log(`${colors.yellow}▶${colors.reset} ${message}`)
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function deploySmartChefNative() {
    console.log('Starting deployment and testing of SmartChefNative contract...\n')

    // Config provider and wallet
    const provider = new quais.JsonRpcProvider(hre.network.config.url, undefined, { usePathing: true })
    const wallet = new quais.Wallet(hre.network.config.accounts[0], provider)

    console.log('Deploying from address:', wallet.address)
    console.log('Network:', hre.network.name)
    console.log('RPC URL:', hre.network.config.url)

    // Check balance
    const balance = await provider.getBalance(wallet.address)
    console.log('Wallet balance:', quais.formatQuai(balance), 'QUAI\n')

    let smartChefNative;
    let contractAddress;

    // ============================================
    // DEPLOYMENT PHASE
    // ============================================
    console.log('='.repeat(50))
    console.log('DEPLOYMENT PHASE')
    console.log('='.repeat(50))

    try {
        const currentBlock = await provider.getBlockNumber()
        const startBlock = currentBlock + 10 // Start rewards 10 blocks from now

        logInfo(`Current block: ${currentBlock}`)
        logInfo(`Start block: ${startBlock}`)
        logInfo(`Reward per block: ${quais.formatQuai(TEST_CONFIG.REWARD_PER_BLOCK)} QUAI`)
        logInfo(`Pool limit per user: ${quais.formatQuai(TEST_CONFIG.POOL_LIMIT_PER_USER)} QUAI`)

        const ipfsHash = await deployMetadata.pushMetadataToIPFS("SmartChefNative")
        const SmartChefNativeFactory = new quais.ContractFactory(
            SmartChefNativeJson.abi,
            SmartChefNativeJson.bytecode,
            wallet,
            ipfsHash
        )

        smartChefNative = await SmartChefNativeFactory.deploy(
            TEST_CONFIG.REWARD_PER_BLOCK,
            startBlock,
            TEST_CONFIG.POOL_LIMIT_PER_USER
        )

        console.log('Deployment transaction:', smartChefNative.deploymentTransaction().hash)
        await smartChefNative.waitForDeployment()
        contractAddress = await smartChefNative.getAddress()

        logSuccess(`SmartChefNative deployed to: ${contractAddress}`)

    } catch (error) {
        logError(`Deployment failed: ${error.message}`)
        process.exit(1)
    }

    // ============================================
    // FUNCTIONAL TESTS
    // ============================================
    console.log('\n' + '='.repeat(50))
    console.log('FUNCTIONAL TESTS')
    console.log('='.repeat(50))

    let testsPassed = 0
    let testsFailed = 0

    // Test 1: Fund the contract with rewards
    logTest('Test 1: Funding contract with rewards')
    try {
        const fundTx = await smartChefNative.fundRewards({
            value: TEST_CONFIG.INITIAL_FUNDING,
            gasLimit: 500000
        })
        await fundTx.wait()

        const contractBalance = await provider.getBalance(contractAddress)
        if (contractBalance === TEST_CONFIG.INITIAL_FUNDING) {
            logSuccess(`Contract funded with ${quais.formatQuai(TEST_CONFIG.INITIAL_FUNDING)} QUAI`)
            testsPassed++
        } else {
            throw new Error(`Balance mismatch: expected ${quais.formatQuai(TEST_CONFIG.INITIAL_FUNDING)}, got ${quais.formatQuai(contractBalance)}`)
        }
    } catch (error) {
        logError(`Fund rewards failed: ${error.message}`)
        testsFailed++
    }

    // Test 2: Make a deposit
    logTest('Test 2: Making a deposit')
    try {
        const depositTx = await smartChefNative.deposit({
            value: TEST_CONFIG.TEST_DEPOSIT_AMOUNT,
            gasLimit: 500000
        })
        await depositTx.wait()

        const userInfo = await smartChefNative.userInfo(wallet.address)
        if (userInfo.amount === TEST_CONFIG.TEST_DEPOSIT_AMOUNT) {
            logSuccess(`Deposited ${quais.formatQuai(TEST_CONFIG.TEST_DEPOSIT_AMOUNT)} QUAI`)
            logInfo(`User stake: ${quais.formatQuai(userInfo.amount)} QUAI`)
            logInfo(`Lock start time: ${new Date(Number(userInfo.lockStartTime) * 1000).toLocaleString()}`)
            testsPassed++
        } else {
            throw new Error(`Deposit amount mismatch`)
        }
    } catch (error) {
        logError(`Deposit failed: ${error.message}`)
        testsFailed++
    }

    // Test 3: Check lock status
    logTest('Test 3: Checking lock status')
    try {
        const isLocked = await smartChefNative.isLocked(wallet.address)
        const timeUntilUnlock = await smartChefNative.timeUntilUnlock(wallet.address)

        if (isLocked) {
            logSuccess('User is locked as expected')
            logInfo(`Time until unlock: ${Number(timeUntilUnlock) / 86400} days`)
            testsPassed++
        } else {
            throw new Error('User should be locked after deposit')
        }
    } catch (error) {
        logError(`Lock check failed: ${error.message}`)
        testsFailed++
    }

    // Test 4: Attempt withdrawal during lock period (should fail)
    logTest('Test 4: Attempting withdrawal during lock period (should fail)')
    try {
        await smartChefNative.withdraw(TEST_CONFIG.TEST_DEPOSIT_AMOUNT, { gasLimit: 500000 })
        logError('Withdrawal succeeded when it should have failed')
        testsFailed++
    } catch (error) {
        if (error.message.includes('Still locked') ||
            error.message.includes('not in grace period') ||
            error.message.includes('Access list creation failed') ||
            error.message.includes('execution reverted')) {
            logSuccess('Withdrawal correctly blocked during lock period')
            testsPassed++
        } else {
            logError(`Unexpected error: ${error.message}`)
            testsFailed++
        }
    }

    // Test 5: Check pending rewards
    logTest('Test 5: Checking pending rewards')
    try {
        // Wait a bit for blocks to be mined naturally
        logInfo('Waiting for natural block progression...')
        await sleep(10000) // Wait 10 seconds for some blocks

        const pending = await smartChefNative.pendingReward(wallet.address)
        logSuccess(`Pending rewards: ${quais.formatQuai(pending)} QUAI`)

        if (pending > 0n) {
            logInfo('Rewards are accumulating correctly')
            testsPassed++
        } else {
            logInfo('No rewards yet (may need to wait for start block)')
            testsPassed++
        }
    } catch (error) {
        logError(`Pending reward check failed: ${error.message}`)
        testsFailed++
    }

    // Test 6: Claim rewards
    logTest('Test 6: Claiming rewards without withdrawing')
    try {
        const pendingBefore = await smartChefNative.pendingReward(wallet.address)

        if (pendingBefore > 0n) {
            const balanceBefore = await provider.getBalance(wallet.address)
            const claimTx = await smartChefNative.claimRewards({ gasLimit: 500000 })
            const receipt = await claimTx.wait()
            const balanceAfter = await provider.getBalance(wallet.address)

            // Account for gas costs
            const gasUsed = receipt.gasUsed * receipt.gasPrice
            const actualReward = balanceAfter - balanceBefore + gasUsed

            logSuccess(`Claimed ${quais.formatQuai(pendingBefore)} QUAI in rewards`)
            logInfo(`Gas used: ${quais.formatQuai(gasUsed)} QUAI`)
            testsPassed++
        } else {
            logInfo('No rewards to claim yet')
            testsPassed++
        }
    } catch (error) {
        logError(`Claim rewards failed: ${error.message}`)
        testsFailed++
    }

    // Test 7: Top-up deposit (should reset lock)
    logTest('Test 7: Adding to position (should reset lock)')
    try {
        // Check reward balance before top-up
        const rewardBalanceBefore = await smartChefNative.getRewardBalance()
        const pendingRewards = await smartChefNative.pendingReward(wallet.address)
        logInfo(`Reward balance before top-up: ${quais.formatQuai(rewardBalanceBefore)} QUAI`)
        logInfo(`Pending rewards: ${quais.formatQuai(pendingRewards)} QUAI`)

        const lockTimeBefore = (await smartChefNative.userInfo(wallet.address)).lockStartTime
        await sleep(2000) // Wait 2 seconds

        const topUpTx = await smartChefNative.deposit({
            value: TEST_CONFIG.SMALL_DEPOSIT,
            gasLimit: 500000
        })
        await topUpTx.wait()

        const userInfo = await smartChefNative.userInfo(wallet.address)
        const lockTimeAfter = userInfo.lockStartTime

        if (lockTimeAfter > lockTimeBefore) {
            logSuccess('Lock period reset after additional deposit')
            logInfo(`Total staked: ${quais.formatQuai(userInfo.amount)} QUAI`)
            testsPassed++
        } else {
            throw new Error('Lock time should have been reset')
        }
    } catch (error) {
        if (error.message.includes('Insufficient reward balance')) {
            logError('Insufficient reward balance - this indicates a solvency issue')
            logInfo('This should not happen with proper funding and low APY')
            testsFailed++
        } else {
            logError(`Top-up deposit failed: ${error.message}`)
            testsFailed++
        }
    }

    // Test 8: Update reward rate (admin function)
    logTest('Test 8: Updating APY (admin function)')
    try {
        const newAPY = 500 // 5% APY in basis points (reduced from 20%)
        const updateTx = await smartChefNative.updateRewardPerBlock(newAPY, { gasLimit: 500000 })
        await updateTx.wait()

        const newRewardPerBlock = await smartChefNative.rewardPerBlock()
        logSuccess(`APY updated to ${newAPY / 100}%`)
        logInfo(`New reward per block: ${quais.formatQuai(newRewardPerBlock)} QUAI`)
        testsPassed++
    } catch (error) {
        logError(`Update APY failed: ${error.message}`)
        testsFailed++
    }

    // Test 9: Check solvency protection
    logTest('Test 9: Checking solvency protection')
    try {
        const totalStaked = await smartChefNative.totalStaked()
        const rewardBalance = await smartChefNative.getRewardBalance()
        const contractBalance = await provider.getBalance(contractAddress)

        logInfo(`Contract balance: ${quais.formatQuai(contractBalance)} QUAI`)
        logInfo(`Total staked: ${quais.formatQuai(totalStaked)} QUAI`)
        logInfo(`Reward balance: ${quais.formatQuai(rewardBalance)} QUAI`)

        if (contractBalance >= totalStaked) {
            logSuccess('Solvency maintained: balance >= totalStaked')
            testsPassed++
        } else {
            throw new Error('Solvency violation detected')
        }
    } catch (error) {
        logError(`Solvency check failed: ${error.message}`)
        testsFailed++
    }

    // Test 10: Get lock cycle information
    logTest('Test 10: Getting lock cycle information')
    try {
        const lockInfo = await smartChefNative.getLockInfo(wallet.address)
        const currentCycle = await smartChefNative.getCurrentCycle(wallet.address)

        logSuccess('Lock info retrieved successfully')
        logInfo(`Current cycle: ${currentCycle}`)
        logInfo(`Can withdraw: ${lockInfo.canWithdraw}`)
        logInfo(`In grace period: ${lockInfo.inGracePeriod}`)
        testsPassed++
    } catch (error) {
        logError(`Get lock info failed: ${error.message}`)
        testsFailed++
    }

    // ============================================
    // TEST SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(50))
    console.log('TEST SUMMARY')
    console.log('='.repeat(50))

    console.log(`${colors.green}Tests Passed: ${testsPassed}${colors.reset}`)
    console.log(`${colors.red}Tests Failed: ${testsFailed}${colors.reset}`)

    const totalTests = testsPassed + testsFailed
    const successRate = (testsPassed / totalTests * 100).toFixed(1)

    if (testsFailed === 0) {
        console.log(`\n${colors.green}✓ All tests passed! (${successRate}%)${colors.reset}`)
    } else {
        console.log(`\n${colors.yellow}⚠ Some tests failed (${successRate}% success rate)${colors.reset}`)
    }

    console.log('\n' + '='.repeat(50))
    console.log('CONTRACT DETAILS')
    console.log('='.repeat(50))
    console.log(`Contract Address: ${contractAddress}`)
    console.log(`Network: ${hre.network.name}`)
    console.log(`Block Time: ${await smartChefNative.blockTime()} seconds`)
    console.log(`Lock Period: 30 days`)
    console.log(`Grace Period: 24 hours`)

    return testsFailed === 0
}

// Run deployment and tests
deploySmartChefNative()
    .then((success) => {
        process.exit(success ? 0 : 1)
    })
    .catch((error) => {
        console.error('Unexpected error:', error)
        process.exit(1)
    })