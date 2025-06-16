/**
 * EVM Retry Handler
 * Handles retry logic for EVM operations with exponential backoff
 */

import type { EvmRetryOptions, EvmOperationResult } from './types';

/**
 * Default retry options for EVM operations
 */
export const DEFAULT_EVM_RETRY_OPTIONS: EvmRetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  exponentialBackoff: true,
  maxDelayMs: 30000
};

/**
 * Execute an EVM operation with retry logic
 */
export async function executeEvmOperationWithRetry<T>(
  operation: () => Promise<T>,
  options: Partial<EvmRetryOptions> = {},
  operationName: string = 'EVM operation'
): Promise<EvmOperationResult<T>> {
  const config = { ...DEFAULT_EVM_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      const result = await operation();
      return {
        success: true,
        data: result,
        attempt
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      console.error(`❌ ${operationName} failed (attempt ${attempt}/${config.maxRetries + 1}): ${lastError.message}`);

      // Don't delay after the last attempt
      if (attempt <= config.maxRetries) {
        const delay = config.exponentialBackoff 
          ? Math.min(config.baseDelayMs * Math.pow(2, attempt - 1), config.maxDelayMs)
          : config.baseDelayMs;
        
        console.log(`⏳ Retrying ${operationName} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  return {
    success: false,
    error: lastError,
    attempt: config.maxRetries + 1
  };
} 