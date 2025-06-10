/**
 * Async Task Management for SEDA DataRequest Scheduler
 * Handles the execution and tracking of asynchronous DataRequest tasks
 */

import type { ILoggingService } from '../../services';
import type { SEDADataRequestBuilder } from '../../push-solver';
import type { SchedulerConfig } from '../../types';
import { executeWithRetry } from './retry-handler';

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

  constructor(
    private logger: ILoggingService,
    private getTimestamp: () => number = Date.now
  ) {}

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
   * Execute a single DataRequest asynchronously
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

      // Execute DataRequest with retry logic
      const { success, result, lastError } = await executeWithRetry(
        () => builder.postDataRequest({ memo: config.memo }),
        config.maxRetries,
        requestNumber,
        isRunning,
        this.logger
      );

      const completedAt = this.getTimestamp();
      const duration = completedAt - startTime;

      if (success && result) {
        return {
          taskId,
          success: true,
          result,
          drId: result.drId,
          blockHeight: result.blockHeight,
          completedAt,
          duration
        };
      } else {
        return {
          taskId,
          success: false,
          error: lastError || new Error('DataRequest failed with unknown error'),
          completedAt,
          duration
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
   * Wait for all active tasks to complete
   */
  async waitForAllTasks(): Promise<AsyncTaskResult[]> {
    const tasks = Array.from(this.activeTasks.values());
    if (tasks.length === 0) {
      return [];
    }
    
    this.logger.info(`⏳ Waiting for ${tasks.length} active tasks to complete...`);
    const results = await Promise.allSettled(tasks);
    
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
  }
} 