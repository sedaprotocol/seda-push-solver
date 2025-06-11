/**
 * Cosmos Sequence Number Coordinator for SEDA DataRequest Scheduler
 * Manages sequential access to SEDA Signer to prevent account sequence mismatch errors
 * in concurrent async tasks by ensuring only one transaction is submitted at a time
 */

import type { ILoggingService } from '../../services';
import type { Signer } from '@seda-protocol/dev-tools';
import { getNetworkConfig } from '../network';
import { SequenceQueryService } from './sequence-query-service';
import { withTimeout, delay, isSequenceError, isDataRequestExistsError } from '../../helpers';

/**
 * Interface for transaction posting with sequence coordination
 * Only coordinates the posting phase, not the full task lifecycle
 */
export interface SequencedPosting<T> {
  postTransaction: (sequenceNumber: number) => Promise<T>; // Just post the transaction
  taskId: string;
  timeout?: number;
}

/**
 * Interface for posting results
 */
export interface PostingResult<T> {
  taskId: string;
  success: boolean;
  result?: T; // The posted transaction result (drId, blockHeight, etc.)
  error?: Error;
  sequence: number;
  startTime: number;
  endTime: number;
  duration: number;
}

/**
 * Configuration for Cosmos Sequence Coordinator
 */
export interface CosmosSequenceConfig {
  postingTimeoutMs: number;
  defaultTimeoutMs: number;
  maxQueueSize: number;
}

/**
 * Cosmos Sequence Coordinator
 * Provides sequential access to SEDA Signer for concurrent async tasks
 * to prevent Cosmos SDK account sequence mismatch errors
 */
export class CosmosSequenceCoordinator {
  private executionQueue: Array<{
    execution: SequencedPosting<any>;
    resolve: (result: PostingResult<any>) => void;
    reject: (error: Error) => void;
  }> = [];
  private isProcessing = false;
  private sequenceNumber: number = 0; // Will be initialized from blockchain
  private isInitialized = false;
  private queryService: SequenceQueryService;

  constructor(
    private logger: ILoggingService,
    private config: CosmosSequenceConfig
  ) {
    this.queryService = new SequenceQueryService(this.logger);
  }

  /**
   * Initialize the sequence coordinator with the current account sequence number
   */
  async initialize(signer: Signer): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('🔍 Querying account sequence number from blockchain...');
      
      // Query the current account sequence number from the blockchain
      const accountSequence = await this.queryService.queryAccountSequence(signer);
      this.sequenceNumber = accountSequence;
      this.isInitialized = true;
      
      this.logger.info(`✅ Initialized sequence coordinator with account sequence: ${this.sequenceNumber}`);
    } catch (error) {
      this.logger.error('❌ Failed to initialize sequence coordinator:', error);
      // Fallback to starting from 0 if query fails (new account)
      this.sequenceNumber = 0;
      this.isInitialized = true;
      this.logger.warn('⚠️ Using fallback sequence number: 0 (assuming new account)');
    }
  }

  /**
   * Execute a transaction with sequence coordination
   * Ensures transactions are executed one at a time to prevent sequence conflicts
   */
  async executeSequenced<T>(execution: SequencedPosting<T>): Promise<PostingResult<T>> {
    if (!this.isInitialized) {
      throw new Error('Sequence coordinator not initialized. Call initialize() first.');
    }

    if (this.executionQueue.length >= this.config.maxQueueSize) {
      throw new Error(`Sequence execution queue is full (max: ${this.config.maxQueueSize})`);
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
      const sequence = this.sequenceNumber; // Use current sequence number, don't increment yet
      const startTime = Date.now();

      this.logger.info(`🔢 Executing sequenced transaction #${sequence} for task ${execution.taskId}`);
      this.logger.info(`   🏷️ This transaction will use account sequence: ${sequence}`);
      this.logger.info(`   📝 Memo will include: "seq:${sequence}"`);

      try {
        // Set up timeout
        const timeout = getNetworkConfig('testnet').dataRequest.timeoutSeconds * 1000;
        
        // Race between execution and timeout
        const result = await withTimeout(
          execution.postTransaction(sequence),
          timeout,
          `Transaction timeout after ${timeout}ms`
        );

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Only increment sequence number AFTER successful posting
        this.sequenceNumber++;

        const executionResult: PostingResult<any> = {
          taskId: execution.taskId,
          success: true,
          result,
          sequence,
          startTime,
          endTime,
          duration
        };

        this.logger.info(`✅ Sequenced transaction #${sequence} completed for task ${execution.taskId} (${duration}ms)`);
        this.logger.info(`🔢 Account sequence number incremented to ${this.sequenceNumber} after successful posting`);
        this.logger.info(`   ⏭️ Next transaction will use sequence: ${this.sequenceNumber}`);
        resolve(executionResult);

      } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;

        // Check if this is a "DataRequestAlreadyExists" error - this actually means posting succeeded
        if (error instanceof Error && isDataRequestExistsError(error)) {
          this.logger.warn(`⚠️ DataRequestAlreadyExists error for task ${execution.taskId} - this means posting actually succeeded!`);
          
          // Increment sequence number since the DataRequest was actually posted
          this.sequenceNumber++;
          
          const executionResult: PostingResult<any> = {
            taskId: execution.taskId,
            success: true,
            result: { success: true, drId: 'unknown-but-posted' },
            sequence,
            startTime,
            endTime,
            duration
          };

          this.logger.info(`✅ Treating as success - sequence number incremented to ${this.sequenceNumber}`);
          resolve(executionResult);
        } else {
          // DO NOT increment sequence number on real failure - allow retry with same sequence
          this.logger.error(`❌ Sequenced transaction #${sequence} failed for task ${execution.taskId} (${duration}ms):`, error);
          this.logger.info(`🔢 Account sequence number ${sequence} not incremented due to posting failure`);

          const executionResult: PostingResult<any> = {
            taskId: execution.taskId,
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            sequence,
            startTime,
            endTime,
            duration
          };

          // Check if it's a sequence-related error
          if (error instanceof Error && isSequenceError(error)) {
            this.logger.warn(`⚠️ Sequence error detected in task ${execution.taskId}: ${error.message}`);
            // For sequence errors, we don't retry automatically - let the caller handle it
          }

          resolve(executionResult); // Resolve with error result instead of rejecting
        }
      }

      // Small delay between transactions to ensure proper sequencing
      await delay(100);
    }

    this.isProcessing = false;
    this.logger.info('✅ Sequence coordinator processing completed');
  }



  /**
   * Get current queue statistics
   */
  getStats() {
    return {
      queueSize: this.executionQueue.length,
      isProcessing: this.isProcessing,
      nextSequenceNumber: this.sequenceNumber,
      maxQueueSize: this.config.maxQueueSize,
      currentSequenceNumber: this.sequenceNumber, // Add current sequence for debugging
      isInitialized: this.isInitialized
    };
  }

  /**
   * Get the current sequence number (for debugging)
   */
  getCurrentSequenceNumber(): number {
    return this.sequenceNumber;
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
    // Don't reset sequence number on clear - keep the real account sequence
    this.logger.info('🔄 Cosmos sequence coordinator cleared (sequence number preserved)');
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