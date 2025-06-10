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
}

// Scheduler Statistics Types
export interface SchedulerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  startTime: number;
} 