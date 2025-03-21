// Network and Provider Constants
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://orchard.rpc.quai.network';

// Vesting Contract Constants
export const VESTING_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS || '0x006ec74887Ec9c0226F2b446af886f20A6e7845B';

// UI Constants
export const APP_TITLE = process.env.NEXT_PUBLIC_APP_TITLE || 'Quai Token Vesting Claims';
export const APP_DESCRIPTION = process.env.NEXT_PUBLIC_APP_DESCRIPTION || 'Check and claim your vested Quai tokens';

// Formatting Constants
export const TOKEN_SYMBOL = process.env.NEXT_PUBLIC_TOKEN_SYMBOL || 'QUAI';
export const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS) || 18;
