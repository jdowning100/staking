#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "SmartChefNative Deployment & Testing"
echo "======================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create a .env file with:"
    echo "  RPC_URL=<your-rpc-url>"
    echo "  CYPRUS1_PK=<your-private-key>"
    echo "  CHAIN_ID=<chain-id>"
    exit 1
fi

# Compile contracts
echo -e "${YELLOW}Step 1: Compiling contracts...${NC}"
npx hardhat compile
if [ $? -ne 0 ]; then
    echo -e "${RED}Compilation failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Contracts compiled successfully${NC}"
echo ""

# Run deployment and tests
echo -e "${YELLOW}Step 2: Deploying and testing SmartChefNative...${NC}"
npx hardhat run contracts/deploy-and-test.js --network cyprus1

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}======================================"
    echo "Deployment and testing completed successfully!"
    echo "======================================${NC}"
else
    echo ""
    echo -e "${RED}======================================"
    echo "Deployment or testing failed"
    echo "======================================${NC}"
    exit 1
fi