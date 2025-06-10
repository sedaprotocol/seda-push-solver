/**
 * SEDA DataRequest Scheduler
 * 
 * Provides scheduling functionality to continuously post DataRequests to the SEDA network
 * at regular intervals. Includes retry logic, statistics tracking, and graceful shutdown.
 */

import { SEDADataRequestBuilder } from './push-solver';
import { 
  buildSchedulerConfig, 
  formatSchedulerConfig,
  SchedulerStatistics,
  AsyncTaskManager,
  SchedulerTaskCompletionHandler,
  type AsyncTaskResult
} from './core/scheduler';
import type { SchedulerConfig, SchedulerStats } from './types';
import type { ITimerService, IProcessService, TimerId } from './infrastructure';
import type { ILoggingService } from './services';
import { loadSEDAConfig } from './core/data-request';

/**
 * SEDA DataRequest Scheduler
 * 
 * Manages the automated posting of DataRequests to the SEDA network at regular intervals.
 * Now supports non-blocking async execution that doesn't block the setInterval loop.
 */
export class SEDADataRequestScheduler {
  private config: SchedulerConfig;
  private builder: SEDADataRequestBuilder;
  private isRunning: boolean = false;
  private intervalId: TimerId | null = null;
  private statistics: SchedulerStatistics;
  private taskManager: AsyncTaskManager;
  private completionHandler: SchedulerTaskCompletionHandler;

  /**
   * Create a new scheduler instance
   * @param schedulerConfig Partial configuration to override defaults
   * @param logger Logging service for structured output
   * @param timerService Timer service for scheduling (defaults to production timer)
   * @param processService Process service for shutdown handling (defaults to production process)
   */
  constructor(
    schedulerConfig: Partial<SchedulerConfig> = {},
    private logger: ILoggingService,
    private timerService?: ITimerService,
    private processService?: IProcessService
  ) {
    this.config = buildSchedulerConfig(schedulerConfig);
    this.statistics = new SchedulerStatistics();
    
    // Initialize async task management
    this.taskManager = new AsyncTaskManager(
      this.logger,
      this.timerService?.now.bind(this.timerService) || Date.now
    );
    
    // Initialize task completion handler
    this.completionHandler = new SchedulerTaskCompletionHandler(
      this.logger,
      this.statistics,
      this.config,
      () => this.isRunning,
      () => this.taskManager.getActiveTaskCount(),
      this.timerService
    );
    
    // Initialize SEDA builder
    const sedaConfig = loadSEDAConfig();
    this.builder = new SEDADataRequestBuilder(sedaConfig, this.logger);
    
    this.logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
    this.logger.info('│                    🔧 Scheduler Initialized                         │');
    this.logger.info('├─────────────────────────────────────────────────────────────────────┤');
    this.logger.info(`│ Network: ${sedaConfig.network.toUpperCase()}`);
    this.logger.info(`│ RPC Endpoint: ${sedaConfig.rpcEndpoint}`);
    this.logger.info('└─────────────────────────────────────────────────────────────────────┘');
    formatSchedulerConfig(this.config, this.logger);
  }

  /**
   * Initialize the scheduler (set up signer)
   */
  async initialize(): Promise<void> {
    this.logger.info('\n🔐 Initializing SEDA signer...');
    await this.builder.initialize();
    this.logger.info('✅ Scheduler initialization complete\n');
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('⚠️  Scheduler is already running');
      return;
    }

    this.logger.info('┌─────────────────────────────────────────────────────────────────────┐');
    this.logger.info('│                    🚀 SEDA DataRequest Scheduler                    │');
    this.logger.info('├─────────────────────────────────────────────────────────────────────┤');
    this.logger.info(`│ Status: Starting scheduler...`);
    this.logger.info(`│ Start Time: ${new Date().toISOString()}`);
    this.logger.info(`│ Interval: ${(this.config.intervalMs / 1000)}s`);
    this.logger.info(`│ Mode: ${this.config.continuous ? 'Continuous' : 'Single'}`);
    this.logger.info(`│ Max Retries: ${this.config.maxRetries}`);
    this.logger.info('└─────────────────────────────────────────────────────────────────────┘');
    
    this.isRunning = true;
    this.statistics.reset();

    // Launch first async task immediately (non-blocking)
    this.launchAsyncDataRequest();

    if (this.config.continuous) {
      // Schedule subsequent requests using timer service - each tick launches a new async task
      if (this.timerService) {
        this.intervalId = this.timerService.setInterval(() => {
          if (this.isRunning) {
            this.launchAsyncDataRequest();
          }
        }, this.config.intervalMs);
      } else {
        // Fallback to built-in setInterval - NO MORE ASYNC/AWAIT HERE!
        this.intervalId = setInterval(() => {
          if (this.isRunning) {
            this.launchAsyncDataRequest();
          }
        }, this.config.intervalMs) as unknown as TimerId;
      }

      this.logger.info(`\n🔄 Scheduler running continuously (${this.config.intervalMs / 1000}s intervals)`);
      this.logger.info('   Press Ctrl+C to stop gracefully');
      this.logger.info('   🚀 Each interval tick launches a new async DataRequest task');
      
      // Return immediately in continuous mode - don't wait for tasks!
      return;
    } else {
      this.logger.info('\n✅ Single DataRequest mode - stopping after completion');
      // Wait for the single task to complete, then stop
      const results = await this.taskManager.waitForAllTasks();
      this.stop();
    }
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      this.logger.warn('⚠️  Scheduler is not running');
      return;
    }

    this.logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
    this.logger.info('│                      🛑 Stopping Scheduler                         │');
    this.logger.info('└─────────────────────────────────────────────────────────────────────┘');
    
    this.isRunning = false;
    
    if (this.intervalId) {
      if (this.timerService) {
        this.timerService.clearInterval(this.intervalId);
      } else {
        clearInterval(this.intervalId);
      }
      this.intervalId = null;
    }

    // Log active tasks that are still running
    const activeTasks = this.taskManager.getActiveTaskCount();
    if (activeTasks > 0) {
      this.logger.info(`⏳ ${activeTasks} async tasks still running, they will complete in the background`);
    }

    this.statistics.printReport(this.logger);
    this.logger.info('✅ Scheduler stopped gracefully');
  }

  /**
   * Launch a new async DataRequest task (non-blocking)
   */
  private launchAsyncDataRequest(): void {
    if (!this.isRunning) return;

    this.taskManager.launchTask(
      this.builder,
      this.config,
      () => this.isRunning,
      this.completionHandler
    );
  }

  /**
   * Get current statistics
   */
  getStats(): SchedulerStats {
    const baseStats = this.statistics.getStats();
    const memoStats = this.taskManager.getMemoGeneratorStats();
    const sequenceStats = this.taskManager.getSequenceCoordinatorStats();
    
    return {
      ...baseStats,
      activeTasks: this.taskManager.getActiveTaskCount(),
      memoGenerator: {
        uptimeMs: memoStats.uptimeMs
      },
      sequenceCoordinator: {
        queueSize: sequenceStats.queueSize,
        isProcessing: sequenceStats.isProcessing,
        nextSequenceNumber: sequenceStats.nextSequenceNumber
      }
    };
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get count of active async tasks
   */
  getActiveTaskCount(): number {
    return this.taskManager.getActiveTaskCount();
  }

  /**
   * Wait for all active tasks to complete (useful for testing or shutdown)
   */
  async waitForAllTasks(): Promise<AsyncTaskResult[]> {
    return this.taskManager.waitForAllTasks();
  }
}

/**
 * Create and start a scheduler with environment-based configuration
 */
export async function startScheduler(
  overrides: Partial<SchedulerConfig> = {},
  timerService?: ITimerService,
  processService?: IProcessService
): Promise<SEDADataRequestScheduler> {
  // Use injected services or create defaults
  const { ServiceContainer } = await import('./services');
  const services = ServiceContainer.createProduction();
  const logger = services.loggingService;

  // Create scheduler with configuration loaded from environment and overrides
  const scheduler = new SEDADataRequestScheduler(overrides, logger, timerService, processService);

  // Initialize and start
  await scheduler.initialize();
  await scheduler.start();

  // Graceful shutdown handling
  if (processService) {
    // Use process service for shutdown handling
    processService.onShutdown(async () => {
      logger.info('\n🔔 Shutting down scheduler gracefully...');
      scheduler.stop();
    });
    processService.startSignalHandling();
  } else {
    // Fallback to direct process handling
    process.on('SIGINT', () => {
      logger.info('\n🔔 Received SIGINT, shutting down gracefully...');
      scheduler.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('\n🔔 Received SIGTERM, shutting down gracefully...');
      scheduler.stop();
      process.exit(0);
    });
  }

  return scheduler;
} 