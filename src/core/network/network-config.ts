/**
 * Network Configuration Data
 * Contains all network-specific configurations for testnet, mainnet, and local environments
 */

import type { NetworkConfig } from '../../types';

// Network configurations for different SEDA environments
export const SEDA_NETWORK_CONFIGS: Record<'testnet' | 'mainnet' | 'local', NetworkConfig> = {
  testnet: {
    name: 'testnet',
    rpcEndpoint: 'https://rpc.testnet.seda.xyz',
    explorerEndpoint: 'https://testnet.explorer.seda.xyz',
    dataRequest: {
      oracleProgramId: 'd9814ceafe4084bd6d9b737be048778dfd81026531cbe4fb361df9c446687607',
      replicationFactor: 2,
      execGasLimit: BigInt(150_000_000_000_000),
      gasPrice: BigInt(10_000_000_000),
      consensusOptions: { method: 'none' },
      timeoutSeconds: 120,
      pollingIntervalSeconds: 5,
      memo: 'DX Feed Oracle DataRequest'
    }
  },
  
  mainnet: {
    name: 'mainnet',
    rpcEndpoint: 'https://rpc.seda.xyz',
    explorerEndpoint: 'https://explorer.seda.xyz',
    dataRequest: {
      oracleProgramId: 'd9814ceafe4084bd6d9b737be048778dfd81026531cbe4fb361df9c446687607',
      replicationFactor: 2,
      execGasLimit: BigInt(10_000_000_000_000),
      gasPrice: BigInt(10_000_000_000),
      consensusOptions: { method: 'none' },
      timeoutSeconds: 120,
      pollingIntervalSeconds: 5,
      memo: 'DX Feed Oracle DataRequest'
    }
  },
  
  local: {
    name: 'local',
    rpcEndpoint: 'http://localhost:26657',
    explorerEndpoint: 'http://localhost:3000',
    dataRequest: {
      oracleProgramId: 'd9814ceafe4084bd6d9b737be048778dfd81026531cbe4fb361df9c446687607',
      replicationFactor: 1,
      execGasLimit: BigInt(10_000_000_000_000),
      gasPrice: BigInt(10_000_000_000),
      consensusOptions: { method: 'none' },
      timeoutSeconds: 60,
      pollingIntervalSeconds: 3,
      memo: 'DX Feed Oracle DataRequest (Local)'
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
 * Get RPC endpoint for a specific network
 */
export function getRpcEndpoint(network: keyof typeof SEDA_NETWORK_CONFIGS): string {
  return getNetworkConfig(network).rpcEndpoint;
} 