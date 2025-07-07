// Network and Provider Constants
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://orchard.rpc.quai.network';

// Vesting Contract Constants
export const VESTING_CONTRACT_ADDRESSES = [
  process.env.NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS || '0x0056e37Cf10e1183540E86027D7821A8AE3a7b93',
  process.env.NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS_2 || '0x006b15D1B80748173007Ee44aEa660ed54E62527',
].filter(address => address !== '0x0000000000000000000000000000000000000000');

// Legacy single contract address for backward compatibility
export const VESTING_CONTRACT_ADDRESS = VESTING_CONTRACT_ADDRESSES[0];

// UI Constants
export const APP_TITLE = process.env.NEXT_PUBLIC_APP_TITLE || 'Quai Token Vesting Claims';
export const APP_DESCRIPTION = process.env.NEXT_PUBLIC_APP_DESCRIPTION || 'Check and claim your vested Quai tokens';

// Formatting Constants
export const TOKEN_SYMBOL = process.env.NEXT_PUBLIC_TOKEN_SYMBOL || 'QUAI';
export const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS) || 18;
