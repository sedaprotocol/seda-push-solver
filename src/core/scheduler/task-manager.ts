/**
 * Task Manager for SEDA DataRequest Scheduler
 * Achieves optimal posting performance by separating timer intervals from posting execution
 * Refactored to use extracted task management modules
 */

import type { LoggingService } from '../../services';
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
import { DataRequestPerformanceTracker } from './performance-tracker';

// Task management modules
import { TaskQueue, type QueueStats } from './task-management';
import { TaskCompletionManager } from './task-management';

/**
 * Task Manager
 * Key design: Timer intervals are not blocked by posting execution
 */
export class TaskManager {
  private taskCounter = 0;
  private sequenceCoordinator: CosmosSequenceCoordinator;
  private registry: TaskRegistry;
  private executor: TaskExecutor;
  private performanceTracker: DataRequestPerformanceTracker;
  
  // Task management modules
  private taskQueue: TaskQueue;
  private completionManager: TaskCompletionManager;
  
  // Periodic cleanup
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private logger: LoggingService,
    private cosmosSequenceConfig: CosmosSequenceConfig,
    private getTimestamp: () => number = Date.now
  ) {
    this.sequenceCoordinator = new CosmosSequenceCoordinator(this.logger, this.cosmosSequenceConfig);
    this.registry = new TaskRegistry(this.logger, this.getTimestamp);
    this.executor = new TaskExecutor(this.logger, this.sequenceCoordinator, this.registry, this.getTimestamp);
    this.performanceTracker = new DataRequestPerformanceTracker();
    
    // Initialize task management modules
    this.taskQueue = new TaskQueue(this.logger, this.getTimestamp);
    this.completionManager = new TaskCompletionManager(this.logger);
    
    // Start periodic cleanup to prevent memory leaks
    this.startPeriodicCleanup();
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
    
    // Start performance tracking
    this.performanceTracker.startTracking(taskId, requestNumber);
    
    // Add to queue using the queue module
    this.taskQueue.enqueue(taskId, requestNumber);

    // Register the task
    this.registry.registerTask(taskId, config.memo);

    // Create completion handler using the completion manager
    const enhancedCompletionHandler = this.completionManager.createCompletionHandler(
      taskId,
      statistics,
      this.performanceTracker,
      completionHandler
    );

    // Start processing the task in the background (fire and forget)
    this.processTaskInBackground(
      taskId,
      requestNumber,
      builder,
      config,
      isRunning,
      enhancedCompletionHandler
    );

    return taskId;
  }

  /**
   * Queue a multi-program task for parallel execution
   * This executes multiple programs in parallel within a single task
   */
  queueMultiProgramTask(
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    isRunning: () => boolean,
    completionHandler: TaskCompletionHandler,
    statistics: SchedulerStatistics
  ): string {
    this.taskCounter++;
    const taskId = `multi-task-${this.taskCounter}-${Date.now()}`;
    const requestNumber = this.taskCounter;
    
    this.logger.info(`⚡ Queued multi-program task #${requestNumber} (${taskId}) - NO BLOCKING!`);
    
    // Start performance tracking
    this.performanceTracker.startTracking(taskId, requestNumber);
    
    // Add to queue using the queue module
    this.taskQueue.enqueue(taskId, requestNumber);

    // Register the task
    this.registry.registerTask(taskId, `${config.memo} - Multi-Program`);

    // Create completion handler using the completion manager
    const enhancedCompletionHandler = this.completionManager.createCompletionHandler(
      taskId,
      statistics,
      this.performanceTracker,
      completionHandler
    );

    // Start processing the multi-program task in the background (fire and forget)
    this.processMultiProgramTaskInBackground(
      taskId,
      requestNumber,
      builder,
      config,
      isRunning,
      enhancedCompletionHandler
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
        completionHandler,
        this.performanceTracker
      );
    } catch (error) {
      this.logger.error(`❌ Background task processing failed for ${taskId}:`, error instanceof Error ? error : String(error));
    } finally {
      // Remove from queue when done using the queue module
      this.taskQueue.dequeue(taskId);
    }
  }

  /**
   * Process multi-program task in background without blocking
   */
  private async processMultiProgramTaskInBackground(
    taskId: string,
    requestNumber: number,
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    isRunning: () => boolean,
    completionHandler: TaskCompletionHandler
  ): Promise<void> {
    try {
      // Execute the multi-program task using the executor
      await this.executor.executeMultiProgramTask(
        taskId,
        requestNumber,
        builder,
        config,
        isRunning,
        completionHandler,
        this.performanceTracker
      );
    } catch (error) {
      this.logger.error(`❌ Background multi-program task processing failed for ${taskId}:`, error instanceof Error ? error : String(error));
    } finally {
      // Remove from queue when done using the queue module
      this.taskQueue.dequeue(taskId);
    }
  }

  /**
   * Get count of active tasks (both queued and executing)
   */
  getActiveTaskCount(): number {
    return this.taskQueue.getSize();
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.taskQueue.getSize();
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
   * Get queue statistics using the queue module
   */
  getQueueStats(): QueueStats {
    return this.taskQueue.getStats();
  }

  /**
   * Wait for all active tasks to complete
   */
  async waitForAllTasks(): Promise<void> {
    while (!this.taskQueue.isEmpty()) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Also wait for the sequence coordinator queue
    await this.sequenceCoordinator.waitForQueue();
  }

  /**
   * Get performance tracker for access from executor
   */
  getPerformanceTracker(): DataRequestPerformanceTracker {
    return this.performanceTracker;
  }

  /**
   * Log performance summary
   */
  logPerformanceSummary(): void {
    this.performanceTracker.logSummaryStatistics(this.logger);
  }

  /**
   * Start periodic cleanup to prevent memory leaks
   */
  private startPeriodicCleanup(): void {
    // Clean up old tasks every 30 minutes
    this.cleanupTimer = setInterval(() => {
      // Clean up tasks older than 24 hours
      const cleanedTasks = this.registry.cleanupOldTasks(24 * 60 * 60 * 1000);
      
      // Log registry statistics periodically
      const stats = this.registry.getStats();
      if (stats.totalTasks > 100 || cleanedTasks > 0) {
        this.logger.debug(`📊 Task registry stats: ${stats.totalTasks} total tasks (active: ${stats.activeTasks}, completed: ${stats.statusCounts.completed}, failed: ${stats.statusCounts.failed})`);
        if (cleanedTasks > 0) {
          this.logger.info(`🧹 Cleaned up ${cleanedTasks} old tasks from registry`);
        }
      }
    }, 30 * 60 * 1000); // 30 minutes
    
    this.logger.debug('⏰ Started periodic task cleanup (30-minute intervals)');
  }

  /**
   * Clear all active tasks
   */
  clear(): void {
    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    this.taskQueue.clear();
    this.registry.clear();
    this.executor.reset();
    this.sequenceCoordinator.clear();
    this.performanceTracker.reset();
  }

  /**
   * Shutdown the task manager and wait for all tasks to complete
   */
  async shutdown(): Promise<void> {
    this.logger.info('🛑 Starting task manager shutdown...');
    
    // Stop periodic cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.logger.debug('⏰ Stopped periodic task cleanup timer');
    }
    
    // First, signal all components to stop accepting new work
    this.sequenceCoordinator.clear();
    
    // Cancel any long-running background operations
    if (this.executor.cancelAllTasks) {
      this.executor.cancelAllTasks();
    }
    
    // Wait for existing tasks to complete (with timeout)
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds total (100ms * 50)
    
    while (!this.taskQueue.isEmpty() && attempts < maxAttempts) {
      await new Promise<void>(resolve => {
        if (this.getTimestamp === Date.now) {
          // Use a simple delay since we don't have timer service here
          const start = Date.now();
          while (Date.now() - start < 100) {
            // Busy wait for 100ms
          }
        }
        resolve();
      });
      attempts++;
    }
    
    if (!this.taskQueue.isEmpty()) {
      const remainingTasks = this.taskQueue.getSize();
      this.logger.warn(`⚠️ Shutdown timeout: ${remainingTasks} tasks still in queue`);
    }
    
    // Force clear all resources
    this.clear();
    
    this.logger.info('✅ Task manager shutdown completed');
  }
} 