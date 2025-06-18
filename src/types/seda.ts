/**
 * SEDA Network Types
 */

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

export interface SignedBatch {
  batchNumber: number;
  blockHeight: number;
  batchId: Buffer | string;
  dataResultRoot: Buffer | string;
  validatorRoot: Buffer | string;
  dataResultEntries?: any[];
  batchSignatures?: any[];
  validatorEntries?: any[];
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