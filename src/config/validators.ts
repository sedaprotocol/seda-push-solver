/**
 * Configuration Validators
 * Consolidated validation functions for all configuration types
 */

import type { NetworkConfig, EvmNetworkConfig } from '../types';

/**
 * Validate SEDA network configuration
 */
export function validateSedaNetworkConfig(config: NetworkConfig, networkName: string): void {
  if (!config.name) {
    throw new Error(`Network name is required for ${networkName}`);
  }

  if (!config.rpcEndpoint) {
    throw new Error(`RPC endpoint is required for ${networkName}`);
  }

  if (!config.dataRequest.oracleProgramId) {
    throw new Error(`Oracle Program ID is required for ${networkName}`);
  }

  if (config.dataRequest.replicationFactor < 1) {
    throw new Error(`Replication factor must be at least 1 for ${networkName}`);
  }

  if (config.dataRequest.timeoutSeconds < 1) {
    throw new Error(`Timeout must be at least 1 second for ${networkName}`);
  }

  if (config.dataRequest.pollingIntervalSeconds < 1) {
    throw new Error(`Polling interval must be at least 1 second for ${networkName}`);
  }
}

/**
 * Validate EVM network configuration
 */
export function validateEvmNetworkConfig(config: EvmNetworkConfig): void {
  if (!config.name) {
    throw new Error('EVM network name is required');
  }

  if (!config.rpcUrl) {
    throw new Error(`RPC URL is required for ${config.name}`);
  }

  if (!config.contractAddress) {
    throw new Error(`Contract address is required for ${config.name}`);
  }

  if (!config.chainId || config.chainId < 1) {
    throw new Error(`Valid chain ID is required for ${config.name}`);
  }

  if (config.gas.gasLimit < 21000) {
    throw new Error(`Gas limit must be at least 21000 for ${config.name}`);
  }
}

/**
 * Validate gas configuration
 */
export function validateGasConfig(gasPrice: bigint, gasLimit: number, networkName: string): void {
  if (gasPrice <= 0n) {
    throw new Error(`Gas price must be positive for ${networkName}`);
  }

  if (gasLimit <= 0) {
    throw new Error(`Gas limit must be positive for ${networkName}`);
  }
}

/**
 * Validate Oracle Program ID format
 */
export function validateOracleProgramId(programId: string): boolean {
  // Basic validation - Oracle Program ID should be a hex string
  return /^[a-fA-F0-9]+$/.test(programId) && programId.length > 0;
}

/**
 * Validate network connectivity (async)
 */
export async function validateNetworkConnectivity(rpcEndpoint: string): Promise<boolean> {
  try {
    const response = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'status',
        id: 1
      }),
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    
    return response.ok;
  } catch {
    return false;
  }
} 