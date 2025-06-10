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