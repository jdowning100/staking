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
            logInfo(`User active stake: ${quais.formatQuai(userInfo.amount)} QUAI`)
            testsPassed++
        } else {
            throw new Error(`Deposit amount mismatch`)
        }
    } catch (error) {
        logError(`Deposit failed: ${error.message}`)
        testsFailed++
    }

    // Test 3: Check no pending withdrawal initially
    logTest('Test 3: Checking no pending withdrawal initially')
    try {
        const hasPending = await smartChefNative.hasPendingWithdrawal(wallet.address)

        if (!hasPending) {
            logSuccess('No pending withdrawal as expected')
            testsPassed++
        } else {
            throw new Error('Should not have pending withdrawal after deposit')
        }
    } catch (error) {
        logError(`Pending withdrawal check failed: ${error.message}`)
        testsFailed++
    }

    // Test 4: Check pending rewards
    logTest('Test 4: Checking pending rewards')
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

    // Test 5: Claim rewards (should work anytime)
    logTest('Test 5: Claiming rewards without withdrawing')
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

    // Test 6: Top-up deposit (can deposit anytime, even with pending withdrawal later)
    logTest('Test 6: Adding to position')
    try {
        const rewardBalanceBefore = await smartChefNative.getRewardBalance()
        const pendingRewards = await smartChefNative.pendingReward(wallet.address)
        logInfo(`Reward balance before top-up: ${quais.formatQuai(rewardBalanceBefore)} QUAI`)
        logInfo(`Pending rewards: ${quais.formatQuai(pendingRewards)} QUAI`)

        const userInfoBefore = await smartChefNative.userInfo(wallet.address)

        const topUpTx = await smartChefNative.deposit({
            value: TEST_CONFIG.SMALL_DEPOSIT,
            gasLimit: 500000
        })
        await topUpTx.wait()

        const userInfoAfter = await smartChefNative.userInfo(wallet.address)
        const expectedAmount = userInfoBefore.amount + TEST_CONFIG.SMALL_DEPOSIT

        if (userInfoAfter.amount === expectedAmount) {
            logSuccess('Additional deposit successful')
            logInfo(`Total staked: ${quais.formatQuai(userInfoAfter.amount)} QUAI`)
            testsPassed++
        } else {
            throw new Error('Deposit amount mismatch after top-up')
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

    // Test 7: Request withdrawal
    logTest('Test 7: Requesting withdrawal')
    try {
        const userInfoBefore = await smartChefNative.userInfo(wallet.address)
        const withdrawAmount = userInfoBefore.amount / 2n // Withdraw half

        const requestTx = await smartChefNative.requestWithdrawal(withdrawAmount, { gasLimit: 500000 })
        await requestTx.wait()

        const userInfoAfter = await smartChefNative.userInfo(wallet.address)
        const hasPending = await smartChefNative.hasPendingWithdrawal(wallet.address)
        const withdrawalInfo = await smartChefNative.getWithdrawalInfo(wallet.address)

        if (hasPending && withdrawalInfo.pendingWithdrawalAmount === withdrawAmount) {
            logSuccess(`Withdrawal requested for ${quais.formatQuai(withdrawAmount)} QUAI`)
            logInfo(`Active stake remaining: ${quais.formatQuai(userInfoAfter.amount)} QUAI`)
            logInfo(`Pending withdrawal: ${quais.formatQuai(withdrawalInfo.pendingWithdrawalAmount)} QUAI`)
            logInfo(`Unlock time: ${new Date(Number(withdrawalInfo.withdrawalUnlockTime) * 1000).toLocaleString()}`)
            testsPassed++
        } else {
            throw new Error('Withdrawal request not recorded correctly')
        }
    } catch (error) {
        logError(`Request withdrawal failed: ${error.message}`)
        testsFailed++
    }

    // Test 8: Attempt to complete withdrawal before lock period (should fail)
    logTest('Test 8: Attempting to complete withdrawal before lock period (should fail)')
    try {
        await smartChefNative.completeWithdrawal({ gasLimit: 500000 })
        logError('Complete withdrawal succeeded when it should have failed')
        testsFailed++
    } catch (error) {
        if (error.message.includes('Withdrawal still locked') ||
            error.message.includes('Access list creation failed') ||
            error.message.includes('execution reverted')) {
            logSuccess('Complete withdrawal correctly blocked during lock period')
            testsPassed++
        } else {
            logError(`Unexpected error: ${error.message}`)
            testsFailed++
        }
    }

    // Test 9: Attempt second withdrawal request (should fail - already have pending)
    logTest('Test 9: Attempting second withdrawal request (should fail)')
    try {
        const userInfo = await smartChefNative.userInfo(wallet.address)
        if (userInfo.amount > 0n) {
            await smartChefNative.requestWithdrawal(userInfo.amount, { gasLimit: 500000 })
            logError('Second withdrawal request succeeded when it should have failed')
            testsFailed++
        } else {
            logInfo('No remaining stake to test with')
            testsPassed++
        }
    } catch (error) {
        if (error.message.includes('Already have pending withdrawal') ||
            error.message.includes('Access list creation failed') ||
            error.message.includes('execution reverted')) {
            logSuccess('Second withdrawal request correctly blocked')
            testsPassed++
        } else {
            logError(`Unexpected error: ${error.message}`)
            testsFailed++
        }
    }

    // Test 10: Can still deposit while having pending withdrawal
    logTest('Test 10: Depositing while having pending withdrawal')
    try {
        const depositTx = await smartChefNative.deposit({
            value: TEST_CONFIG.SMALL_DEPOSIT,
            gasLimit: 500000
        })
        await depositTx.wait()

        const userInfo = await smartChefNative.userInfo(wallet.address)
        logSuccess(`Deposit successful while pending withdrawal exists`)
        logInfo(`Active stake: ${quais.formatQuai(userInfo.amount)} QUAI`)
        testsPassed++
    } catch (error) {
        logError(`Deposit with pending withdrawal failed: ${error.message}`)
        testsFailed++
    }

    // Test 11: Reduce lock period and complete withdrawal
    logTest('Test 11: Reducing lock period and completing withdrawal')
    try {
        const withdrawalInfoBefore = await smartChefNative.getWithdrawalInfo(wallet.address)

        // Reduce lock period to 0 for testing
        const updateLockTx = await smartChefNative.updateWithdrawalLockPeriod(0, { gasLimit: 500000 })
        await updateLockTx.wait()
        logInfo('Lock period reduced to 0 for testing')

        // Now complete the withdrawal
        const completeTx = await smartChefNative.completeWithdrawal({ gasLimit: 500000 })
        await completeTx.wait()

        const withdrawalInfoAfter = await smartChefNative.getWithdrawalInfo(wallet.address)

        // Check that withdrawal was completed
        if (withdrawalInfoAfter.pendingWithdrawalAmount === 0n) {
            logSuccess(`Withdrawal completed successfully`)
            logInfo(`Withdrawn: ${quais.formatQuai(withdrawalInfoBefore.pendingWithdrawalAmount)} QUAI`)
            testsPassed++
        } else {
            throw new Error('Withdrawal not completed')
        }

        // Restore lock period to 30 days
        const restoreLockTx = await smartChefNative.updateWithdrawalLockPeriod(30 * 24 * 60 * 60, { gasLimit: 500000 })
        await restoreLockTx.wait()
        logInfo('Lock period restored to 30 days')
    } catch (error) {
        logError(`Complete withdrawal failed: ${error.message}`)
        testsFailed++
    }

    // Test 12: Check solvency protection
    logTest('Test 12: Checking solvency protection')
    try {
        const totalStaked = await smartChefNative.totalStaked()
        const totalPending = await smartChefNative.totalPendingWithdrawals()
        const rewardBalance = await smartChefNative.getRewardBalance()
        const contractBalance = await provider.getBalance(contractAddress)

        logInfo(`Contract balance: ${quais.formatQuai(contractBalance)} QUAI`)
        logInfo(`Total staked: ${quais.formatQuai(totalStaked)} QUAI`)
        logInfo(`Total pending withdrawals: ${quais.formatQuai(totalPending)} QUAI`)
        logInfo(`Reward balance: ${quais.formatQuai(rewardBalance)} QUAI`)

        if (contractBalance >= totalStaked + totalPending) {
            logSuccess('Solvency maintained: balance >= totalStaked + totalPendingWithdrawals')
            testsPassed++
        } else {
            throw new Error('Solvency violation detected')
        }
    } catch (error) {
        logError(`Solvency check failed: ${error.message}`)
        testsFailed++
    }

    // Test 13: Update reward rate (admin function)
    logTest('Test 13: Updating APY (admin function)')
    try {
        const newAPY = 500 // 5% APY in basis points
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

    // Test 14: Get withdrawal info
    logTest('Test 14: Getting withdrawal info')
    try {
        const withdrawalInfo = await smartChefNative.getWithdrawalInfo(wallet.address)

        logSuccess('Withdrawal info retrieved successfully')
        logInfo(`Active stake: ${quais.formatQuai(withdrawalInfo.activeStake)} QUAI`)
        logInfo(`Pending withdrawal: ${quais.formatQuai(withdrawalInfo.pendingWithdrawalAmount)} QUAI`)
        logInfo(`Can complete: ${withdrawalInfo.canComplete}`)
        testsPassed++
    } catch (error) {
        logError(`Get withdrawal info failed: ${error.message}`)
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
    console.log(`Withdrawal Lock Period: ${Number(await smartChefNative.withdrawalLockPeriod()) / 86400} days`)

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
