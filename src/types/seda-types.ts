/**
 * SEDA Network Type Definitions
 */

export type NetworkType = 'testnet' | 'mainnet' | 'local';

export interface SEDAConfig {
  rpcEndpoint: string;
  network: NetworkType;
  mnemonic?: string;
}

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