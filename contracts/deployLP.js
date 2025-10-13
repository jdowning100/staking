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
    rewardPerBlock: quais.parseQuai('0.1'), // 0.1 QUAI per block
    poolLimitPerUser: quais.parseQuai('1000000'), // 1M LP tokens max per user
    hasUserLimit: true
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
  const bonusEndBlock = startBlock + (365 * 24 * 60 * 12); // 1 year of rewards (assuming 5 sec blocks)

  console.log('Contract deployment parameters:');
  console.log(`- LP Token: ${config.lpTokenAddress}`);
  console.log(`- Reward per block: ${config.rewardPerBlock} wei`);
  console.log(`- Start block: ${startBlock}`);
  console.log(`- End block: ${bonusEndBlock}`);
  console.log(`- Pool limit per user: ${config.poolLimitPerUser} wei`);
  console.log(`- Admin: ${wallet.address}`);

  // Get IPFS hash and create contract factory
  const ipfsHash = await deployMetadata.pushMetadataToIPFS("SmartChefLP");
  const factory = new quais.ContractFactory(
    SmartChefLPArtifact.abi,
    SmartChefLPArtifact.bytecode,
    wallet,
    ipfsHash
  );

  const deployTx = await factory.deploy(
    config.lpTokenAddress,          // LP token address
    config.rewardPerBlock,          // Reward per block
    startBlock,                     // Start block
    bonusEndBlock,                  // Bonus end block
    config.poolLimitPerUser,        // Pool limit per user
    wallet.address                  // Admin address
  );

  console.log(`Transaction hash: ${deployTx.deploymentTransaction().hash}`);
  console.log('Waiting for deployment...');

  await deployTx.waitForDeployment();
  const contractAddress = await deployTx.getAddress();
  console.log(`✅ ${poolName} LP Staking Contract deployed at: ${contractAddress}`);

  // Add some initial rewards (10 QUAI)
  console.log('\n💰 Adding initial rewards...');
  const stakingContract = new quais.Contract(
    contractAddress,
    SmartChefLPArtifact.abi,
    wallet
  );

  const addRewardsTx = await stakingContract.addRewards({
    value: quais.parseQuai('10'), // Add 10 QUAI as initial rewards
    gasLimit: 500000
  });

  await addRewardsTx.wait();
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