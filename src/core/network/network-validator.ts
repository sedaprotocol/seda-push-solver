/**
 * Network Configuration Validation
 * Validation functions for network and DataRequest configurations
 */

import type { SEDADataRequestConfig } from '../../types';

/**
 * Validate DataRequest configuration
 */
export function validateDataRequestConfig(config: SEDADataRequestConfig): void {
  if (!config.oracleProgramId) {
    throw new Error('Oracle Program ID is required');
  }
  
  if (config.replicationFactor < 1) {
    throw new Error('Replication factor must be at least 1');
  }
  
  if (config.execGasLimit < 1_000_000) {
    throw new Error('Execution gas limit is too low');
  }
  
  if (config.timeoutSeconds < 10) {
    throw new Error('Timeout must be at least 10 seconds');
  }
  
  console.log('✅ DataRequest configuration is valid');
} 