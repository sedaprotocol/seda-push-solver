/**
 * Core Application Types
 */

export type HexString = `0x${string}`;

export interface DataRequestResult {
  drId: string;
  drBlockHeight: bigint;
  exitCode: number;
  gasUsed: bigint;
  result: string;
  paybackAddress: string;
  sedaPayload: string;
  versionId: string;
}

export interface NetworkBatchStatus {
  networkName: string;
  batchExists: boolean;
  lastBatchHeight: bigint | null;
  posted?: boolean;
  txHash?: string;
  error?: string;
}

export interface BatchPostingResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface SchedulerConfig {
  intervalMs: number;
  continuous: boolean;
  maxRetries: number;
  memo?: string;
}

export interface SchedulerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  uptime: number;
  lastRequestTime?: Date;
  errors: Array<{ message: string; timestamp: Date }>;
} 