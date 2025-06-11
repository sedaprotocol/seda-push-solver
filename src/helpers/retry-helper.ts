/**
 * Universal Retry Helper
 * Provides configurable retry logic with exponential backoff
 */

import type { ILoggingService } from '../services/logging-service';

/**
 * Execute operation with retry logic and exponential backoff
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number,
  initialDelayMs: number,
  backoffMultiplier: number = 2.0,
  maxDelayMs: number = 60_000,
  logger?: ILoggingService
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt >= maxAttempts) {
        // Last attempt failed
        break;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );
      
      if (logger) {
        logger.warn(`⚠️  Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`);
        logger.info(`   Retrying in ${delay}ms...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // All attempts failed
  if (logger) {
    logger.error(`❌ All ${maxAttempts} attempts failed. Last error: ${lastError!.message}`);
  }
  
  throw lastError!;
}

/**
 * Execute operation with retry logic and return result object
 */
export async function executeWithRetryResult<T>(
  operation: () => Promise<T>,
  maxAttempts: number,
  initialDelayMs: number,
  backoffMultiplier: number = 2.0,
  maxDelayMs: number = 60_000,
  logger?: ILoggingService
): Promise<{ success: boolean; result?: T; error?: Error; attempts: number }> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation();
      return { success: true, result, attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt >= maxAttempts) {
        // Last attempt failed
        break;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );
      
      if (logger) {
        logger.warn(`⚠️  Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`);
        logger.info(`   Retrying in ${delay}ms...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // All attempts failed
  return { 
    success: false, 
    error: lastError!, 
    attempts: maxAttempts 
  };
}

/**
 * Execute operation with timeout
 */
export async function executeWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = 'Operation timed out'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    
    operation()
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Execute operation with both retry and timeout
 */
export async function executeWithRetryAndTimeout<T>(
  operation: () => Promise<T>,
  maxAttempts: number,
  initialDelayMs: number,
  timeoutMs: number,
  backoffMultiplier: number = 2.0,
  maxDelayMs: number = 60_000,
  logger?: ILoggingService
): Promise<T> {
  return executeWithRetry(
    () => executeWithTimeout(operation, timeoutMs, `Operation timed out after ${timeoutMs}ms`),
    maxAttempts,
    initialDelayMs,
    backoffMultiplier,
    maxDelayMs,
    logger
  );
} 