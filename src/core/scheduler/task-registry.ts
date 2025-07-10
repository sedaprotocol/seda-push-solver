/**
 * Task Registry for DataRequest Tracking
 * Manages the state and history of DataRequest tasks
 */

import type { LoggingService } from '../../services';
import type { DataRequestTracker } from './types';

/**
 * Registry for tracking DataRequest task states and history
 */
export class TaskRegistry {
  private dataRequestRegistry = new Map<string, DataRequestTracker>();

  constructor(
    private logger: LoggingService,
    private getTimestamp: () => number = Date.now
  ) {}

  /**
   * Register a new DataRequest task
   */
  registerTask(taskId: string, memo?: string): DataRequestTracker {
    const tracker: DataRequestTracker = {
      taskId,
      status: 'posting',
      startTime: this.getTimestamp(),
      memo
    };
    
    this.dataRequestRegistry.set(taskId, tracker);
    return tracker;
  }

  /**
   * Update task status to posted
   */
  markAsPosted(
    taskId: string, 
    drId: string, 
    blockHeight: bigint, 
    txHash: string, 
    sequenceNumber: number
  ): void {
    const tracker = this.dataRequestRegistry.get(taskId);
    if (tracker) {
      tracker.status = 'posted';
      tracker.drId = drId;
      tracker.blockHeight = blockHeight;
      tracker.txHash = txHash;
      tracker.sequenceNumber = sequenceNumber;
      tracker.postedAt = this.getTimestamp();
    }
  }

  /**
   * Mark task as completed successfully
   */
  markAsCompleted(taskId: string): void {
    const tracker = this.dataRequestRegistry.get(taskId);
    if (tracker) {
      tracker.status = 'completed';
      tracker.completedAt = this.getTimestamp();
    }
  }

  /**
   * Mark task as failed
   */
  markAsFailed(taskId: string, error: Error, sequenceNumber?: number): void {
    const tracker = this.dataRequestRegistry.get(taskId);
    if (tracker) {
      tracker.status = 'failed';
      tracker.error = error;
      tracker.completedAt = this.getTimestamp();
      if (sequenceNumber !== undefined) {
        tracker.sequenceNumber = sequenceNumber;
      }
    }
  }

  /**
   * Get DataRequest tracker by task ID
   */
  getTask(taskId: string): DataRequestTracker | undefined {
    return this.dataRequestRegistry.get(taskId);
  }

  /**
   * Get all DataRequest trackers
   */
  getAllTasks(): DataRequestTracker[] {
    return Array.from(this.dataRequestRegistry.values());
  }

  /**
   * Get active DataRequest trackers only
   */
  getActiveTasks(): DataRequestTracker[] {
    return Array.from(this.dataRequestRegistry.values())
      .filter(tracker => tracker.status === 'posting' || tracker.status === 'posted');
  }

  /**
   * Get DataRequest trackers by status
   */
  getTasksByStatus(status: DataRequestTracker['status']): DataRequestTracker[] {
    return Array.from(this.dataRequestRegistry.values())
      .filter(tracker => tracker.status === status);
  }

  /**
   * Clean up old completed/failed tasks to prevent memory leaks
   */
  cleanupOldTasks(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = this.getTimestamp();
    const cutoffTime = now - maxAgeMs;
    let cleanedCount = 0;
    
    for (const [taskId, tracker] of this.dataRequestRegistry.entries()) {
      // Only clean up completed or failed tasks
      if (tracker.status === 'completed' || tracker.status === 'failed') {
        const completionTime = tracker.completedAt || tracker.startTime;
        if (completionTime < cutoffTime) {
          this.dataRequestRegistry.delete(taskId);
          cleanedCount++;
        }
      }
    }
    
    if (cleanedCount > 0) {
      this.logger.debug(`🧹 Cleaned up ${cleanedCount} old tasks from registry`);
    }
    
    return cleanedCount;
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const allTasks = this.getAllTasks();
    const statusCounts = {
      posting: 0,
      posted: 0,
      completed: 0,
      failed: 0
    };
    
    allTasks.forEach(task => {
      statusCounts[task.status]++;
    });
    
    return {
      totalTasks: allTasks.length,
      statusCounts,
      activeTasks: statusCounts.posting + statusCounts.posted
    };
  }

  /**
   * Clear all task history (for cleanup)
   */
  clear(): void {
    this.dataRequestRegistry.clear();
    this.logger.debug('🔄 Task registry cleared');
  }
} 