/**
 * EVM Task Completion Handler
 * Enhanced completion handler that integrates DataRequest completions with EVM batch tracking
 */

import type { ILoggingService } from '../../services/logging-service';
import type { ITimerService } from '../../infrastructure/timer-service';
import type { IDataRequestTracker } from '../../services/data-request-tracker';
import type { SchedulerStatistics } from './statistics';
import type { SchedulerConfig } from '../../types';
import type { AsyncTaskResult, TaskCompletionHandler } from './types';

/**
 * Enhanced task completion handler that integrates with EVM batch tracking
 */
export class EVMTaskCompletionHandler implements TaskCompletionHandler {
  constructor(
    private logger: ILoggingService,
    private statistics: SchedulerStatistics,
    private config: SchedulerConfig,
    private completionTracker: IDataRequestTracker,
    private isRunning: () => boolean,
    private getActiveTaskCount: () => number,
    private timerService?: ITimerService
  ) {}

  onSuccess(result: AsyncTaskResult): void {
    // Update statistics like the original handler
    this.statistics.recordSuccess();
    
    // Log success with enhanced details
    const duration = result.duration;
    const durationStr = duration < 60000 
      ? `${Math.round(duration / 1000)}s`
      : `${Math.round(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`;

    this.logger.info(`✅ DataRequest completed successfully`);
    this.logger.info(`   📊 Task ID: ${result.taskId}`);
    
    if (result.drId) {
      this.logger.info(`   🔗 DR ID: ${result.drId}`);
      
      if (result.blockHeight) {
        const explorerUrl = this.getExplorerUrl(result.drId, result.blockHeight);
        this.logger.info(`   🌐 Explorer: ${explorerUrl}`);
      }
    }
    
    this.logger.info(`   ⏱️  Duration: ${durationStr}`);
    
    if (result.sequenceNumber !== undefined) {
      this.logger.info(`   🔢 Sequence: ${result.sequenceNumber}`);
    }

    // Track the completion for EVM batch processing
    this.trackCompletionForEVM(result);

    // Log current status
    this.logCurrentStatus();
  }

  onFailure(result: AsyncTaskResult): void {
    // Update statistics like the original handler
    this.statistics.recordFailure();
    
    // Log failure with enhanced details
    const duration = result.duration;
    const durationStr = duration < 60000 
      ? `${Math.round(duration / 1000)}s`
      : `${Math.round(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`;

    this.logger.error(`❌ DataRequest failed`);
    this.logger.error(`   📊 Task ID: ${result.taskId}`);
    this.logger.error(`   🔗 DR ID: ${result.drId || 'N/A'}`);
    this.logger.error(`   ⏱️  Duration: ${durationStr}`);
    
    if (result.sequenceNumber !== undefined) {
      this.logger.error(`   🔢 Sequence: ${result.sequenceNumber}`);
    }
    
    if (result.error) {
      this.logger.error(`   💥 Error: ${result.error.message}`);
    }

    // Log current status
    this.logCurrentStatus();
  }

  /**
   * Track successful completions for EVM batch processing
   */
  private async trackCompletionForEVM(result: AsyncTaskResult): Promise<void> {
    try {
      // Only track successful DataRequests that have completed oracle processing
      if (result.success && result.drId && result.blockHeight !== undefined) {
        await this.completionTracker.trackDataRequest(result.drId);
        this.logger.debug(`📋 Tracked DataRequest ${result.drId} for EVM batch processing`);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to track DataRequest completion for EVM: ${error}`);
    }
  }

  /**
   * Get explorer URL for the DataRequest
   */
  private getExplorerUrl(drId: string, blockHeight: number): string {
    // Use testnet explorer for now
    // TODO: Make this configurable based on network
    const baseUrl = 'https://testnet.explorer.seda.xyz';
    return `${baseUrl}/data-requests/${drId}`;
  }

  /**
   * Log current scheduler status with EVM integration info
   */
  private logCurrentStatus(): void {
    const stats = this.statistics.getStats();
    const isRunning = this.isRunning();
    const activeTasks = this.getActiveTaskCount();
    
    // Get completion tracker stats
    const completionStats = this.completionTracker.getTrackingStatistics();
    
    this.logger.info(`📊 Scheduler Status:`);
    this.logger.info(`   🏃 Running: ${isRunning} | Active Tasks: ${activeTasks}`);
    this.logger.info(`   📈 Posted: ${stats.postedRequests} | Completed: ${stats.successfulRequests} | Failed: ${stats.failedRequests}`);
    this.logger.info(`   🎯 Success Rate: ${this.statistics.getSuccessRate()}%`);
    
    // Add EVM batch tracking status
    if (completionStats.totalTracked > 0) {
      this.logger.info(`   📋 EVM Tracking: ${completionStats.pending} pending, ${completionStats.batchAssigned} assigned`);
      
      if (completionStats.avgBatchAssignmentTimeMs > 0) {
        const avgTimeStr = completionStats.avgBatchAssignmentTimeMs < 60000
          ? `${Math.round(completionStats.avgBatchAssignmentTimeMs / 1000)}s`
          : `${Math.round(completionStats.avgBatchAssignmentTimeMs / 60000)}m`;
        this.logger.info(`   ⏱️  Avg Batch Assignment Time: ${avgTimeStr}`);
      }
    }

    // Show next task countdown if in continuous mode
    if (isRunning && this.config.continuous) {
      const nextTaskTime = this.getNextTaskTime();
      if (nextTaskTime > 0) {
        const countdown = Math.ceil(nextTaskTime / 1000);
        this.logger.info(`   ⏰ Next DataRequest in: ${countdown}s`);
      }
    }
  }

  /**
   * Calculate time until next task (simplified version)
   */
  private getNextTaskTime(): number {
    // This is a simplified calculation
    // In practice, this would need access to the scheduler's internal timing
    return this.config.intervalMs;
  }
}

/**
 * Factory function to create EVM-enhanced completion handler
 */
export function createEVMTaskCompletionHandler(
  logger: ILoggingService,
  statistics: SchedulerStatistics,
  config: SchedulerConfig,
  completionTracker: IDataRequestTracker,
  isRunning: () => boolean,
  getActiveTaskCount: () => number,
  timerService?: ITimerService
): TaskCompletionHandler {
  return new EVMTaskCompletionHandler(
    logger,
    statistics,
    config,
    completionTracker,
    isRunning,
    getActiveTaskCount,
    timerService
  );
} 