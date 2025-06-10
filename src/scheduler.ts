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
  executeWithRetry
} from './core/scheduler';
import type { SchedulerConfig, SchedulerStats } from './types';
import type { ITimerService, IProcessService, TimerId } from './infrastructure';
import type { ILoggingService } from './services';
import { loadSEDAConfig } from './core/data-request';

/**
 * SEDA DataRequest Scheduler
 * 
 * Manages the automated posting of DataRequests to the SEDA network at regular intervals.
 * Provides retry logic, statistics tracking, and graceful shutdown capabilities.
 */
export class SEDADataRequestScheduler {
  private config: SchedulerConfig;
  private builder: SEDADataRequestBuilder;
  private isRunning: boolean = false;
  private intervalId: TimerId | null = null;
  private statistics: SchedulerStatistics;

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

    // Run first request immediately
    await this.executeDataRequest();

    if (this.config.continuous) {
      // Schedule subsequent requests using timer service
      if (this.timerService) {
        this.intervalId = this.timerService.setInterval(async () => {
          try {
            await this.executeDataRequest();
          } catch (error) {
            this.logger.error('❌ DataRequest execution failed:', error);
          }
        }, this.config.intervalMs);
      } else {
        // Fallback to built-in setInterval
        this.intervalId = setInterval(async () => {
          try {
            await this.executeDataRequest();
          } catch (error) {
            this.logger.error('❌ DataRequest execution failed:', error);
          }
        }, this.config.intervalMs) as unknown as TimerId;
      }

      this.logger.info(`\n🔄 Scheduler running continuously (${this.config.intervalMs / 1000}s intervals)`);
      this.logger.info('   Press Ctrl+C to stop gracefully');
    } else {
      this.logger.info('\n✅ Single DataRequest mode - stopping after completion');
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

    this.statistics.printReport(this.logger);
    this.logger.info('✅ Scheduler stopped gracefully');
  }

  /**
   * Execute a single DataRequest
   */
  private async executeDataRequest(): Promise<void> {
    if (!this.isRunning) return;

    const requestStartTime = this.timerService?.now() || Date.now();
    const currentStats = this.statistics.getStats();
    const requestNumber = currentStats.totalRequests + 1;
    
    this.logger.info('\n' + '='.repeat(73));
    this.logger.info(`📤 DataRequest #${requestNumber} | ${new Date().toLocaleTimeString()}`);
    this.logger.info('='.repeat(73));

    // Execute DataRequest with retry logic
    const { success, result, lastError } = await executeWithRetry(
      () => this.builder.postDataRequest({ memo: this.config.memo }),
      this.config.maxRetries,
      requestNumber,
      () => this.isRunning,
      this.logger
    );

    if (success && result) {
      this.logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
      this.logger.info('│                        ✅ Request Successful                        │');
      this.logger.info('├─────────────────────────────────────────────────────────────────────┤');
      this.logger.info(`│ Request ID: ${result.drId}`);
      this.logger.info(`│ Exit Code: ${result.exitCode}`);
      this.logger.info(`│ Block Height: ${result.blockHeight || 'N/A'}`);
      this.logger.info(`│ Gas Used: ${result.gasUsed || 'N/A'}`);
      this.logger.info('└─────────────────────────────────────────────────────────────────────┘');
      
      this.statistics.recordSuccess();
    } else {
      this.logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
      this.logger.info('│                         💥 Request Failed                          │');
      this.logger.info('├─────────────────────────────────────────────────────────────────────┤');
      this.logger.info(`│ Attempts: ${this.config.maxRetries + 1}`);
      this.logger.info(`│ Final Error: ${lastError?.message || 'Unknown error'}`);
      this.logger.info('└─────────────────────────────────────────────────────────────────────┘');
      
      this.statistics.recordFailure();
    }

    const requestTime = (this.timerService?.now() || Date.now()) - requestStartTime;
    this.logger.info(`\n⏱️  Duration: ${(requestTime / 1000).toFixed(1)}s`);

    if (this.config.continuous && this.isRunning) {
      const nextRequest = new Date((this.timerService?.now() || Date.now()) + this.config.intervalMs);
      this.logger.info(`⏭️  Next request: ${nextRequest.toLocaleTimeString()}`);
    }
  }

  /**
   * Get current statistics
   */
  getStats(): SchedulerStats {
    return this.statistics.getStats();
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
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