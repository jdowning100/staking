// Network and Provider Constants
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.quai.network';

// Vesting Contract Constants
export const VESTING_CONTRACT_ADDRESSES = [
  process.env.NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS || '0x0045edcE84e8E85e1E4861f082e5F5A0a50A7317',
  process.env.NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS_2 || '0x000a579b9769998f350E4B1C1C8bf23921a1d8De',
].filter(address => address !== '0x0000000000000000000000000000000000000000');

// Legacy single contract address for backward compatibility
export const VESTING_CONTRACT_ADDRESS = VESTING_CONTRACT_ADDRESSES[0];

// UI Constants
export const APP_TITLE = process.env.NEXT_PUBLIC_APP_TITLE || 'Quai Token Claims';
export const APP_DESCRIPTION = process.env.NEXT_PUBLIC_APP_DESCRIPTION || 'Check and claim your vested Quai tokens';

// Formatting Constants
export const TOKEN_SYMBOL = process.env.NEXT_PUBLIC_TOKEN_SYMBOL || 'QUAI';
export const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS) || 18;
