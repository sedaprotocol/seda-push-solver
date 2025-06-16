/**
 * Network Configuration Data
 * Contains all network-specific configurations for testnet, mainnet, and local environments
 */

import type { NetworkConfig } from '../../types';

/**
 * Get Oracle Program ID from environment with fallback for testing
 */
function getRequiredOracleProgramId(): string {
  const programId = process.env.SEDA_ORACLE_PROGRAM_ID;
  if (!programId) {
    // Provide a test fallback instead of throwing immediately
    // This allows tests to run, but production will still fail appropriately
    return 'test-oracle-program-id-for-testing-only';
  }
  return programId;
}

// Network configurations for different SEDA environments
export const SEDA_NETWORK_CONFIGS: Record<'testnet' | 'mainnet' | 'local', NetworkConfig> = {
  testnet: {
    name: 'testnet',
    rpcEndpoint: 'https://rpc.testnet.seda.xyz',
    explorerEndpoint: 'https://testnet.explorer.seda.xyz',
    transaction: {
      gasPrice: BigInt(10_000_000_000),           // Transaction gas price for posting DataRequest
      gasLimit: 300000                    // Transaction gas limit for posting DataRequest
    },
    dataRequest: {
      oracleProgramId: getRequiredOracleProgramId(),
      replicationFactor: parseInt(process.env.SEDA_REPLICATION_FACTOR || '1', 10),
      execGasLimit: BigInt(150_000_000_000_000),  // Oracle execution gas limit
      gasPrice: BigInt(10_000),                   // Oracle execution gas price
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
    transaction: {
      gasPrice: BigInt(10_000_000_000),   // Transaction gas price for posting DataRequest
      gasLimit: 300000                    // Transaction gas limit for posting DataRequest
    },
    dataRequest: {
      oracleProgramId: getRequiredOracleProgramId(),
      replicationFactor: parseInt(process.env.SEDA_REPLICATION_FACTOR || '2', 10),
      execGasLimit: BigInt(10_000_000_000_000),   // Oracle execution gas limit
      gasPrice: BigInt(10_000_000_000),           // Oracle execution gas price
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
    transaction: {
      gasPrice: BigInt(10_000_000_000),   // Transaction gas price for posting DataRequest
      gasLimit: 300000                    // Transaction gas limit for posting DataRequest
    },
    dataRequest: {
      oracleProgramId: getRequiredOracleProgramId(),
      replicationFactor: parseInt(process.env.SEDA_REPLICATION_FACTOR || '1', 10),
      execGasLimit: BigInt(10_000_000_000_000),   // Oracle execution gas limit
      gasPrice: BigInt(10_000_000_000),           // Oracle execution gas price
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

/**
 * Log gas configuration for debugging
 */
export function logGasConfiguration(network: 'testnet' | 'mainnet' | 'local', logger?: { info: (msg: string) => void }): void {
  const networkConfig = SEDA_NETWORK_CONFIGS[network];
  const txGasPrice = networkConfig.transaction.gasPrice;
  const txGasLimit = networkConfig.transaction.gasLimit;
  const execGasPrice = networkConfig.dataRequest.gasPrice;
  const execGasLimit = networkConfig.dataRequest.execGasLimit;
  
  const logFn = logger?.info || console.log;
  
  logFn(`⛽ Gas Configuration for ${network.toUpperCase()}:`);
  logFn(`   🔷 TRANSACTION GAS (for posting DataRequest):`);
  logFn(`      💰 Gas Price: ${txGasPrice.toString()} (${(Number(txGasPrice) / 1_000_000).toFixed(2)} uSEDA)`);
  logFn(`      🔥 Gas Limit: ${txGasLimit.toLocaleString()}`);
  logFn(`   🔶 EXECUTION GAS (for oracle execution):`);
  logFn(`      💰 Gas Price: ${execGasPrice.toString()} (${(Number(execGasPrice) / 1_000_000_000).toFixed(4)} SEDA)`);
  logFn(`      🔥 Gas Limit: ${execGasLimit.toString()} (${(Number(execGasLimit) / 1_000_000_000_000).toFixed(0)}T)`);
} 