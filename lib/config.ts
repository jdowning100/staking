// Network and Provider Constants
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.quai.network';

// Staking Contract Constants
export const STAKING_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_STAKING_CONTRACT_ADDRESS || '0x006Ac8e729d91CC84De81Df5BdB9660Fc5150309';

// Staking Parameters
export const LOCK_PERIOD = 30 * 24 * 60 * 60; // 30 days in seconds
export const GRACE_PERIOD = 24 * 60 * 60; // 24 hours in seconds
export const BLOCKS_PER_SECOND = 0.2; // 5 second block time = 0.2 blocks per second
export const SECONDS_PER_BLOCK = 5; // 5 seconds per block on Quai

// UI Constants
export const APP_TITLE = process.env.NEXT_PUBLIC_APP_TITLE || 'QUAI Staking';
export const APP_DESCRIPTION = process.env.NEXT_PUBLIC_APP_DESCRIPTION || 'Stake QUAI tokens and earn rewards';

// Formatting Constants
export const TOKEN_SYMBOL = process.env.NEXT_PUBLIC_TOKEN_SYMBOL || 'QUAI';
export const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS) || 18;

// Legacy vesting contract addresses for backward compatibility (can be removed later)
export const VESTING_CONTRACT_ADDRESSES = [
  process.env.NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS || '0x0045edcE84e8E85e1E4861f082e5F5A0a50A7317',
  process.env.NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS_2 || '0x000a579b9769998f350E4B1C1C8bf23921a1d8De',
].filter(address => address !== '0x0000000000000000000000000000000000000000');

export const VESTING_CONTRACT_ADDRESS = VESTING_CONTRACT_ADDRESSES[0];