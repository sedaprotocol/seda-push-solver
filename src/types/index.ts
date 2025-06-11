/**
 * Core Type Definitions for SEDA DataRequest System
 * Centralized location for all interfaces and types used throughout the application
 */

// Network type definition
export type NetworkType = 'testnet' | 'mainnet' | 'local';

// SEDA Configuration Types
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
}

// DataRequest Operation Types
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

// Scheduler Configuration Types
export interface SchedulerConfig {
  // Interval between DataRequests (in milliseconds)
  intervalMs: number;
  
  // Whether to run continuously or stop after one request
  continuous: boolean;
  
  // Maximum number of retries for failed requests
  maxRetries: number;
  
  // Custom memo for DataRequests
  memo?: string;
  
  // Cosmos sequence coordinator timeouts
  cosmosSequence: {
    // Timeout for posting DataRequest transaction (posting phase)
    postingTimeoutMs: number;
    
    // Default timeout for sequence coordinator operations
    defaultTimeoutMs: number;
    
    // Maximum queue size for sequence coordination
    maxQueueSize: number;
  };
}

// Scheduler Statistics Types
export interface SchedulerStats {
  totalRequests: number; // Total oracle executions completed (success + failed)
  postedRequests: number; // Total DataRequests successfully posted to blockchain
  successfulRequests: number; // Oracle executions that completed successfully
  failedRequests: number; // Oracle executions that failed or timed out
  startTime: number;
  activeTasks?: number; // Optional for backward compatibility - tracks currently running async tasks
  memoGenerator?: {
    uptimeMs: number;
  };
  sequenceCoordinator?: {
    queueSize: number;
    isProcessing: boolean;
    nextSequenceNumber: number;
  };
} 