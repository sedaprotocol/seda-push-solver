/**
 * Scheduler Configuration Management
 * Handles loading and validation of scheduler configuration from environment and overrides
 */

import type { SchedulerConfig } from '../../types';
import type { ILoggingService } from '../../services';

// Default scheduler configuration
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  intervalMs: 60_000, // 1 minute
  continuous: true,
  maxRetries: 3,
  memo: 'Scheduled DataRequest'
};

/**
 * Load scheduler configuration from environment variables
 */
export function loadSchedulerConfigFromEnv(): Partial<SchedulerConfig> {
  const envConfig: Partial<SchedulerConfig> = {};
  
  if (process.env.SCHEDULER_INTERVAL_SECONDS) {
    const intervalSeconds = parseInt(process.env.SCHEDULER_INTERVAL_SECONDS);
    if (!isNaN(intervalSeconds) && intervalSeconds > 0) {
      envConfig.intervalMs = intervalSeconds * 1000;
    }
  }
  
  if (process.env.SCHEDULER_MEMO) {
    envConfig.memo = process.env.SCHEDULER_MEMO;
  }
  
  if (process.env.SCHEDULER_MAX_RETRIES) {
    const maxRetries = parseInt(process.env.SCHEDULER_MAX_RETRIES);
    if (!isNaN(maxRetries) && maxRetries >= 0) {
      envConfig.maxRetries = maxRetries;
    }
  }
  
  if (process.env.SCHEDULER_CONTINUOUS) {
    envConfig.continuous = process.env.SCHEDULER_CONTINUOUS.toLowerCase() === 'true';
  }
  
  return envConfig;
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