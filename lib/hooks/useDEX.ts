import { useState, useCallback, useMemo, useContext } from 'react';
import { Contract, parseUnits, formatUnits, MaxUint256, JsonRpcProvider } from 'quais';
import { StateContext } from '@/store';
import { DEX_CONFIG, TOKEN_ADDRESSES, RPC_URL } from '@/lib/config';
import UniswapV2RouterABI from '@/lib/abis/UniswapV2Router.json';
import ERC20ABI from '@/lib/abis/ERC20.json';

// Minimal Uniswap V2 Pair ABI for getting reserves
const UniswapV2PairABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "getReserves",
    "outputs": [
      { "internalType": "uint112", "name": "_reserve0", "type": "uint112" },
      { "internalType": "uint112", "name": "_reserve1", "type": "uint112" },
      { "internalType": "uint32", "name": "_blockTimestampLast", "type": "uint32" }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "token0",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "token1", 
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

interface SwapParams {
  fromToken: string;
  toToken: string;
  amountIn: string;
  slippageTolerance?: number; // Default 0.5%
}

interface AddLiquidityParams {
  tokenA: string;
  tokenB: string;
  amountADesired: string;
  amountBDesired: string;
  slippageTolerance?: number;
}

export function useDEX() {
  const { account, web3Provider } = useContext(StateContext);
  const [isTransacting, setIsTransacting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get provider and signer
  const provider = useMemo(() => new JsonRpcProvider(RPC_URL), []);
  const getSigner = useCallback(async () => {
    if (!web3Provider) throw new Error('No wallet connected');
    return await web3Provider.getSigner();
  }, [web3Provider]);

  // Get router contract with signer
  const getRouterContract = useCallback(async () => {
    const signer = await getSigner();
    return new Contract(DEX_CONFIG.ROUTER_ADDRESS, UniswapV2RouterABI, signer);
  }, [getSigner]);

  // Get token contract
  const getTokenContract = useCallback(async (tokenAddress: string) => {
    const signer = await getSigner();
    return new Contract(tokenAddress, ERC20ABI, signer);
  }, [getSigner]);

  // Get amounts out for a swap
  const getAmountsOut = useCallback(async (amountIn: string, path: string[]) => {
    if (!provider) return null;
    
    try {
      const routerContract = new Contract(DEX_CONFIG.ROUTER_ADDRESS, UniswapV2RouterABI, provider);
      const amounts = await routerContract.getAmountsOut(parseUnits(amountIn, 18), path);
      return amounts.map((amount: bigint) => formatUnits(amount, 18));
    } catch (err) {
      console.error('Error getting amounts out:', err);
      return null;
    }
  }, [provider]);

  // Get swap path for two tokens
  const getSwapPath = useCallback((fromToken: string, toToken: string): string[] => {
    const fromAddress = TOKEN_ADDRESSES[fromToken as keyof typeof TOKEN_ADDRESSES];
    const toAddress = TOKEN_ADDRESSES[toToken as keyof typeof TOKEN_ADDRESSES];
    
    // Handle native QUAI swaps
    if (fromToken === 'QUAI') {
      return [DEX_CONFIG.WETH_ADDRESS, toAddress];
    }
    if (toToken === 'QUAI') {
      return [fromAddress, DEX_CONFIG.WETH_ADDRESS];
    }
    
    // Direct token-to-token swap
    return [fromAddress, toAddress];
  }, []);

  // Approve token spending
  const approveToken = useCallback(async (tokenAddress: string, spender: string, amount?: string) => {
    if (!account?.addr) throw new Error('No wallet connected');
    
    const tokenContract = await getTokenContract(tokenAddress);
    const approvalAmount = amount ? parseUnits(amount, 18) : MaxUint256;
    
    setIsTransacting(true);
    setError(null);
    
    try {
      const tx = await tokenContract.approve(spender, approvalAmount);
      await tx.wait();
      return tx;
    } catch (err: any) {
      setError(err.message || 'Approval failed');
      throw err;
    } finally {
      setIsTransacting(false);
    }
  }, [account, getTokenContract]);

  // Check token allowance
  const checkAllowance = useCallback(async (tokenAddress: string, spender: string): Promise<string> => {
    if (!account?.addr) return '0';
    
    try {
      const tokenContract = new Contract(tokenAddress, ERC20ABI, provider);
      const allowance = await tokenContract.allowance(account.addr, spender);
      return formatUnits(allowance, 18);
    } catch (err) {
      console.error('Error checking allowance:', err);
      return '0';
    }
  }, [account, provider]);

  // Get token balance
  const getTokenBalance = useCallback(async (tokenSymbol: string): Promise<string> => {
    if (!account?.addr) return '0';
    
    try {
      if (tokenSymbol === 'QUAI') {
        // Get native QUAI balance
        const balance = await provider.getBalance(account.addr);
        return formatUnits(balance, 18);
      } else {
        // Get ERC20 token balance
        const tokenAddress = TOKEN_ADDRESSES[tokenSymbol as keyof typeof TOKEN_ADDRESSES];
        if (!tokenAddress) return '0';
        
        const tokenContract = new Contract(tokenAddress, ERC20ABI, provider);
        const balance = await tokenContract.balanceOf(account.addr);
        return formatUnits(balance, 18);
      }
    } catch (err) {
      console.error('Error getting token balance:', err);
      return '0';
    }
  }, [account, provider]);

  // Get optimal amounts for liquidity provision
  const getOptimalAmounts = useCallback(async (
    tokenA: string,
    tokenB: string,
    amountADesired: string,
    pairAddress: string
  ): Promise<{ amountA: string; amountB: string } | null> => {
    if (!provider || !amountADesired || parseFloat(amountADesired) <= 0) {
      return null;
    }
    
    try {
      const pairContract = new Contract(pairAddress, UniswapV2PairABI, provider);
      
      // Get pair token addresses to determine order
      const [token0Address, token1Address, reserves] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
        pairContract.getReserves()
      ]);
      
      const tokenAAddress = tokenA === 'QUAI' ? DEX_CONFIG.WETH_ADDRESS : TOKEN_ADDRESSES[tokenA as keyof typeof TOKEN_ADDRESSES];
      const tokenBAddress = tokenB === 'QUAI' ? DEX_CONFIG.WETH_ADDRESS : TOKEN_ADDRESSES[tokenB as keyof typeof TOKEN_ADDRESSES];
      
      if (!tokenAAddress || !tokenBAddress) {
        return null;
      }
      
      // Determine if tokenA is token0 or token1 in the pair
      const isTokenAFirst = tokenAAddress.toLowerCase() === token0Address.toLowerCase();
      const reserveA = isTokenAFirst ? reserves[0] : reserves[1];
      const reserveB = isTokenAFirst ? reserves[1] : reserves[0];
      
      // If no liquidity exists yet, return the desired amounts
      if (reserveA === BigInt(0) || reserveB === BigInt(0)) {
        return {
          amountA: amountADesired,
          amountB: '0' // User needs to specify both amounts for first liquidity
        };
      }
      
      // Calculate optimal amount B based on current pool ratio
      const amountADesiredWei = parseUnits(amountADesired, 18);
      const optimalAmountBWei = (amountADesiredWei * reserveB) / reserveA;
      const optimalAmountB = formatUnits(optimalAmountBWei, 18);
      
      return {
        amountA: amountADesired,
        amountB: optimalAmountB
      };
    } catch (err) {
      console.error('Error calculating optimal amounts:', err);
      return null;
    }
  }, [provider]);

  // Execute token swap
  const swapTokens = useCallback(async ({
    fromToken,
    toToken,
    amountIn,
    slippageTolerance = 0.5
  }: SwapParams) => {
    if (!account?.addr) {
      throw new Error('No wallet connected');
    }

    setIsTransacting(true);
    setError(null);

    try {
      const routerContract = await getRouterContract();
      const path = getSwapPath(fromToken, toToken);
      const deadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 minutes
      
      // Get expected output amount
      const amountsOut = await getAmountsOut(amountIn, path);
      if (!amountsOut || amountsOut.length === 0) {
        throw new Error('Unable to calculate swap amounts');
      }
      
      // Calculate minimum output with slippage
      const expectedOut = parseFloat(amountsOut[amountsOut.length - 1]);
      const minAmountOut = expectedOut * (1 - slippageTolerance / 100);
      const minAmountOutWei = parseUnits(minAmountOut.toString(), 18);
      
      let tx;
      
      if (fromToken === 'QUAI') {
        // Swap QUAI for tokens
        const value = parseUnits(amountIn, 18);
        tx = await routerContract.swapExactETHForTokens(
          minAmountOutWei,
          path,
          account.addr,
          deadline,
          { value }
        );
      } else if (toToken === 'QUAI') {
        // Swap tokens for QUAI
        const amountInWei = parseUnits(amountIn, 18);
        
        // Check and approve if needed
        const fromAddress = TOKEN_ADDRESSES[fromToken as keyof typeof TOKEN_ADDRESSES];
        const allowance = await checkAllowance(fromAddress, DEX_CONFIG.ROUTER_ADDRESS);
        if (parseFloat(allowance) < parseFloat(amountIn)) {
          await approveToken(fromAddress, DEX_CONFIG.ROUTER_ADDRESS, amountIn);
        }
        
        tx = await routerContract.swapExactTokensForETH(
          amountInWei,
          minAmountOutWei,
          path,
          account.addr,
          deadline
        );
      } else {
        // Token to token swap
        const amountInWei = parseUnits(amountIn, 18);
        
        // Check and approve if needed
        const fromAddress = TOKEN_ADDRESSES[fromToken as keyof typeof TOKEN_ADDRESSES];
        const allowance = await checkAllowance(fromAddress, DEX_CONFIG.ROUTER_ADDRESS);
        if (parseFloat(allowance) < parseFloat(amountIn)) {
          await approveToken(fromAddress, DEX_CONFIG.ROUTER_ADDRESS, amountIn);
        }
        
        tx = await routerContract.swapExactTokensForTokens(
          amountInWei,
          minAmountOutWei,
          path,
          account.addr,
          deadline
        );
      }
      
      await tx.wait();
      return tx;
    } catch (err: any) {
      setError(err.message || 'Swap failed');
      throw err;
    } finally {
      setIsTransacting(false);
    }
  }, [account, getRouterContract, getSwapPath, getAmountsOut, checkAllowance, approveToken]);

  // Add liquidity to pool
  const addLiquidity = useCallback(async ({
    tokenA,
    tokenB,
    amountADesired,
    amountBDesired,
    slippageTolerance = 0.5
  }: AddLiquidityParams) => {
    if (!account?.addr) {
      throw new Error('No wallet connected');
    }

    setIsTransacting(true);
    setError(null);

    try {
      const routerContract = await getRouterContract();
      const deadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 minutes
      
      // Calculate minimum amounts with slippage
      const amountAMin = parseFloat(amountADesired) * (1 - slippageTolerance / 100);
      const amountBMin = parseFloat(amountBDesired) * (1 - slippageTolerance / 100);
      
      const amountADesiredWei = parseUnits(amountADesired, 18);
      const amountBDesiredWei = parseUnits(amountBDesired, 18);
      const amountAMinWei = parseUnits(amountAMin.toString(), 18);
      const amountBMinWei = parseUnits(amountBMin.toString(), 18);

      let tx;

      if (tokenA === 'QUAI' || tokenB === 'QUAI') {
        // Add liquidity with ETH
        const token = tokenA === 'QUAI' ? tokenB : tokenA;
        const tokenAmount = tokenA === 'QUAI' ? amountBDesired : amountADesired;
        const ethAmount = tokenA === 'QUAI' ? amountADesired : amountBDesired;
        const tokenMin = tokenA === 'QUAI' ? amountBMin : amountAMin;
        const ethMin = tokenA === 'QUAI' ? amountAMin : amountBMin;
        
        const tokenAddress = TOKEN_ADDRESSES[token as keyof typeof TOKEN_ADDRESSES];
        
        // Check and approve token if needed
        const allowance = await checkAllowance(tokenAddress, DEX_CONFIG.ROUTER_ADDRESS);
        if (parseFloat(allowance) < parseFloat(tokenAmount)) {
          await approveToken(tokenAddress, DEX_CONFIG.ROUTER_ADDRESS, tokenAmount);
        }
        
        tx = await routerContract.addLiquidityETH(
          tokenAddress,
          parseUnits(tokenAmount, 18),
          parseUnits(tokenMin.toString(), 18),
          parseUnits(ethMin.toString(), 18),
          account.addr,
          deadline,
          { value: parseUnits(ethAmount, 18) }
        );
      } else {
        // Add liquidity for two tokens
        const tokenAAddress = TOKEN_ADDRESSES[tokenA as keyof typeof TOKEN_ADDRESSES];
        const tokenBAddress = TOKEN_ADDRESSES[tokenB as keyof typeof TOKEN_ADDRESSES];
        
        // Check and approve both tokens if needed
        const allowanceA = await checkAllowance(tokenAAddress, DEX_CONFIG.ROUTER_ADDRESS);
        const allowanceB = await checkAllowance(tokenBAddress, DEX_CONFIG.ROUTER_ADDRESS);
        
        if (parseFloat(allowanceA) < parseFloat(amountADesired)) {
          await approveToken(tokenAAddress, DEX_CONFIG.ROUTER_ADDRESS, amountADesired);
        }
        if (parseFloat(allowanceB) < parseFloat(amountBDesired)) {
          await approveToken(tokenBAddress, DEX_CONFIG.ROUTER_ADDRESS, amountBDesired);
        }
        
        tx = await routerContract.addLiquidity(
          tokenAAddress,
          tokenBAddress,
          amountADesiredWei,
          amountBDesiredWei,
          amountAMinWei,
          amountBMinWei,
          account.addr,
          deadline
        );
      }
      
      await tx.wait();
      return tx;
    } catch (err: any) {
      setError(err.message || 'Add liquidity failed');
      throw err;
    } finally {
      setIsTransacting(false);
    }
  }, [account, getRouterContract, checkAllowance, approveToken]);

  return {
    // State
    isTransacting,
    error,
    
    // Read functions
    getAmountsOut,
    getSwapPath,
    checkAllowance,
    getTokenBalance,
    getOptimalAmounts,
    
    // Write functions
    swapTokens,
    addLiquidity,
    approveToken,
    
    // Utils
    setError
  };
}