/**
 * Task Completion Handler for SEDA DataRequest Scheduler
 * Handles the logging and statistics tracking for completed async tasks
 */

import type { ILoggingService } from '../../services';
import type { ITimerService } from '../../infrastructure';
import type { SchedulerStatistics } from './statistics';
import type { SchedulerConfig } from '../../types';
import type { AsyncTaskResult, TaskCompletionHandler } from './async-task-manager';

/**
 * Implementation of task completion handling
 */
export class SchedulerTaskCompletionHandler implements TaskCompletionHandler {
  constructor(
    private logger: ILoggingService,
    private statistics: SchedulerStatistics,
    private config: SchedulerConfig,
    private isRunning: () => boolean,
    private getActiveTaskCount: () => number,
    private timerService?: ITimerService
  ) {}

  /**
   * Handle successful task completion
   */
  onSuccess(result: AsyncTaskResult): void {
    this.logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
    this.logger.info(`│                    ✅ Task ${result.taskId} Successful                    │`);
    this.logger.info('├─────────────────────────────────────────────────────────────────────┤');
    this.logger.info(`│ Request ID: ${result.drId || 'N/A'}`);
    this.logger.info(`│ Exit Code: ${result.result?.exitCode || 'N/A'}`);
    this.logger.info(`│ Block Height: ${result.blockHeight || 'N/A'}`);
    this.logger.info(`│ Gas Used: ${result.result?.gasUsed || 'N/A'}`);
    this.logger.info(`│ Duration: ${(result.duration / 1000).toFixed(1)}s`);
    this.logger.info('└─────────────────────────────────────────────────────────────────────┘');
    
    this.statistics.recordSuccess();
    this.logCurrentStatus();
  }

  /**
   * Handle failed task completion
   */
  onFailure(result: AsyncTaskResult): void {
    this.logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
    this.logger.info(`│                     💥 Task ${result.taskId} Failed                       │`);
    this.logger.info('├─────────────────────────────────────────────────────────────────────┤');
    this.logger.info(`│ Task ID: ${result.taskId}`);
    
    if (result.drId) {
      this.logger.info(`│ Data Request ID: ${result.drId}`);
    }
    if (result.blockHeight) {
      this.logger.info(`│ Block Height: ${result.blockHeight}`);
    }
    
    this.logger.info(`│ Error: ${result.error?.message || 'Unknown error'}`);
    this.logger.info(`│ Duration: ${(result.duration / 1000).toFixed(1)}s`);
    this.logger.info('└─────────────────────────────────────────────────────────────────────┘');
    
    this.statistics.recordFailure();
    this.logCurrentStatus();
  }

  /**
   * Log current scheduler status
   */
  private logCurrentStatus(): void {
    this.logger.info(`📊 Active async tasks: ${this.getActiveTaskCount()}`);
    
    if (this.config.continuous && this.isRunning()) {
      const nextRequest = new Date((this.timerService?.now() || Date.now()) + this.config.intervalMs);
      this.logger.info(`⏭️  Next task scheduled: ${nextRequest.toLocaleTimeString()}`);
    }
  }
} 