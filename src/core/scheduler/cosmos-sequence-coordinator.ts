/**
 * Cosmos Sequence Number Coordinator for SEDA DataRequest Scheduler
 * Manages sequential access to SEDA Signer to prevent account sequence mismatch errors
 * in concurrent async tasks by ensuring only one transaction is submitted at a time
 */

import type { ILoggingService } from '../../services';

/**
 * Interface for transaction execution with sequence coordination
 */
export interface SequencedExecution<T> {
  execute: (sequenceNumber: number) => Promise<T>;
  taskId: string;
  timeout?: number;
}

/**
 * Interface for tracking execution results
 */
export interface ExecutionResult<T> {
  taskId: string;
  success: boolean;
  result?: T;
  error?: Error;
  sequence: number;
  startTime: number;
  endTime: number;
  duration: number;
}

/**
 * Cosmos Sequence Coordinator
 * Provides sequential access to SEDA Signer for concurrent async tasks
 * to prevent Cosmos SDK account sequence mismatch errors
 */
export class CosmosSequenceCoordinator {
  private executionQueue: Array<{
    execution: SequencedExecution<any>;
    resolve: (result: ExecutionResult<any>) => void;
    reject: (error: Error) => void;
  }> = [];
  private isProcessing = false;
  private sequenceNumber = 1;
  private readonly DEFAULT_TIMEOUT = 60000; // 1 minute

  constructor(
    private logger: ILoggingService,
    private maxQueueSize = 100
  ) {}

  /**
   * Execute a transaction with sequence coordination
   * Ensures transactions are executed one at a time to prevent sequence conflicts
   */
  async executeSequenced<T>(execution: SequencedExecution<T>): Promise<ExecutionResult<T>> {
    if (this.executionQueue.length >= this.maxQueueSize) {
      throw new Error(`Sequence execution queue is full (max: ${this.maxQueueSize})`);
    }

    return new Promise((resolve, reject) => {
      this.executionQueue.push({
        execution,
        resolve,
        reject
      });

      this.logger.info(`🔢 Queued transaction for task ${execution.taskId} (queue size: ${this.executionQueue.length})`);

      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the execution queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.logger.info('🚀 Starting sequence coordinator processing');

    while (this.executionQueue.length > 0) {
      const queueItem = this.executionQueue.shift();
      if (!queueItem) {
        break;
      }

      const { execution, resolve, reject } = queueItem;
      const sequence = this.sequenceNumber++;
      const startTime = Date.now();

      this.logger.info(`🔢 Executing sequenced transaction #${sequence} for task ${execution.taskId}`);

      try {
        // Set up timeout
        const timeout = execution.timeout || this.DEFAULT_TIMEOUT;
        const timeoutPromise = new Promise<never>((_, rejectTimeout) => {
          setTimeout(() => {
            rejectTimeout(new Error(`Transaction timeout after ${timeout}ms`));
          }, timeout);
        });

        // Race between execution and timeout
        const result = await Promise.race([
          execution.execute(sequence),
          timeoutPromise
        ]);

        const endTime = Date.now();
        const duration = endTime - startTime;

        const executionResult: ExecutionResult<any> = {
          taskId: execution.taskId,
          success: true,
          result,
          sequence,
          startTime,
          endTime,
          duration
        };

        this.logger.info(`✅ Sequenced transaction #${sequence} completed for task ${execution.taskId} (${duration}ms)`);
        resolve(executionResult);

      } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;

        const executionResult: ExecutionResult<any> = {
          taskId: execution.taskId,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          sequence,
          startTime,
          endTime,
          duration
        };

        this.logger.error(`❌ Sequenced transaction #${sequence} failed for task ${execution.taskId} (${duration}ms):`, error);

        // Check if it's a sequence-related error
        if (error instanceof Error && this.isSequenceError(error.message)) {
          this.logger.warn(`⚠️ Sequence error detected in task ${execution.taskId}: ${error.message}`);
          // For sequence errors, we don't retry automatically - let the caller handle it
        }

        resolve(executionResult); // Resolve with error result instead of rejecting
      }

      // Small delay between transactions to ensure proper sequencing
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessing = false;
    this.logger.info('✅ Sequence coordinator processing completed');
  }

  /**
   * Check if an error is related to sequence number conflicts
   */
  private isSequenceError(errorMessage: string): boolean {
    const sequenceErrorPatterns = [
      'account sequence mismatch',
      'incorrect account sequence',
      'sequence number',
      'nonce too low',
      'sequence too low'
    ];

    return sequenceErrorPatterns.some(pattern => 
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Get current queue statistics
   */
  getStats() {
    return {
      queueSize: this.executionQueue.length,
      isProcessing: this.isProcessing,
      nextSequenceNumber: this.sequenceNumber,
      maxQueueSize: this.maxQueueSize
    };
  }

  /**
   * Clear the execution queue (for cleanup)
   */
  clear(): void {
    // Reject all pending executions
    while (this.executionQueue.length > 0) {
      const queueItem = this.executionQueue.shift();
      if (queueItem) {
        queueItem.reject(new Error('Sequence coordinator cleared'));
      }
    }

    this.isProcessing = false;
    this.sequenceNumber = 1;
    this.logger.info('🔄 Cosmos sequence coordinator cleared');
  }

  /**
   * Wait for the queue to be empty
   */
  async waitForQueue(): Promise<void> {
    while (this.executionQueue.length > 0 || this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
} 