/**
 * Task Completion Handler
 * Handles completion events for scheduler tasks
 * Note: EVM batch posting is now handled directly in the executor
 */

import type { ILoggingService } from '../../services';
import type { ITimerService } from '../../infrastructure';
import type { SchedulerStatistics } from './statistics';
import type { SchedulerConfig } from '../../types';
import type { AsyncTaskResult, TaskCompletionHandler } from './types';
import { SchedulerTaskCompletionHandler } from './task-completion-handler';

/**
 * Task completion handler that delegates to the base handler
 * EVM batch posting is now handled in the executor rather than per-result
 */
export class EvmEnhancedCompletionHandler implements TaskCompletionHandler {
  private baseHandler: SchedulerTaskCompletionHandler;

  constructor(
    private logger: ILoggingService,
    private statistics: SchedulerStatistics,
    private config: SchedulerConfig,
    private isRunning: () => boolean,
    private getActiveTaskCount: () => number,
    private timerService?: ITimerService
  ) {
    // Initialize the base handler
    this.baseHandler = new SchedulerTaskCompletionHandler(
      logger,
      statistics,
      config,
      isRunning,
      getActiveTaskCount,
      timerService
    );

    this.logger.info('✅ Task completion handler initialized (EVM batch posting handled in executor)');
  }

  /**
   * Handle successful task completion
   */
  async onSuccess(result: AsyncTaskResult): Promise<void> {
    // Delegate to base handler
    this.baseHandler.onSuccess(result);
  }

  /**
   * Handle failed task completion
   */
  onFailure(result: AsyncTaskResult): void {
    // Delegate to base handler
    this.baseHandler.onFailure(result);
  }
} 