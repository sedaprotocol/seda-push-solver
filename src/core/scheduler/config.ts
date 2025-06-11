/**
 * Scheduler Configuration Management
 * Handles loading and validation of scheduler configuration from environment and overrides
 */

import type { SchedulerConfig } from '../../types';
import type { ILoggingService } from '../../services';

// Default scheduler configuration
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  intervalMs: 30000, // 30 seconds
  continuous: true, // Run continuously by default
  maxRetries: 3,
  memo: 'SEDA DataRequest',
  cosmosSequence: {
    postingTimeoutMs: 20000, // 20 seconds for posting transaction
    defaultTimeoutMs: 60000, // 60 seconds default timeout
    maxQueueSize: 100 // Maximum 100 items in sequence queue
  }
};

/**
 * Load scheduler configuration from environment variables
 */
export function loadSchedulerConfigFromEnv(): Partial<SchedulerConfig> {
  const config: Partial<SchedulerConfig> = {};

  // Basic scheduler settings
  if (process.env.SCHEDULER_INTERVAL_MS) {
    config.intervalMs = parseInt(process.env.SCHEDULER_INTERVAL_MS, 10);
  }

  if (process.env.SCHEDULER_CONTINUOUS) {
    config.continuous = process.env.SCHEDULER_CONTINUOUS.toLowerCase() === 'true';
  }

  if (process.env.SCHEDULER_MAX_RETRIES) {
    config.maxRetries = parseInt(process.env.SCHEDULER_MAX_RETRIES, 10);
  }

  if (process.env.SCHEDULER_MEMO) {
    config.memo = process.env.SCHEDULER_MEMO;
  }

  // Cosmos sequence configuration
  const cosmosSequence: Partial<SchedulerConfig['cosmosSequence']> = {};
  
  if (process.env.COSMOS_POSTING_TIMEOUT_MS) {
    cosmosSequence.postingTimeoutMs = parseInt(process.env.COSMOS_POSTING_TIMEOUT_MS, 10);
  }
  
  if (process.env.COSMOS_DEFAULT_TIMEOUT_MS) {
    cosmosSequence.defaultTimeoutMs = parseInt(process.env.COSMOS_DEFAULT_TIMEOUT_MS, 10);
  }
  
  if (process.env.COSMOS_MAX_QUEUE_SIZE) {
    cosmosSequence.maxQueueSize = parseInt(process.env.COSMOS_MAX_QUEUE_SIZE, 10);
  }

  // Only add cosmosSequence if we have at least one value
  if (Object.keys(cosmosSequence).length > 0) {
    config.cosmosSequence = {
      ...DEFAULT_SCHEDULER_CONFIG.cosmosSequence,
      ...cosmosSequence
    };
  }

  return config;
}

/**
 * Build final scheduler configuration by merging defaults, environment, and overrides
 */
export function buildSchedulerConfig(
  overrides: Partial<SchedulerConfig> = {}
): SchedulerConfig {
  const envConfig = loadSchedulerConfigFromEnv();
  
  return {
    ...DEFAULT_SCHEDULER_CONFIG,
    ...envConfig,
    ...overrides
  };
}

/**
 * Format scheduler configuration for display
 */
export function formatSchedulerConfig(config: SchedulerConfig, logger?: ILoggingService): void {
  if (logger) {
    logger.info('🔧 SEDA DataRequest Scheduler Configuration:');
    logger.info(`   ⏱️  Interval: ${config.intervalMs / 1000}s`);
    logger.info(`   🔄 Continuous: ${config.continuous}`);
    logger.info(`   🔁 Max Retries: ${config.maxRetries}`);
    logger.info(`   📝 Memo: ${config.memo}`);
  } else {
    console.log('🔧 SEDA DataRequest Scheduler Configuration:');
    console.log(`   ⏱️  Interval: ${config.intervalMs / 1000}s`);
    console.log(`   🔄 Continuous: ${config.continuous}`);
    console.log(`   🔁 Max Retries: ${config.maxRetries}`);
    console.log(`   📝 Memo: ${config.memo}`);
  }
} 