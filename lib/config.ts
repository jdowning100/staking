// Network and Provider Constants
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.quai.network';

// Staking Contract Constants
export const STAKING_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_STAKING_CONTRACT_ADDRESS || '0x006Ac8e729d91CC84De81Df5BdB9660Fc5150309';

// Staking Parameters (updated for new contract mechanics)
export const LOCK_PERIOD = 600; // 10 minutes in seconds (testing)
export const REWARD_DELAY_PERIOD = 600; // 10 minutes reward delay (testing)
export const EXIT_PERIOD = 600; // 10 minutes exit period (testing)
export const GRACE_PERIOD = 24 * 60 * 60; // 24 hours in seconds (legacy - not used in new contracts)
export const BLOCKS_PER_SECOND = 0.2; // 5 second block time = 0.2 blocks per second
export const SECONDS_PER_BLOCK = 5; // 5 seconds per block on Quai

// Contract Parameters
export const REWARD_PER_BLOCK = '0.001'; // 0.001 QUAI per block
export const POOL_LIMIT_PER_USER = '1000.0'; // 1000 QUAI max per user

// UI Constants
export const APP_TITLE = process.env.NEXT_PUBLIC_APP_TITLE || 'QUAI Staking';
export const APP_DESCRIPTION = process.env.NEXT_PUBLIC_APP_DESCRIPTION || 'Stake QUAI tokens and earn rewards';

// Formatting Constants
export const TOKEN_SYMBOL = process.env.NEXT_PUBLIC_TOKEN_SYMBOL || 'QUAI';
export const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS) || 18;

// Token Contract Addresses
export const TOKEN_ADDRESSES = {
  WQI: '0x002b2596ecf05c93a31ff916e8b456df6c77c750',
  WQUAI: '0x006c3e2aaae5db1bcd11a1a097ce572312eaddbb',
  QUAI: 'native', // Native QUAI
  USDC: '0x0000000000000000000000000000000000000000' // Placeholder - add when available
};

// LP Token Addresses
export const LP_TOKEN_ADDRESSES = {
  'WQI-QUAI': '0x001f91029Df78aF6D13cbFfa8724F1b2718da3F1',
  'QUAI-USDC': '0x0000000000000000000000000000000000000000', // Placeholder
  'WQI-USDC': '0x0000000000000000000000000000000000000000'  // Placeholder
};

// LP Pool Configuration
// DEX Configuration (Uniswap V2 Fork)
export const DEX_CONFIG = {
  ROUTER_ADDRESS: '0x006432Ea8c46cBF981f6e710d2439C941CeBe2d0',
  FACTORY_ADDRESS: '0x0000000000000000000000000000000000000000', // Add when available
  WETH_ADDRESS: TOKEN_ADDRESSES.WQUAI, // WQUAI acts as WETH
};

export const LP_POOLS = {
  'wqi-quai': {
    id: 'wqi-quai',
    name: 'WQI/QUAI LP',
    tokens: ['WQI', 'QUAI'],
    lpToken: LP_TOKEN_ADDRESSES['WQI-QUAI'],
    token0: TOKEN_ADDRESSES.WQI,
    token1: TOKEN_ADDRESSES.WQUAI,
    isActive: true, // Enable for testing
    // DEX router for swaps
    router: DEX_CONFIG.ROUTER_ADDRESS,
    // Liquidity pool pair contract
    pair: LP_TOKEN_ADDRESSES['WQI-QUAI'],
    // LP Staking contract
    stakingContract: '0x0050ad2b4CFB4dF2c62181818FF0168007eC6356'
  },
  'quai-usdc': {
    id: 'quai-usdc',
    name: 'QUAI/USDC LP',
    tokens: ['QUAI', 'USDC'],
    lpToken: LP_TOKEN_ADDRESSES['QUAI-USDC'],
    token0: TOKEN_ADDRESSES.WQUAI,
    token1: TOKEN_ADDRESSES.USDC,
    isActive: false, // Not deployed yet
    router: DEX_CONFIG.ROUTER_ADDRESS,
    pair: LP_TOKEN_ADDRESSES['QUAI-USDC'],
    stakingContract: '0x0000000000000000000000000000000000000000' // UPDATE after deployment
  },
  'wqi-usdc': {
    id: 'wqi-usdc',
    name: 'WQI/USDC LP',
    tokens: ['WQI', 'USDC'],
    lpToken: LP_TOKEN_ADDRESSES['WQI-USDC'],
    token0: TOKEN_ADDRESSES.WQI,
    token1: TOKEN_ADDRESSES.USDC,
    isActive: false, // Not deployed yet
    router: DEX_CONFIG.ROUTER_ADDRESS,
    pair: LP_TOKEN_ADDRESSES['WQI-USDC'],
    stakingContract: '0x0000000000000000000000000000000000000000' // UPDATE after deployment
  }
};

// Legacy vesting contract addresses for backward compatibility (can be removed later)
export const VESTING_CONTRACT_ADDRESSES = [
  process.env.NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS || '0x0045edcE84e8E85e1E4861f082e5F5A0a50A7317',
  process.env.NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS_2 || '0x000a579b9769998f350E4B1C1C8bf23921a1d8De',
].filter(address => address !== '0x0000000000000000000000000000000000000000');

export const VESTING_CONTRACT_ADDRESS = VESTING_CONTRACT_ADDRESSES[0];
