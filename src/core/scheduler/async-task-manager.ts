/**
 * Async Task Management for SEDA DataRequest Scheduler
 * Handles the launching and coordination of asynchronous DataRequest tasks
 */

import type { ILoggingService } from '../../services';
import type { SEDADataRequestBuilder } from '../data-request/builder';
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
 * Async Task Manager
 * Coordinates the launching and tracking of multiple concurrent DataRequest tasks
 * Now focused on high-level coordination using modular components
 */
export class AsyncTaskManager {
  private activeTasks = new Map<string, Promise<AsyncTaskResult>>();
  private taskCounter = 0;
  private sequenceCoordinator: CosmosSequenceCoordinator;
  private registry: TaskRegistry;
  private executor: TaskExecutor;

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
   * Initialize the task manager with signer access for sequence coordination
   */
  async initialize(builder: SEDADataRequestBuilder): Promise<void> {
    // Ensure builder is initialized
    if (!builder.isBuilderInitialized()) {
      await builder.initialize();
    }

    // Get the signer and initialize sequence coordinator
    const signer = (builder as any).signer;
    if (!signer) {
      throw new Error('Builder signer not available for sequence coordinator initialization');
    }

    await this.sequenceCoordinator.initialize(signer);
    this.logger.info('✅ Async task manager initialized with real account sequence');
  }

  /**
   * Launch a new async DataRequest task
   */
  launchTask(
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    isRunning: () => boolean,
    completionHandler: TaskCompletionHandler,
    statistics: SchedulerStatistics
  ): string {
    this.taskCounter++;
    const taskId = `task-${this.taskCounter}-${Date.now()}`;
    const requestNumber = this.taskCounter;
    
    this.logger.info(`\n🚀 Launching async DataRequest task #${requestNumber} (${taskId})`);
    this.logger.info(`📊 Active tasks: ${this.activeTasks.size + 1}`);

    // Register the task in the registry
    this.registry.registerTask(taskId, config.memo);

    // Create the async task promise using the executor
    const taskPromise = this.executor.executeTask(
      taskId,
      requestNumber,
      builder,
      config,
      isRunning,
      {
        onSuccess: (result: AsyncTaskResult) => {
          // Record successful oracle execution
          statistics.recordSuccess();
          completionHandler.onSuccess(result);
        },
        onFailure: (result: AsyncTaskResult) => {
          // Only record failure if this was an oracle execution failure
          // Posting failures shouldn't count towards oracle statistics
          if (result.drId) {
            statistics.recordFailure();
          }
          completionHandler.onFailure(result);
        }
      }
    );
    
    // Store the task reference
    this.activeTasks.set(taskId, taskPromise);
    
    // Handle final cleanup when task fully completes
    taskPromise.finally(() => {
      this.activeTasks.delete(taskId);
    });

    return taskId;
  }

  /**
   * Get count of active tasks
   */
  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  /**
   * Get all DataRequest trackers (active and completed)
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
    this.registry.clear();
    this.executor.reset();
    this.sequenceCoordinator.clear();
  }
} 