#!/bin/bash

# Contract deployment script for SmartChefNative

echo "=== SmartChefNative Contract Deployment ==="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please create a .env file with the following variables:"
    echo ""
    echo "RPC_URL=https://rpc.cyprus1.colosseum.quai.network"
    echo "CHAIN_ID=9000"
    echo "CYPRUS1_PK=your_private_key_here"
    echo ""
    exit 1
fi

# Source environment variables
source .env

# Check required environment variables
if [ -z "$RPC_URL" ] || [ -z "$CHAIN_ID" ] || [ -z "$CYPRUS1_PK" ]; then
    echo "❌ Missing required environment variables!"
    echo "Please check your .env file contains:"
    echo "- RPC_URL"
    echo "- CHAIN_ID" 
    echo "- CYPRUS1_PK"
    exit 1
fi

echo "✅ Environment variables loaded"
echo "🌐 Network: $RPC_URL"
echo "🔗 Chain ID: $CHAIN_ID"
echo ""

# Compile contracts
echo "📝 Compiling contracts..."
npx hardhat compile

if [ $? -ne 0 ]; then
    echo "❌ Compilation failed!"
    exit 1
fi

echo "✅ Contracts compiled successfully"
echo ""

# Deploy and test
echo "🚀 Deploying SmartChefNative contract..."
echo "⚠️  This will run comprehensive tests after deployment"
echo ""

node contracts/deploy-and-test.js

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Deployment and testing completed successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Update your .env file with the contract address"
    echo "2. Update lib/config.ts with the new contract address"
    echo "3. Test the frontend integration"
else
    echo "❌ Deployment or testing failed!"
    exit 1
fi