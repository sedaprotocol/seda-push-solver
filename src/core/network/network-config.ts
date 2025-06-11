/**
 * Network Configuration Data
 * Contains all network-specific configurations for testnet, mainnet, and local environments
 */

import type { NetworkConfig } from '../../types';

/**
 * Get Oracle Program ID from environment or throw error
 */
function getRequiredOracleProgramId(): string {
  const programId = process.env.SEDA_ORACLE_PROGRAM_ID;
  if (!programId) {
    throw new Error('SEDA_ORACLE_PROGRAM_ID environment variable is required');
  }
  return programId;
}

// Network configurations for different SEDA environments
export const SEDA_NETWORK_CONFIGS: Record<'testnet' | 'mainnet' | 'local', NetworkConfig> = {
  testnet: {
    name: 'testnet',
    rpcEndpoint: 'https://rpc.testnet.seda.xyz',
    explorerEndpoint: 'https://testnet.explorer.seda.xyz',
    dataRequest: {
      oracleProgramId: getRequiredOracleProgramId(),
      replicationFactor: parseInt(process.env.SEDA_REPLICATION_FACTOR || '1', 10),
      execGasLimit: BigInt(150_000_000_000_000),
      gasPrice: BigInt(10_000),
      consensusOptions: { method: 'none' },
      timeoutSeconds: parseInt(process.env.SEDA_DR_TIMEOUT_SECONDS || '120', 10),
      pollingIntervalSeconds: parseInt(process.env.SEDA_DR_POLLING_INTERVAL_SECONDS || '1', 10),
      memo: 'DX Feed Oracle DataRequest'
    }
  },
  
  mainnet: {
    name: 'mainnet',
    rpcEndpoint: 'https://rpc.seda.xyz',
    explorerEndpoint: 'https://explorer.seda.xyz',
    dataRequest: {
      oracleProgramId: getRequiredOracleProgramId(),
      replicationFactor: parseInt(process.env.SEDA_REPLICATION_FACTOR || '2', 10),
      execGasLimit: BigInt(10_000_000_000_000),
      gasPrice: BigInt(10_000_000_000),
      consensusOptions: { method: 'none' },
      timeoutSeconds: parseInt(process.env.SEDA_DR_TIMEOUT_SECONDS || '120', 10),
      pollingIntervalSeconds: parseInt(process.env.SEDA_DR_POLLING_INTERVAL_SECONDS || '5', 10),
      memo: 'DX Feed Oracle DataRequest'
    }
  },
  
  local: {
    name: 'local',
    rpcEndpoint: 'http://localhost:26657',
    explorerEndpoint: 'http://localhost:3000',
    dataRequest: {
      oracleProgramId: getRequiredOracleProgramId(),
      replicationFactor: parseInt(process.env.SEDA_REPLICATION_FACTOR || '1', 10),
      execGasLimit: BigInt(10_000_000_000_000),
      gasPrice: BigInt(10_000_000_000),
      consensusOptions: { method: 'none' },
      timeoutSeconds: parseInt(process.env.SEDA_DR_TIMEOUT_SECONDS || '60', 10),
      pollingIntervalSeconds: parseInt(process.env.SEDA_DR_POLLING_INTERVAL_SECONDS || '3', 10),
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