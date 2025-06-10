/**
 * SEDA Network and DataRequest Configuration
 * Centralized configuration for all network settings
 */

import type { SEDADataRequestConfig, NetworkConfig, NetworkType } from './types';

// Centralized Network Configurations
export const SEDA_NETWORK_CONFIGS: Record<string, NetworkConfig> = {
  testnet: {
    rpcEndpoint: 'https://rpc.testnet.seda.xyz',
    explorerEndpoint: 'https://testnet.explorer.seda.xyz',
    network: 'testnet',
    dataRequest: {
      oracleProgramId: 'd9814ceafe4084bd6d9b737be048778dfd81026531cbe4fb361df9c446687607',
      replicationFactor: 1,
      execGasLimit: 150_000_000_000_000,
      gasPrice: 10000n,
      consensusOptions: {
        method: 'none'
      },
      timeoutSeconds: 60,
      pollingIntervalSeconds: 1,
      memo: 'Data request via SEDA'
    }
  },
  
  mainnet: {
    rpcEndpoint: 'https://rpc.seda.xyz',
    explorerEndpoint: 'https://explorer.seda.xyz',
    network: 'mainnet',
    dataRequest: {
      oracleProgramId: '', // Set this when you have a mainnet oracle program
      replicationFactor: 1,
      execGasLimit: 10_000_000_000_000,
      gasPrice: 1000n,
      consensusOptions: {
        method: 'none'
      },
      timeoutSeconds: 60,
      pollingIntervalSeconds: 5,
      memo: 'Data request via SEDA'
    }
  },
  
  local: {
    rpcEndpoint: 'http://localhost:26657',
    explorerEndpoint: 'http://localhost:8000',
    network: 'local',
    dataRequest: {
      oracleProgramId: 'local-test-program-id',
      replicationFactor: 1,
      execGasLimit: 10_000_000_000_000,
      gasPrice: 1000n,
      consensusOptions: {
        method: 'none'
      },
      timeoutSeconds: 30,
      pollingIntervalSeconds: 2,
      memo: 'Local test request'
    }
  }
};

/**
 * Get complete network configuration for a specific network
 */
export function getNetworkConfig(network: keyof typeof SEDA_NETWORK_CONFIGS): NetworkConfig {
  const config = SEDA_NETWORK_CONFIGS[network];
  if (!config) {
    throw new Error(`Unknown network: ${network}`);
  }
  
  if (!config.dataRequest.oracleProgramId) {
    throw new Error(`Oracle Program ID not configured for network: ${network}`);
  }
  
  return config;
}

/**
 * Get DataRequest configuration for a specific network
 */
export function getDataRequestConfig(network: keyof typeof SEDA_NETWORK_CONFIGS): SEDADataRequestConfig {
  return getNetworkConfig(network).dataRequest;
}

/**
 * Get RPC endpoint for a specific network
 */
export function getRpcEndpoint(network: keyof typeof SEDA_NETWORK_CONFIGS): string {
  return getNetworkConfig(network).rpcEndpoint;
}

/**
 * Create a DataRequest configuration with custom overrides
 */
export function createDataRequestConfig(
  network: keyof typeof SEDA_NETWORK_CONFIGS,
  overrides: Partial<SEDADataRequestConfig> = {}
): SEDADataRequestConfig {
  const baseConfig = getDataRequestConfig(network);
  
  return {
    ...baseConfig,
    ...overrides
  };
}

/**
 * Validate DataRequest configuration
 */
export function validateDataRequestConfig(config: SEDADataRequestConfig): void {
  if (!config.oracleProgramId) {
    throw new Error('Oracle Program ID is required');
  }
  
  if (config.replicationFactor < 1) {
    throw new Error('Replication factor must be at least 1');
  }
  
  if (config.execGasLimit < 1_000_000) {
    throw new Error('Execution gas limit is too low');
  }
  
  if (config.timeoutSeconds < 10) {
    throw new Error('Timeout must be at least 10 seconds');
  }
  
  console.log('✅ DataRequest configuration is valid');
}

// Legacy exports for backward compatibility
export const SEDA_DR_CONFIGS = Object.fromEntries(
  Object.entries(SEDA_NETWORK_CONFIGS).map(([key, value]) => [key, value.dataRequest])
);

export const SEDA_NETWORKS = Object.fromEntries(
  Object.entries(SEDA_NETWORK_CONFIGS).map(([key, value]) => [key, {
    rpcEndpoint: value.rpcEndpoint,
    network: value.network
  }])
); 