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
  version: string;
  blockTimestamp: bigint;
}



export interface SchedulerConfig {
  intervalMs: number;
  continuous: boolean;
  maxRetries: number;
  memo?: string;
  cosmosSequence: {
    postingTimeoutMs: number;
    drResultTimeout: number;
    maxQueueSize: number;
  };
}

export interface SchedulerStats {
  totalRequests: number;
  postedRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  uptime: number;
  startTime: number;
  lastRequestTime?: Date;
  activeTasks?: number;
  memoGenerator?: {
    uptimeMs: number;
  };
  sequenceCoordinator?: {
    queueSize: number;
    isProcessing: boolean;
    nextSequenceNumber: number;
  };
  errors: Array<{ message: string; timestamp: Date }>;
} 