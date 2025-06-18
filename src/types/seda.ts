/**
 * SEDA Network Types
 */

export type NetworkType = 'testnet' | 'mainnet' | 'local';

// Legacy alias for compatibility
export interface SEDAConfig {
  rpcEndpoint: string;
  network: NetworkType;
  mnemonic?: string;
}

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

export interface DataRequestOptions {
  memo?: string;
  customTimeout?: number;
}

export interface SedaConfig {
  network: 'testnet' | 'mainnet' | 'local';
  rpcEndpoint: string;
  mnemonic: string;
  oracleProgramId: string;
  drTimeoutSeconds: number;
  drPollingIntervalSeconds: number;
  scheduler: {
    intervalMs: number;
    continuous: boolean;
    maxRetries: number;
    memo: string;
  };
  cosmos: {
    postingTimeoutMs: number;
    maxQueueSize: number;
  };
  logging: {
    level: 'info' | 'warn' | 'error' | 'debug';
  };
}



export interface NetworkConfig {
  name: string;
  rpcEndpoint: string;
  explorerEndpoint?: string;
  transaction: {
    gasPrice: bigint;
    gasLimit: number;
  };
  dataRequest: {
    oracleProgramId: string;
    replicationFactor: number;
    execGasLimit: bigint;
    gasPrice: bigint;
    consensusOptions: { method: string };
    timeoutSeconds: number;
    pollingIntervalSeconds: number;
    memo: string;
    maxBatchRetries: number;
    batchPollingIntervalMs: number;
  };
} 