/**
 * Unique Memo Generator for SEDA DataRequest Scheduler
 * Generates unique memos by appending sequence numbers to prevent DataRequest collisions
 */

import type { ILoggingService } from '../../services';

/**
 * Interface for unique memo metadata
 */
export interface UniqueMemoData {
  memo: string;
  sequenceNumber: number;
}

/**
 * Unique Memo Generator
 * Creates unique memos by appending sequence numbers to the base memo
 */
export class UniqueMemoGenerator {
  private readonly startTime = Date.now();

  constructor(private logger: ILoggingService) {}

  /**
   * Generate a unique memo using sequence number for uniqueness
   */
  generateUniqueMemo(baseMemo: string, sequenceNumber: number): UniqueMemoData {
    const memo = `${baseMemo} | seq:${sequenceNumber}`;
    
    this.logger.info(`🆔 Generated unique memo (seq: ${sequenceNumber}): "${memo}"`);
    
    return {
      memo,
      sequenceNumber
    };
  }

  /**
   * Get generator statistics
   */
  getStats() {
    return {
      uptimeMs: Date.now() - this.startTime
    };
  }

  /**
   * Reset generator state (for cleanup)
   */
  reset(): void {
    this.logger.info('🔄 Unique memo generator reset');
  }
} 