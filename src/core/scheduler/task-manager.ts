/**
 * Task Manager for SEDA DataRequest Scheduler
 * Achieves maximum posting speed by completely separating timer intervals from posting execution
 */

import type { ILoggingService } from '../../services';
import type { SEDADataRequestBuilder } from '../data-request';
import type { SchedulerConfig } from '../../types';
import { 
  CosmosSequenceCoordinator,
  type CosmosSequenceConfig 
} from './cosmos-sequence-coordinator';
import type { SchedulerStatistics } from './statistics';
import type { DataRequestTracker, AsyncTaskResult, TaskCompletionHandler } from './types';
import { TaskRegistry } from './task-registry';
import { TaskExecutor } from './task-executor';

/**
 * Task Manager
 * Key innovation: Timer intervals are NEVER blocked by posting execution
 */
export class TaskManager {
  private taskCounter = 0;
  private sequenceCoordinator: CosmosSequenceCoordinator;
  private registry: TaskRegistry;
  private executor: TaskExecutor;
  private taskQueue: Array<{
    taskId: string;
    requestNumber: number;
    timestamp: number;
  }> = [];

  constructor(
    private logger: ILoggingService,
    private cosmosSequenceConfig: CosmosSequenceConfig,
    private getTimestamp: () => number = Date.now
  ) {
    this.sequenceCoordinator = new CosmosSequenceCoordinator(this.logger, this.cosmosSequenceConfig);
    this.registry = new TaskRegistry(this.logger, this.getTimestamp);
    this.executor = new TaskExecutor(this.logger, this.sequenceCoordinator, this.registry, this.getTimestamp);
  }

  /**
   * Initialize the task manager
   */
  async initialize(builder: SEDADataRequestBuilder): Promise<void> {
    if (!builder.isBuilderInitialized()) {
      await builder.initialize();
    }

    const signer = (builder as any).signer;
    if (!signer) {
      throw new Error('Builder signer not available for sequence coordinator initialization');
    }

    await this.sequenceCoordinator.initialize(signer);
    this.logger.info('⚡ Task manager initialized');
  }

  /**
   * Queue a task and return IMMEDIATELY
   * This NEVER blocks the timer interval
   */
  queueTask(
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    isRunning: () => boolean,
    completionHandler: TaskCompletionHandler,
    statistics: SchedulerStatistics
  ): string {
    this.taskCounter++;
    const taskId = `task-${this.taskCounter}-${Date.now()}`;
    const requestNumber = this.taskCounter;
    
    this.logger.info(`⚡ Queued task #${requestNumber} (${taskId}) - NO BLOCKING!`);
    
    // Add to queue (this is instant)
    this.taskQueue.push({
      taskId,
      requestNumber,
      timestamp: this.getTimestamp()
    });

    // Register the task
    this.registry.registerTask(taskId, config.memo);

    // Start processing the task in the background (fire and forget)
    this.processTaskInBackground(
      taskId,
      requestNumber,
      builder,
      config,
      isRunning,
      {
        onSuccess: (result: AsyncTaskResult) => {
          if (result.result && result.result.type === 'posted') {
            // This is a posting success - increment posted counter
            statistics.recordPosted();
            this.logger.info(`📤 POSTED SUCCESSFULLY: ${result.taskId} (DR: ${result.drId})`);
          } else if (result.result && result.result.type === 'oracle_completed') {
            // This is an oracle completion - success counter handled by completion handler
            this.logger.info(`✅ ORACLE COMPLETED: ${result.taskId} (DR: ${result.drId})`);
          }
          completionHandler.onSuccess(result);
        },
        onFailure: (result: AsyncTaskResult) => {
          if (result.drId) {
            // Only log oracle failures, failure counter handled by completion handler
            this.logger.info(`❌ ORACLE FAILED: ${result.taskId} (DR: ${result.drId})`);
          } else {
            this.logger.info(`❌ POSTING FAILED: ${result.taskId}`);
          }
          completionHandler.onFailure(result);
        }
      }
    );

    return taskId;
  }

  /**
   * Process task in background without blocking
   */
  private async processTaskInBackground(
    taskId: string,
    requestNumber: number,
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    isRunning: () => boolean,
    completionHandler: TaskCompletionHandler
  ): Promise<void> {
    try {
      // Execute the task using the executor
      await this.executor.executeTask(
        taskId,
        requestNumber,
        builder,
        config,
        isRunning,
        completionHandler
      );
    } catch (error) {
      this.logger.error(`❌ Background task processing failed for ${taskId}:`, error);
    } finally {
      // Remove from queue when done
      this.taskQueue = this.taskQueue.filter(task => task.taskId !== taskId);
    }
  }

  /**
   * Get count of active tasks (both queued and executing)
   */
  getActiveTaskCount(): number {
    return this.taskQueue.length;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.taskQueue.length;
  }

  /**
   * Get all DataRequest trackers
   */
  getAllDataRequests(): DataRequestTracker[] {
    return this.registry.getAllTasks();
  }

  /**
   * Get active DataRequest trackers only
   */
  getActiveDataRequests(): DataRequestTracker[] {
    return this.registry.getActiveTasks();
  }

  /**
   * Get DataRequest tracker by task ID
   */
  getDataRequest(taskId: string): DataRequestTracker | undefined {
    return this.registry.getTask(taskId);
  }

  /**
   * Get DataRequest trackers by status
   */
  getDataRequestsByStatus(status: DataRequestTracker['status']): DataRequestTracker[] {
    return this.registry.getTasksByStatus(status);
  }

  /**
   * Get memo generator statistics
   */
  getMemoGeneratorStats() {
    return this.executor.getMemoGeneratorStats();
  }

  /**
   * Get sequence coordinator statistics
   */
  getSequenceCoordinatorStats() {
    return this.sequenceCoordinator.getStats();
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    const now = this.getTimestamp();
    const queueAges = this.taskQueue.map(task => now - task.timestamp);
    
    return {
      queueSize: this.taskQueue.length,
      oldestTaskAge: queueAges.length > 0 ? Math.max(...queueAges) : 0,
      averageTaskAge: queueAges.length > 0 ? queueAges.reduce((a, b) => a + b, 0) / queueAges.length : 0
    };
  }

  /**
   * Wait for all active tasks to complete
   */
  async waitForAllTasks(): Promise<void> {
    while (this.taskQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Also wait for the sequence coordinator queue
    await this.sequenceCoordinator.waitForQueue();
  }

  /**
   * Clear all active tasks
   */
  clear(): void {
    this.taskQueue = [];
    this.registry.clear();
    this.executor.reset();
    this.sequenceCoordinator.clear();
  }
} 