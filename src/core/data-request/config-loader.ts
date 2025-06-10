/**
 * SEDA Configuration Loader
 * Handles loading configuration from environment variables
 */

import type { SEDAConfig } from '../../types';
import { getNetworkConfig } from '../network';

/**
 * Load SEDA configuration from environment variables
 */
export function loadSEDAConfig(): SEDAConfig {
  const network = (process.env.SEDA_NETWORK || 'testnet') as 'testnet' | 'mainnet' | 'local';
  const mnemonic = process.env.SEDA_MNEMONIC;
  
  if (!mnemonic) {
    throw new Error('SEDA_MNEMONIC environment variable is required');
  }

  // Get network configuration
  const networkConfig = getNetworkConfig(network);

  return {
    rpcEndpoint: process.env.SEDA_RPC_ENDPOINT || networkConfig.rpcEndpoint,
    network,
    mnemonic
  };
} 