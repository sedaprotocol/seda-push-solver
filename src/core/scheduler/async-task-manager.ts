/**
 * Async Task Management for SEDA DataRequest Scheduler
 * Handles the execution and tracking of asynchronous DataRequest tasks
 */

import type { ILoggingService } from '../../services';
import type { SEDADataRequestBuilder } from '../../push-solver';
import type { SchedulerConfig } from '../../types';
import { executeWithRetry } from './retry-handler';
import { UniqueMemoGenerator, type UniqueMemoData } from './unique-memo-generator';
import { CosmosSequenceCoordinator, type SequencedExecution, type ExecutionResult } from './cosmos-sequence-coordinator';

/**
 * Interface for tracking async task results
 */
export interface AsyncTaskResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: Error;
  drId?: string;
  blockHeight?: number;
  completedAt: number;
  duration: number;
  sequenceNumber?: number; // Track the sequence number used
}

/**
 * Interface for task completion callbacks
 */
export interface TaskCompletionHandler {
  onSuccess(result: AsyncTaskResult): void;
  onFailure(result: AsyncTaskResult): void;
}

/**
 * Async Task Manager
 * Handles the creation, execution, and tracking of async DataRequest tasks
 */
export class AsyncTaskManager {
  private activeTasks = new Map<string, Promise<AsyncTaskResult>>();
  private taskCounter = 0;
  private memoGenerator: UniqueMemoGenerator;
  private sequenceCoordinator: CosmosSequenceCoordinator;

  constructor(
    private logger: ILoggingService,
    private getTimestamp: () => number = Date.now
  ) {
    this.memoGenerator = new UniqueMemoGenerator(this.logger);
    this.sequenceCoordinator = new CosmosSequenceCoordinator(this.logger);
  }

  /**
   * Launch a new async DataRequest task
   */
  launchTask(
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    isRunning: () => boolean,
    completionHandler: TaskCompletionHandler
  ): string {
    const taskId = `task-${++this.taskCounter}-${this.getTimestamp()}`;
    const requestNumber = this.taskCounter;
    
    this.logger.info(`\n🚀 Launching async DataRequest task #${requestNumber} (${taskId})`);
    this.logger.info(`📊 Active tasks: ${this.activeTasks.size + 1}`);

    // Create the async task promise
    const taskPromise = this.executeAsyncDataRequest(
      taskId,
      requestNumber,
      builder,
      config,
      isRunning
    );
    
    // Store the task reference
    this.activeTasks.set(taskId, taskPromise);
    
    // Handle task completion asynchronously
    taskPromise
      .then((result) => {
        if (result.success) {
          completionHandler.onSuccess(result);
        } else {
          completionHandler.onFailure(result);
        }
      })
      .catch((error) => {
        const failureResult: AsyncTaskResult = {
          taskId,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          completedAt: this.getTimestamp(),
          duration: 0
        };
        completionHandler.onFailure(failureResult);
      })
      .finally(() => {
        // Clean up task reference
        this.activeTasks.delete(taskId);
      });

    return taskId;
  }

  /**
   * Execute a single DataRequest asynchronously with sequence coordination
   */
  private async executeAsyncDataRequest(
    taskId: string,
    requestNumber: number,
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    isRunning: () => boolean
  ): Promise<AsyncTaskResult> {
    const startTime = this.getTimestamp();
    
    try {
      this.logger.info(`\n${'='.repeat(73)}`);
      this.logger.info(`📤 Async DataRequest #${requestNumber} (${taskId}) | ${new Date().toLocaleTimeString()}`);
      this.logger.info('='.repeat(73));

      // Create sequenced execution to prevent Cosmos sequence conflicts
      const sequencedExecution: SequencedExecution<any> = {
        taskId,
        timeout: 60000, // 60 seconds timeout for DataRequest execution
        execute: async (sequenceNumber: number) => {
          this.logger.info(`🔢 Executing DataRequest in sequence for task ${taskId}`);
          
          // Generate unique memo using the sequence number
          const uniqueMemoData = this.memoGenerator.generateUniqueMemo(
            config.memo || 'DataRequest',
            sequenceNumber
          );
          
          return await executeWithRetry(
            () => builder.postDataRequest({ memo: uniqueMemoData.memo }),
            config.maxRetries,
            requestNumber,
            isRunning,
            this.logger
          );
        }
      };

      // Execute the DataRequest with sequence coordination
      const executionResult: ExecutionResult<any> = await this.sequenceCoordinator.executeSequenced(sequencedExecution);

      const completedAt = this.getTimestamp();
      const totalDuration = completedAt - startTime;

      if (executionResult.success && executionResult.result) {
        const { success, result } = executionResult.result;
        
        if (success && result) {
          return {
            taskId,
            success: true,
            result,
            drId: result.drId,
            blockHeight: result.blockHeight,
            completedAt,
            duration: totalDuration,
            sequenceNumber: executionResult.sequence
          };
        } else {
          return {
            taskId,
            success: false,
            error: executionResult.result.lastError || new Error('DataRequest failed with unknown error'),
            completedAt,
            duration: totalDuration,
            sequenceNumber: executionResult.sequence
          };
        }
      } else {
        return {
          taskId,
          success: false,
          error: executionResult.error || new Error('Sequenced execution failed'),
          completedAt,
          duration: totalDuration,
          sequenceNumber: executionResult.sequence
        };
      }
    } catch (error) {
      const completedAt = this.getTimestamp();
      const duration = completedAt - startTime;
      
      this.logger.error(`❌ Async task ${taskId} failed:`, error);
      
      return {
        taskId,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        completedAt,
        duration
      };
    }
  }

  /**
   * Get count of active tasks
   */
  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  /**
   * Get memo generator statistics
   */
  getMemoGeneratorStats() {
    return this.memoGenerator.getStats();
  }

  /**
   * Get sequence coordinator statistics
   */
  getSequenceCoordinatorStats() {
    return this.sequenceCoordinator.getStats();
  }

  /**
   * Wait for all active tasks to complete
   */
  async waitForAllTasks(): Promise<AsyncTaskResult[]> {
    const tasks = Array.from(this.activeTasks.values());
    if (tasks.length === 0) {
      return [];
    }
    
    this.logger.info(`⏳ Waiting for ${tasks.length} active tasks to complete...`);
    
    // First wait for all tasks to finish
    const results = await Promise.allSettled(tasks);
    
    // Then wait for the sequence coordinator queue to be empty
    await this.sequenceCoordinator.waitForQueue();
    
    return results.map(result => 
      result.status === 'fulfilled' 
        ? result.value 
        : {
            taskId: 'unknown',
            success: false,
            error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
            completedAt: this.getTimestamp(),
            duration: 0
          }
    );
  }

  /**
   * Clear all active tasks (for cleanup)
   */
  clear(): void {
    this.activeTasks.clear();
    this.memoGenerator.reset();
    this.sequenceCoordinator.clear();
  }
} 