/**
 * Scheduler Type Definitions
 */

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
  startTime: number;
  activeTasks?: number;
  memoGenerator?: {
    uptimeMs: number;
  };
  sequenceCoordinator?: {
    queueSize: number;
    isProcessing: boolean;
    nextSequenceNumber: number;
  };
} 