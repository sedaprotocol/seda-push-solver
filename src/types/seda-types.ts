/**
 * SEDA Network Type Definitions
 * Runtime types for SEDA network operations
 */

export type NetworkType = 'testnet' | 'mainnet' | 'local';

/**
 * Simple SEDA configuration for legacy compatibility
 * Used by services that need basic SEDA network access
 */
export interface SEDAConfig {
  rpcEndpoint: string;
  network: NetworkType;
  mnemonic?: string;
}

/**
 * SEDA DataRequest configuration for execution
 */
export interface SEDADataRequestConfig {
  oracleProgramId: string;
  replicationFactor: number;
  execGasLimit: bigint;
  gasPrice: bigint;
  consensusOptions: any;
  timeoutSeconds: number;
  pollingIntervalSeconds: number;
  memo: string;
  maxBatchRetries: number;
  batchPollingIntervalMs: number;
}

/**
 * Network-specific configuration for SEDA operations
 */
export interface NetworkConfig {
  name: string;
  rpcEndpoint: string;
  explorerEndpoint: string;
  dataRequest: SEDADataRequestConfig;
  transaction: {
    gasPrice: bigint;
    gasLimit: number;
  };
}

export interface DataRequestResult {
  drId: string;
  exitCode: number;
  result?: string | null;
  blockHeight?: number;
  gasUsed?: string;
}

export interface DataRequestOptions {
  memo?: string;
  customTimeout?: number;
} 