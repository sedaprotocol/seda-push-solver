/**
 * SEDA DataRequest Scheduler
 * 
 * Provides scheduling functionality to continuously post DataRequests to the SEDA network
 * at regular intervals. Includes retry logic, statistics tracking, and graceful shutdown.
 */

import { loadSEDAConfig, SEDADataRequestBuilder } from './push-solver';
import { 
  buildSchedulerConfig, 
  formatSchedulerConfig,
  SchedulerStatistics,
  executeWithRetry
} from './core/scheduler';
import type { SchedulerConfig, SchedulerStats } from './types';
import type { ITimerService, IProcessService, TimerId } from './infrastructure';

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
   * @param timerService Timer service for scheduling (defaults to production timer)
   * @param processService Process service for shutdown handling (defaults to production process)
   */
  constructor(
    schedulerConfig: Partial<SchedulerConfig> = {},
    private timerService?: ITimerService,
    private processService?: IProcessService
  ) {
    this.config = buildSchedulerConfig(schedulerConfig);
    this.statistics = new SchedulerStatistics();
    
    // Initialize SEDA builder
    const sedaConfig = loadSEDAConfig();
    this.builder = new SEDADataRequestBuilder(sedaConfig);
    
    console.log('🔧 SEDA DataRequest Scheduler initialized');
    console.log(`📊 Network: ${sedaConfig.network}`);
    formatSchedulerConfig(this.config);
  }

  /**
   * Initialize the scheduler (set up signer)
   */
  async initialize(): Promise<void> {
    console.log('🔐 Initializing SEDA signer...');
    await this.builder.initialize();
    console.log('✅ Scheduler ready to start posting DataRequests');
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Scheduler is already running');
      return;
    }

    console.log('\n🚀 Starting SEDA DataRequest Scheduler...');
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    
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
            console.error('❌ DataRequest execution failed:', error);
          }
        }, this.config.intervalMs);
      } else {
        // Fallback to built-in setInterval
        this.intervalId = setInterval(async () => {
          try {
            await this.executeDataRequest();
          } catch (error) {
            console.error('❌ DataRequest execution failed:', error);
          }
        }, this.config.intervalMs) as unknown as TimerId;
      }

      console.log(`🔄 Scheduler running continuously every ${this.config.intervalMs / 1000}s`);
    } else {
      console.log('✅ Single DataRequest completed');
      this.stop();
    }
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('⚠️  Scheduler is not running');
      return;
    }

    console.log('\n🛑 Stopping SEDA DataRequest Scheduler...');
    
    this.isRunning = false;
    
    if (this.intervalId) {
      if (this.timerService) {
        this.timerService.clearInterval(this.intervalId);
      } else {
        clearInterval(this.intervalId);
      }
      this.intervalId = null;
    }

    this.statistics.printReport();
    console.log('✅ Scheduler stopped');
  }

  /**
   * Execute a single DataRequest
   */
  private async executeDataRequest(): Promise<void> {
    if (!this.isRunning) return;

    const requestStartTime = this.timerService?.now() || Date.now();
    const currentStats = this.statistics.getStats();
    const requestNumber = currentStats.totalRequests + 1;
    
    console.log(`\n📤 DataRequest ${requestNumber} - ${new Date().toISOString()}`);

    // Execute DataRequest with retry logic
    const { success, result, lastError } = await executeWithRetry(
      () => this.builder.postDataRequest({ memo: this.config.memo }),
      this.config.maxRetries,
      requestNumber,
      () => this.isRunning
    );

    if (success && result) {
      console.log(`✅ DataRequest completed successfully`);
      console.log(`   DR ID: ${result.drId}`);
      console.log(`   Exit Code: ${result.exitCode}`);
      console.log(`   Block Height: ${result.blockHeight}`);
      console.log(`   Gas Used: ${result.gasUsed}`);
      
      this.statistics.recordSuccess();
    } else {
      console.log(`💥 DataRequest failed after ${this.config.maxRetries + 1} attempts`);
      console.log(`   Final error: ${lastError?.message || lastError}`);
      
      this.statistics.recordFailure();
    }

    const requestTime = (this.timerService?.now() || Date.now()) - requestStartTime;
    console.log(`⏱️  Request duration: ${(requestTime / 1000).toFixed(1)}s`);

    if (this.config.continuous && this.isRunning) {
      const nextRequest = new Date((this.timerService?.now() || Date.now()) + this.config.intervalMs);
      console.log(`⏭️  Next DataRequest at: ${nextRequest.toISOString()}`);
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
  // Create scheduler with configuration loaded from environment and overrides
  const scheduler = new SEDADataRequestScheduler(overrides, timerService, processService);

  // Initialize and start
  await scheduler.initialize();
  await scheduler.start();

  // Graceful shutdown handling
  if (processService) {
    // Use process service for shutdown handling
    processService.onShutdown(async () => {
      console.log('\n🔔 Shutting down scheduler gracefully...');
      scheduler.stop();
    });
    processService.startSignalHandling();
  } else {
    // Fallback to direct process handling
    process.on('SIGINT', () => {
      console.log('\n🔔 Received SIGINT, shutting down gracefully...');
      scheduler.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n🔔 Received SIGTERM, shutting down gracefully...');
      scheduler.stop();
      process.exit(0);
    });
  }

  return scheduler;
} 