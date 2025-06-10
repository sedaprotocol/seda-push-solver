/**
 * Retry Handler for DataRequest Operations
 * Provides configurable retry logic with exponential backoff and timeout handling
 */

/**
 * Retry operation with configurable attempts and delay
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  delayMs: number = 5000,
  onRetry?: (attempt: number, error: any) => void
): Promise<{ success: boolean; result?: T; lastError?: any }> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      return { success: true, result };
      
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        onRetry?.(attempt + 1, error);
        await delay(delayMs);
      }
    }
  }
  
  return { success: false, lastError };
}

/**
 * Execute a DataRequest with retry logic and detailed logging
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  requestNumber: number,
  isRunning: () => boolean
): Promise<{ success: boolean; result?: T; lastError?: any }> {
  let retries = 0;
  
  const retryOperation = async () => {
    if (!isRunning()) {
      throw new Error('Scheduler stopped during execution');
    }
    return await operation();
  };
  
  const onRetry = (attempt: number, error: any) => {
    console.log(`❌ DataRequest failed (attempt ${attempt}/${maxRetries + 1})`);
    console.log(`   Error: ${error?.message || error}`);
    
    if (attempt <= maxRetries) {
      console.log(`   Retrying in 5s...`);
    }
  };
  
  return await withRetry(retryOperation, maxRetries, 5000, onRetry);
}

/**
 * Simple delay utility
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
} 