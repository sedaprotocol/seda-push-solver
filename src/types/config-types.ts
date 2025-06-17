/**
 * Configuration Type Definitions
 * Centralized types for application configuration
 */

/**
 * SEDA Network Configuration Interface
 */
export interface SedaConfig {
  /** SEDA network to connect to */
  network: 'testnet' | 'mainnet' | 'local';
  /** RPC endpoint for SEDA network */
  rpcEndpoint: string;
  /** 24-word mnemonic phrase for signing transactions */
  mnemonic: string;
  /** Oracle program ID for DataRequest execution */
  oracleProgramId: string;
  /** DataRequest execution timeout in seconds */
  drTimeoutSeconds: number;
  /** Polling interval for DataRequest results in seconds */
  drPollingIntervalSeconds: number;
  /** Scheduler configuration */
  scheduler: {
    /** Interval between DataRequest posts in milliseconds */
    intervalMs: number;
    /** Whether to run continuously */
    continuous: boolean;
    /** Maximum retry attempts */
    maxRetries: number;
    /** Custom memo for transactions */
    memo: string;
  };
  /** Cosmos sequence coordination settings */
  cosmos: {
    /** Timeout for transaction posting in milliseconds */
    postingTimeoutMs: number;
    /** Maximum queue size for sequence coordination */
    maxQueueSize: number;
  };
  /** Logging configuration */
  logging: {
    /** Log level */
    level: 'debug' | 'info' | 'warn' | 'error';
  };
}

/**
 * Configuration summary interface for display/debugging
 */
export interface ConfigSummary {
  seda: {
    network: string;
    rpcEndpoint: string;
    schedulerIntervalMs: number;
    continuousMode: boolean;
    maxRetries: number;
  };
  evm: {
    privateKeyConfigured: boolean;
    networksFound: number;
    networksEnabled: number;
    enabledNetworks: Array<{
      name: string;
      displayName: string;
      chainId: number;
      gasType: string;
    }>;
  };
} 