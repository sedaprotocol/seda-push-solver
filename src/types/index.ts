/**
 * Core Type Definitions
 * Shared TypeScript interfaces and types for the SEDA DataRequest Pusher
 */

// Network type definition
export type NetworkType = 'testnet' | 'mainnet' | 'local';

// Main SEDA configuration interface
export interface SEDAConfig {
  rpcEndpoint: string;
  network: NetworkType;
  mnemonic?: string;
}

// DataRequest result interface
export interface DataRequestResult {
  drId: string;
  exitCode: number;
  result?: any;
  blockHeight?: number;
  gasUsed?: string;
}

// DataRequest posting options
export interface DataRequestOptions {
  memo?: string;
  customTimeout?: number;
}

// DataRequest Configuration Interface
export interface SEDADataRequestConfig {
  // Oracle Program Configuration
  oracleProgramId: string;
  
  // Execution Configuration
  replicationFactor: number;
  gasPrice: bigint;
  execGasLimit: number;
  
  // Consensus Configuration
  consensusOptions: {
    method: 'none';
  };
  
  // Timing Configuration (in seconds)
  timeoutSeconds: number;
  pollingIntervalSeconds: number;
  
  // Optional metadata
  memo?: string;
}

// Network Configuration Interface (includes both RPC and DataRequest settings)
export interface NetworkConfig {
  // Network connection settings
  rpcEndpoint: string;
  // Explorer endpoint
  explorerEndpoint: string;
  network: NetworkType;
  
  // DataRequest settings
  dataRequest: SEDADataRequestConfig;
} 