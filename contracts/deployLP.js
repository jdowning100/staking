const quais = require('quais');
const { deployMetadata } = require("hardhat");
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Contract compilation artifacts
const SmartChefLPArtifact = require('../artifacts/contracts/SmartChefLP.sol/SmartChefLP.json');

const RPC_URL = process.env.RPC_URL || 'https://rpc.quai.network';
const PRIVATE_KEY = process.env.CYPRUS1_PK;
const CHAIN_ID = process.env.CHAIN_ID || '9';

// LP Pool Configuration
const LP_POOLS = {
  'WQI-QUAI': {
    lpTokenAddress: '0x001f91029Df78aF6D13cbFfa8724F1b2718da3F1',
    rewardTokenAddress: '0x0000000000000000000000000000000000000000', // Native QUAI (zero address)
    rewardPerBlock: quais.parseQuai('0.001'), // 0.001 QUAI per block - matches frontend config
    poolLimitPerUser: quais.parseQuai('1000'), // 1000 LP tokens max per user - matches frontend config
    // Set periods to 1 hour for testing (3600 seconds) - matches frontend config
    lockPeriod: 3600, // 1 hour lock period
    rewardDelayPeriod: 3600, // 1 hour reward delay
    exitPeriod: 3600 // 1 hour exit period
  }
  // Add more LP pools as needed
};

async function deployLPStakingContract(poolName, config) {
  console.log(`\n🚀 Deploying LP Staking Contract for ${poolName}...`);

  // Create provider and wallet
  const provider = new quais.JsonRpcProvider(RPC_URL, undefined, { usePathing: true });
  const wallet = new quais.Wallet(PRIVATE_KEY, provider);

  console.log(`Deploying from address: ${wallet.address}`);

  // Get current block for start block
  const currentBlock = await provider.getBlockNumber();
  const startBlock = currentBlock + 10; // Start rewards in 10 blocks

  console.log('Contract deployment parameters:');
  console.log(`- LP Token: ${config.lpTokenAddress}`);
  console.log(`- Reward Token: ${config.rewardTokenAddress} (Native QUAI)`);
  console.log(`- Reward per block: ${quais.formatQuai(config.rewardPerBlock)} QUAI`);
  console.log(`- Start block: ${startBlock}`);
  console.log(`- Pool limit per user: ${quais.formatQuai(config.poolLimitPerUser)} LP tokens`);
  console.log(`- Lock period: ${config.lockPeriod} seconds (1 hour)`);
  console.log(`- Reward delay period: ${config.rewardDelayPeriod} seconds (1 hour)`);
  console.log(`- Exit period: ${config.exitPeriod} seconds (1 hour)`);

  // Get IPFS hash and create contract factory
  const ipfsHash = await deployMetadata.pushMetadataToIPFS("SmartChefLP");
  const factory = new quais.ContractFactory(
    SmartChefLPArtifact.abi,
    SmartChefLPArtifact.bytecode,
    wallet,
    ipfsHash
  );

  // For SmartChefLP constructor:
  // constructor(IERC20 _lpToken, IERC20 _rewardToken, uint256 _rewardPerBlock, uint256 _startBlock, 
  //            uint256 _poolLimitPerUser, uint256 _lockPeriod, uint256 _rewardDelayPeriod, uint256 _exitPeriod)
  const deployTx = await factory.deploy(
    config.lpTokenAddress,          // _lpToken - LP token address
    config.rewardTokenAddress,      // _rewardToken - reward token address (0x0 for native QUAI)
    config.rewardPerBlock,          // _rewardPerBlock
    startBlock,                     // _startBlock
    config.poolLimitPerUser,        // _poolLimitPerUser
    config.lockPeriod,              // _lockPeriod
    config.rewardDelayPeriod,       // _rewardDelayPeriod
    config.exitPeriod               // _exitPeriod
  );

  console.log(`Transaction hash: ${deployTx.deploymentTransaction().hash}`);
  console.log('Waiting for deployment...');

  await deployTx.waitForDeployment();
  const contractAddress = await deployTx.getAddress();
  console.log(`✅ ${poolName} LP Staking Contract deployed at: ${contractAddress}`);

  // Add some initial rewards (10 QUAI) - using fundRewards for native QUAI
  console.log('\n💰 Adding initial rewards...');
  const stakingContract = new quais.Contract(
    contractAddress,
    SmartChefLPArtifact.abi,
    wallet
  );

  // For native QUAI rewards, we send QUAI directly to the contract
  const fundRewardsTx = await wallet.sendTransaction({
    to: contractAddress,
    value: quais.parseQuai('10'), // Add 10 QUAI as initial rewards
    gasLimit: 300000
  });

  await fundRewardsTx.wait();
  console.log('✅ Added 10 QUAI as initial rewards');

  return {
    contractAddress: contractAddress,
    lpToken: config.lpTokenAddress,
    poolName: poolName
  };
}

async function main() {
  if (!PRIVATE_KEY) {
    console.error('❌ Please set PRIVATE_KEY in your .env file');
    process.exit(1);
  }

  console.log('🏗️  Deploying LP Staking Contracts');
  console.log(`Network: ${RPC_URL}`);
  console.log(`Chain ID: ${CHAIN_ID}`);

  const deployedContracts = [];

  // Deploy contracts for each LP pool
  for (const [poolName, config] of Object.entries(LP_POOLS)) {
    try {
      const result = await deployLPStakingContract(poolName, config);
      deployedContracts.push(result);
    } catch (error) {
      console.error(`❌ Failed to deploy ${poolName}:`, error.message);
    }
  }

  // Save deployment info
  const deploymentInfo = {
    network: RPC_URL,
    chainId: CHAIN_ID,
    timestamp: new Date().toISOString(),
    contracts: deployedContracts
  };

  const outputPath = path.join(__dirname, 'lp-deployments.json');
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log('\n📄 Deployment Summary:');
  deployedContracts.forEach(contract => {
    console.log(`${contract.poolName}: ${contract.contractAddress}`);
  });

  console.log(`\n💾 Deployment info saved to: ${outputPath}`);
  console.log('\n✅ All LP staking contracts deployed successfully!');
}

// Run deployment
main().catch(error => {
  console.error('❌ Deployment failed:', error);
  process.exit(1);
});