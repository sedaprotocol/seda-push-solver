/**
 * Configuration Service Interface
 * Abstracts environment variable access and configuration loading for better testability
 */

import type { SedaConfig, SchedulerConfig, NetworkType } from '../types';

/**
 * Interface for configuration operations
 * Allows mocking environment variables and configuration loading
 */
export interface ConfigServiceInterface {
  /**
   * Get environment variable value
   */
  getEnvVar(key: string): string | undefined;

  /**
   * Get environment variable with default value
   */
  getEnvVarWithDefault(key: string, defaultValue: string): string;

  /**
   * Get environment variable as number
   */
  getEnvVarAsNumber(key: string): number | undefined;

  /**
   * Get environment variable as boolean
   */
  getEnvVarAsBoolean(key: string): boolean | undefined;

  /**
   * Load SEDA configuration from environment
   */
  loadSEDAConfig(): SedaConfig;

  /**
   * Load scheduler configuration from environment
   */
  loadSchedulerConfig(): Partial<SchedulerConfig>;
}

/**
 * Production implementation using actual environment variables
 */
export class ConfigService implements ConfigServiceInterface {
  getEnvVar(key: string): string | undefined {
    return process.env[key];
  }

  getEnvVarWithDefault(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue;
  }

  getEnvVarAsNumber(key: string): number | undefined {
    const value = process.env[key];
    if (!value) return undefined;
    
    const num = parseInt(value);
    return isNaN(num) ? undefined : num;
  }

  getEnvVarAsBoolean(key: string): boolean | undefined {
    const value = process.env[key];
    if (!value) return undefined;
    
    return value.toLowerCase() === 'true';
  }

  loadSEDAConfig(): SedaConfig {
    // Use the centralized config
    const { sedaConfig } = require('../../config');
    return sedaConfig;
  }

  loadSchedulerConfig(): Partial<SchedulerConfig> {
    const config: Partial<SchedulerConfig> = {};
    
    const intervalSeconds = this.getEnvVarAsNumber('SCHEDULER_INTERVAL_SECONDS');
    if (intervalSeconds && intervalSeconds > 0) {
      config.intervalMs = intervalSeconds * 1000;
    }
    
    const memo = this.getEnvVar('SCHEDULER_MEMO');
    if (memo) {
      config.memo = memo;
    }
    
    const maxRetries = this.getEnvVarAsNumber('SCHEDULER_MAX_RETRIES');
    if (maxRetries !== undefined && maxRetries >= 0) {
      config.maxRetries = maxRetries;
    }
    
    const continuous = this.getEnvVarAsBoolean('SCHEDULER_CONTINUOUS');
    if (continuous !== undefined) {
      config.continuous = continuous;
    }
    
    return config;
  }
}

 