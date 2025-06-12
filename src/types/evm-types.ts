/**
 * EVM Types
 * Type definitions for EVM chain integration and batch pushing functionality
 */

// EVM Chain Configuration Types
export interface EVMChainConfig {
  /** Chain identifier (e.g., "arbitrum", "optimism") */
  chainId: number;
  
  /** Human-readable chain name */
  name: string;
  
  /** RPC endpoint for chain interactions */
  rpcEndpoint: string;
  
  /** Alternative RPC endpoints for failover */
  fallbackRpcEndpoints?: string[];
  
  /** Block explorer base URL */
  explorerUrl: string;
  
  /** Contract addresses for SEDA integration */
  contracts: {
    /** SEDA Core contract address */
    sedaCore: string;
    
    /** SEDA Prover contract address */
    sedaProver: string;
  };
  
  /** Gas configuration for transactions */
  gas: {
    /** Maximum gas price in gwei */
    maxGasPrice: bigint;
    
    /** Gas limit for batch push transactions */
    batchPushGasLimit: number;
    
    /** Gas price adjustment factor (default: 1.1) */
    gasPriceMultiplier?: number;
    
    /** Whether to use EIP-1559 gas pricing */
    useEIP1559?: boolean;
  };
  
  /** Transaction confirmation requirements */
  confirmations: {
    /** Required confirmations for success */
    required: number;
    
    /** Maximum time to wait for confirmations (ms) */
    timeoutMs: number;
    
    /** Block time estimate for timeout calculations */
    blockTimeMs: number;
  };
  
  /** Retry configuration for this chain */
  retry: {
    /** Maximum retry attempts */
    maxAttempts: number;
    
    /** Initial retry delay in ms */
    initialDelayMs: number;
    
    /** Backoff multiplier for retry delays */
    backoffMultiplier: number;
    
    /** Maximum retry delay in ms */
    maxDelayMs: number;
  };
}

// Batch Tracking Types
export interface BatchTrackingInfo {
  /** SEDA batch number */
  batchNumber: bigint;
  
  /** SEDA batch ID (hex string) */
  batchId: string;
  
  /** Block height when batch was created on SEDA */
  blockHeight: bigint;
  
  /** Data result root of the batch */
  dataResultRoot: string;
  
  /** Current data result root */
  currentDataResultRoot: string;
  
  /** Validator root */
  validatorRoot: string;
  
  /** Batch signatures from validators */
  signatures: BatchSignature[];
  
  /** DataRequest IDs included in this batch */
  dataRequestIds: string[];
  
  /** Total number of DataRequests in batch */
  totalDataRequests: number;
  
  /** Whether batch is signed */
  isSigned: boolean;
  
  /** Chain information */
  chainInfo: {
    network: string;
    blockHeight: bigint;
    timestamp: number;
  };
  
  /** Legacy support - TODO: Remove after migration */
  merkleRoot?: string;
  sedaBlockHeight?: bigint;
  
  /** Push status per chain */
  chainStatus?: Map<number, ChainBatchStatus>;
  
  /** When this batch was discovered */
  discoveredAt?: number;
}

export interface ChainBatchStatus {
  /** Chain ID */
  chainId: number;
  
  /** Push status */
  status: 'pending' | 'pushing' | 'pushed' | 'failed';
  
  /** Transaction hash if pushed */
  txHash?: string;
  
  /** Block number where transaction was included */
  blockNumber?: bigint;
  
  /** Number of confirmations received */
  confirmations?: number;
  
  /** Last error if failed */
  lastError?: string;
  
  /** Retry attempt count */
  retryCount: number;
  
  /** Last push attempt timestamp */
  lastAttemptAt?: number;
  
  /** Next retry timestamp */
  nextRetryAt?: number;
}

export interface BatchSignature {
  /** Validator address */
  validatorAddress: string;
  
  /** Signature bytes */
  signature: Buffer;
  
  /** Validator's Ethereum address */
  ethAddress: string;
  
  /** Voting power percentage */
  votingPowerPercentage: number;
  
  /** Merkle proof for validator */
  proof: Buffer[];
}

// Transaction Management Types
export interface EVMTransaction {
  /** Chain ID where transaction will be sent */
  chainId: number;
  
  /** Transaction hash (available after sending) */
  hash?: string;
  
  /** Block number (available after confirmation) */
  blockNumber?: bigint;
  
  /** Gas used for the transaction */
  gasUsed?: bigint;
  
  /** Gas price used */
  gasPrice?: bigint;
  
  /** Transaction status */
  status: 'pending' | 'confirmed' | 'failed';
  
  /** Number of confirmations */
  confirmations: number;
  
  /** Error message if failed */
  error?: string;
  
  /** When transaction was created */
  createdAt: number;
  
  /** When transaction was sent */
  sentAt?: number;
  
  /** When transaction was confirmed */
  confirmedAt?: number;
}

export interface BatchPushTransaction extends EVMTransaction {
  /** SEDA batch being pushed */
  batchNumber: bigint;
  
  /** Batch data for the push */
  batchData: {
    batchId: string;
    merkleRoot: string;
    signatures: BatchSignature[];
  };
}

// Service Interface Types
export interface BatchPushResult {
  /** Chain ID */
  chainId: number;
  
  /** Success status */
  success: boolean;
  
  /** Transaction hash if successful */
  txHash?: string;
  
  /** Block number if confirmed */
  blockNumber?: bigint;
  
  /** Error message if failed */
  error?: string;
  
  /** Gas used */
  gasUsed?: bigint;
  
  /** Processing duration in ms */
  durationMs: number;
}

export interface MultiChainPushResult {
  /** SEDA batch number */
  batchNumber: bigint;
  
  /** Results per chain */
  chainResults: BatchPushResult[];
  
  /** Overall success (all chains succeeded) */
  success: boolean;
  
  /** Number of successful pushes */
  successCount: number;
  
  /** Number of failed pushes */
  failureCount: number;
  
  /** Total processing time */
  totalDurationMs: number;
}

// Configuration Management Types
export interface EVMPusherConfig {
  /** Enabled chains for batch pushing */
  enabledChains: number[];
  
  /** Chain configurations */
  chains: Record<number, EVMChainConfig>;
  
  /** Global batch polling configuration */
  batchPolling: {
    /** Interval to check for new batches (ms) */
    intervalMs: number;
    
    /** How many batches to check per poll */
    batchWindow: number;
    
    /** Maximum age of batches to consider (ms) */
    maxBatchAgeMs: number;
  };
  
  /** Parallel execution limits */
  concurrency: {
    /** Maximum chains to push to simultaneously */
    maxParallelChains: number;
    
    /** Maximum concurrent transactions per chain */
    maxTransactionsPerChain: number;
  };
  
  /** Monitoring and alerting */
  monitoring: {
    /** Enable detailed metrics collection */
    enableMetrics: boolean;
    
    /** Health check intervals */
    healthCheckIntervalMs: number;
    
    /** Alert thresholds */
    alerts: {
      /** Alert if push success rate drops below this % */
      minSuccessRatePercent: number;
      
      /** Alert if average push time exceeds this (ms) */
      maxAveragePushTimeMs: number;
      
      /** Alert if any chain fails this many times in a row */
      maxConsecutiveFailures: number;
    };
  };
}

// Statistics and Monitoring Types
export interface ChainStatistics {
  /** Chain identifier */
  chainId: number;
  
  /** Chain name */
  chainName: string;
  
  /** Push attempt counters */
  pushes: {
    total: number;
    successful: number;
    failed: number;
    pending: number;
  };
  
  /** Performance metrics */
  performance: {
    /** Average push time in ms */
    averagePushTimeMs: number;
    
    /** Median push time in ms */
    medianPushTimeMs: number;
    
    /** Maximum push time in ms */
    maxPushTimeMs: number;
    
    /** Average gas used */
    averageGasUsed: bigint;
    
    /** Average gas price */
    averageGasPrice: bigint;
  };
  
  /** Health status */
  health: {
    /** Current health status */
    status: 'healthy' | 'degraded' | 'unhealthy';
    
    /** Last successful push timestamp */
    lastSuccessAt?: number;
    
    /** Consecutive failure count */
    consecutiveFailures: number;
    
    /** Current error message if unhealthy */
    currentError?: string;
  };
  
  /** Recent push history (last 100) */
  recentPushes: {
    timestamp: number;
    success: boolean;
    durationMs: number;
    gasUsed?: bigint;
    error?: string;
  }[];
}

export interface EVMPusherStatistics {
  /** Overall statistics */
  overall: {
    /** Total batches processed */
    totalBatches: number;
    
    /** Successfully pushed batches */
    successfulBatches: number;
    
    /** Failed batches */
    failedBatches: number;
    
    /** Currently processing batches */
    pendingBatches: number;
    
    /** Service uptime in ms */
    uptimeMs: number;
    
    /** Service start time */
    startTime: number;
  };
  
  /** Per-chain statistics */
  chains: Map<number, ChainStatistics>;
  
  /** Processing queue statistics */
  queue: {
    /** Batches waiting to be processed */
    pending: number;
    
    /** Batches currently being processed */
    processing: number;
    
    /** Average queue wait time */
    averageWaitTimeMs: number;
    
    /** Maximum queue size seen */
    maxQueueSize: number;
  };
  
  /** Error summary */
  errors: {
    /** Total error count */
    total: number;
    
    /** Errors in last hour */
    lastHour: number;
    
    /** Most common error types */
    commonErrors: Map<string, number>;
  };
}

// Event Types for Service Communication
export interface EVMPusherEvents {
  /** New batch discovered and queued for pushing */
  'batch-discovered': [BatchTrackingInfo];
  
  /** Batch push started for a chain */
  'batch-push-started': [bigint, number]; // batchNumber, chainId
  
  /** Batch push completed successfully */
  'batch-push-success': [BatchPushResult];
  
  /** Batch push failed */
  'batch-push-failed': [BatchPushResult];
  
  /** All chains completed for a batch */
  'batch-completed': [MultiChainPushResult];
  
  /** Chain health status changed */
  'chain-health-changed': [number, 'healthy' | 'degraded' | 'unhealthy'];
  
  /** Service error occurred */
  'service-error': [Error];
} 