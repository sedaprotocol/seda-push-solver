/**
 * SEDA Configuration Loader
 * Updated to use consolidated root configuration
 */

import type { SEDAConfig } from '../../types';

/**
 * Load SEDA configuration from environment variables
 * Now uses the consolidated root configuration with fallbacks for testing
 */
export function loadSEDAConfig(): SEDAConfig {
  // Try to load from consolidated config, but provide fallbacks for testing
  try {
    // Dynamic import to avoid module initialization issues during testing
    const { sedaConfig } = require('../../../config');
    
    // Map new consolidated config to existing SEDAConfig interface
    return {
      rpcEndpoint: sedaConfig.rpcEndpoint,
      network: sedaConfig.network,
      mnemonic: sedaConfig.mnemonic
    };
  } catch (error) {
    // Fallback for testing when environment variables are not set
    const network = (process.env.SEDA_NETWORK || 'testnet') as 'testnet' | 'mainnet' | 'local';
    const mnemonic = process.env.SEDA_MNEMONIC || 'test mnemonic for testing purposes only';
    
    // Get default RPC endpoint for the network
    const defaultEndpoints = {
      testnet: 'https://rpc.testnet.seda.xyz',
      mainnet: 'https://rpc.mainnet.seda.xyz',
      local: 'http://localhost:26657'
    };
    
    return {
      rpcEndpoint: process.env.SEDA_RPC_ENDPOINT || defaultEndpoints[network],
      network,
      mnemonic
    };
  }
} 