/**
 * EVM Provider Management
 * Handles connection and wallet management for EVM networks
 */

import { JsonRpcProvider, Wallet } from 'ethers';
import type { EvmNetworkConfig } from '../../config';
import { evmPrivateKey } from '../../config';

/**
 * Create an EVM provider for the given network
 */
export function createEvmProvider(network: EvmNetworkConfig): JsonRpcProvider {
  const provider = new JsonRpcProvider(network.rpcUrl);
  return provider;
}

/**
 * Get an EVM wallet for the given network
 */
export function getEvmWallet(network: EvmNetworkConfig): Wallet {
  if (!evmPrivateKey) {
    throw new Error('EVM_PRIVATE_KEY environment variable is required');
  }
  
  const provider = createEvmProvider(network);
  const wallet = new Wallet(evmPrivateKey, provider);
  
  return wallet;
}

/**
 * Validate connection to an EVM network
 */
export async function validateEvmConnection(network: EvmNetworkConfig): Promise<boolean> {
  try {
    const provider = createEvmProvider(network);
    
    // Test the connection by getting the latest block number
    const blockNumber = await provider.getBlockNumber();
    
    // Verify chain ID matches
    const chainId = await provider.getNetwork().then(n => n.chainId);
    
    if (Number(chainId) !== network.chainId) {
      throw new Error(`Chain ID mismatch: expected ${network.chainId}, got ${chainId}`);
    }
    
    return blockNumber > 0;
  } catch (error) {
    console.error(`Failed to connect to ${network.displayName}:`, error);
    return false;
  }
} 