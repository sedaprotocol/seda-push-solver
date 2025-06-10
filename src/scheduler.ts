/**
 * SEDA DataRequest Scheduler
 * 
 * Provides scheduling functionality to continuously post DataRequests to the SEDA network
 * at regular intervals. Includes retry logic, statistics tracking, and graceful shutdown.
 */

import { loadSEDAConfig, SEDADataRequestBuilder } from './push-solver';

// Scheduler Configuration
export interface SchedulerConfig {
  // Interval between DataRequests (in milliseconds)
  intervalMs: number;
  
  // Whether to run continuously or stop after one request
  continuous: boolean;
  
  // Maximum number of retries for failed requests
  maxRetries: number;
  
  // Custom memo for DataRequests
  memo?: string;
}

// Default scheduler configuration
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  intervalMs: 60_000, // 1 minute
  continuous: true,
  maxRetries: 3,
  memo: 'Scheduled DataRequest'
};

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
  private intervalId: NodeJS.Timeout | null = null;
  private stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    startTime: Date.now()
  };

  /**
   * Create a new scheduler instance
   * @param schedulerConfig Partial configuration to override defaults
   */
  constructor(schedulerConfig: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...schedulerConfig };
    
    // Initialize SEDA builder
    const sedaConfig = loadSEDAConfig();
    this.builder = new SEDADataRequestBuilder(sedaConfig);
    
    console.log('🔧 SEDA DataRequest Scheduler initialized');
    console.log(`📊 Network: ${sedaConfig.network}`);
    console.log(`⏱️  Interval: ${this.config.intervalMs / 1000}s`);
    console.log(`📝 Memo: ${this.config.memo}`);
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
    this.stats.startTime = Date.now();

    // Run first request immediately
    await this.executeDataRequest();

    if (this.config.continuous) {
      // Schedule subsequent requests
      this.intervalId = setInterval(() => {
        this.executeDataRequest().catch(error => {
          console.error('❌ DataRequest execution failed:', error);
        });
      }, this.config.intervalMs);

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
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.printStats();
    console.log('✅ Scheduler stopped');
  }

  /**
   * Execute a single DataRequest
   */
  private async executeDataRequest(): Promise<void> {
    if (!this.isRunning) return;

    const requestStartTime = Date.now();
    
    console.log(`\n📤 DataRequest ${this.stats.totalRequests + 1} - ${new Date().toISOString()}`);

    let success = false;
    let retries = 0;
    let lastError: any;

    // Retry logic
    while (!success && retries <= this.config.maxRetries && this.isRunning) {
      try {
        const result = await this.builder.postDataRequest({
          memo: this.config.memo
        });

        console.log(`✅ DataRequest completed successfully`);
        console.log(`   DR ID: ${result.drId}`);
        console.log(`   Exit Code: ${result.exitCode}`);
        console.log(`   Block Height: ${result.blockHeight}`);
        console.log(`   Gas Used: ${result.gasUsed}`);

        this.stats.successfulRequests++;
        success = true;

      } catch (error) {
        lastError = error;
        retries++;
        
        if (retries <= this.config.maxRetries) {
          console.log(`❌ DataRequest failed (attempt ${retries}/${this.config.maxRetries + 1})`);
          console.log(`   Retrying in 5s...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }

    if (!success) {
      console.log(`💥 DataRequest failed after ${this.config.maxRetries + 1} attempts`);
      console.log(`   Final error: ${lastError?.message || lastError}`);
      this.stats.failedRequests++;
    }

    this.stats.totalRequests++;

    const requestTime = Date.now() - requestStartTime;
    console.log(`⏱️  Request duration: ${(requestTime / 1000).toFixed(1)}s`);

    if (this.config.continuous && this.isRunning) {
      const nextRequest = new Date(Date.now() + this.config.intervalMs);
      console.log(`⏭️  Next DataRequest at: ${nextRequest.toISOString()}`);
    }
  }

  /**
   * Print overall statistics
   */
  private printStats(): void {
    const runtime = Date.now() - this.stats.startTime;
    const runtimeMinutes = (runtime / 60000).toFixed(1);
    
    console.log('\n📈 SCHEDULER STATISTICS');
    console.log('='.repeat(50));
    console.log(`⏱️  Total Runtime: ${runtimeMinutes} minutes`);
    console.log(`📊 Total Requests: ${this.stats.totalRequests}`);
    console.log(`✅ Successful: ${this.stats.successfulRequests}`);
    console.log(`❌ Failed: ${this.stats.failedRequests}`);
    
    if (this.stats.totalRequests > 0) {
      const successRate = (this.stats.successfulRequests / this.stats.totalRequests) * 100;
      console.log(`📈 Overall Success Rate: ${successRate.toFixed(1)}%`);
    }
    
    console.log('='.repeat(50));
  }

  /**
   * Get current statistics
   */
  getStats() {
    return { ...this.stats };
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
export async function startScheduler(overrides: Partial<SchedulerConfig> = {}): Promise<SEDADataRequestScheduler> {
  // Load configuration from environment variables
  const envConfig: Partial<SchedulerConfig> = {};
  
  if (process.env.SCHEDULER_INTERVAL_SECONDS) {
    envConfig.intervalMs = parseInt(process.env.SCHEDULER_INTERVAL_SECONDS) * 1000;
  }
  
  if (process.env.SCHEDULER_MEMO) {
    envConfig.memo = process.env.SCHEDULER_MEMO;
  }

  // Create scheduler with combined configuration
  const scheduler = new SEDADataRequestScheduler({
    ...envConfig,
    ...overrides
  });

  // Initialize and start
  await scheduler.initialize();
  await scheduler.start();

  // Graceful shutdown handling
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

  return scheduler;
} 