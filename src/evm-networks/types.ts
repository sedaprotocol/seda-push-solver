/**
 * EVM Networks Type Definitions
 */

import type { EvmNetworkConfig } from '../../config';

/**
 * Result of posting to an EVM network
 */
export interface EvmPostingResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Transaction hash if successful */
  txHash?: string;
  /** Block number where transaction was mined */
  blockNumber?: number;
  /** Gas used for the transaction */
  gasUsed?: string;
  /** Error message if failed */
  error?: string;
  /** Network that was posted to */
  network: string;
  /** Retry attempt number (1-based) */
  attempt: number;
  /** Total time taken in milliseconds */
  duration: number;
}

/**
 * EVM operation retry options
 */
export interface EvmRetryOptions {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay between retries in milliseconds */
  baseDelayMs: number;
  /** Whether to use exponential backoff */
  exponentialBackoff: boolean;
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: number;
}

/**
 * Generic EVM operation result
 */
export interface EvmOperationResult<T = any> {
  /** Whether the operation was successful */
  success: boolean;
  /** Result data if successful */
  data?: T;
  /** Error if failed */
  error?: Error;
  /** Attempt number */
  attempt: number;
}

/**
 * SEDA DataRequest result data for EVM posting
 */
export interface SedaResultData {
  /** DataRequest ID */
  drId: string;
  /** Result value from oracle execution */
  result: any;
  /** Block height where the result was finalized */
  blockHeight: bigint;
  /** Transaction hash of the original DataRequest */
  txHash: string;
  /** Timestamp when result was obtained */
  timestamp: number;
} 