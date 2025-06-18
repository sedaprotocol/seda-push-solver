/**
 * Sequence Service
 * Domain service for managing sequence coordination and transaction ordering
 */

import type { LoggingServiceInterface } from '../../services';
import { isCosmosSequenceError } from '../../utils/transaction/cosmos-transaction-builder';

/**
 * Sequence coordination result
 */
export interface SequenceResult {
  success: boolean;
  sequenceNumber?: number;
  error?: string;
  retryable: boolean;
}

/**
 * Sequence Service
 * Encapsulates business logic for sequence coordination
 */
export class SequenceService {
  private sequenceCache = new Map<string, number>();
  private pendingSequences = new Set<string>();

  constructor(private logger: LoggingServiceInterface) {}

  /**
   * Reserve a sequence number for an account
   */
  async reserveSequence(accountAddress: string): Promise<SequenceResult> {
    this.logger.debug(`Reserving sequence for account ${accountAddress}`);

    // Check if there's already a pending sequence for this account
    if (this.pendingSequences.has(accountAddress)) {
      return {
        success: false,
        error: 'Sequence reservation already pending for this account',
        retryable: true
      };
    }

    try {
      // Get current sequence from cache or initialize
      const currentSequence = this.sequenceCache.get(accountAddress) || 0;
      const nextSequence = currentSequence + 1;

      // Mark as pending
      this.pendingSequences.add(accountAddress);

      // Update cache
      this.sequenceCache.set(accountAddress, nextSequence);

      this.logger.debug(`✅ Reserved sequence ${nextSequence} for account ${accountAddress}`);
      
      return {
        success: true,
        sequenceNumber: nextSequence,
        retryable: false
      };
    } catch (error) {
      this.pendingSequences.delete(accountAddress);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        error: errorMessage,
        retryable: !isCosmosSequenceError(errorMessage)
      };
    }
  }

  /**
   * Release a sequence reservation (on success or permanent failure)
   */
  releaseSequence(accountAddress: string, success: boolean): void {
    this.pendingSequences.delete(accountAddress);
    
    if (success) {
      this.logger.debug(`✅ Sequence confirmed for account ${accountAddress}`);
    } else {
      // Roll back the sequence number on failure
      const currentSequence = this.sequenceCache.get(accountAddress) || 0;
      if (currentSequence > 0) {
        this.sequenceCache.set(accountAddress, currentSequence - 1);
        this.logger.debug(`⚠️ Rolled back sequence for account ${accountAddress} to ${currentSequence - 1}`);
      }
    }
  }

  /**
   * Handle sequence error and determine retry strategy
   */
  handleSequenceError(error: Error | string, accountAddress: string): {
    shouldRetry: boolean;
    retryDelay: number;
    action: 'retry' | 'reset' | 'abort';
  } {
    const errorMessage = error instanceof Error ? error.message : error;
    
    if (isCosmosSequenceError(errorMessage)) {
      this.logger.warn(`Sequence error for ${accountAddress}: ${errorMessage}`);
      
      // Reset sequence cache for this account
      this.sequenceCache.delete(accountAddress);
      this.pendingSequences.delete(accountAddress);
      
      return {
        shouldRetry: true,
        retryDelay: 1000, // 1 second delay
        action: 'reset'
      };
    }

    // Non-sequence errors
    return {
      shouldRetry: false,
      retryDelay: 0,
      action: 'abort'
    };
  }

  /**
   * Get sequence statistics
   */
  getSequenceStatistics(): {
    totalAccounts: number;
    pendingReservations: number;
    highestSequence: number;
    accountSequences: Record<string, number>;
  } {
    const sequences = Object.fromEntries(this.sequenceCache);
    const highestSequence = Math.max(0, ...Array.from(this.sequenceCache.values()));

    return {
      totalAccounts: this.sequenceCache.size,
      pendingReservations: this.pendingSequences.size,
      highestSequence,
      accountSequences: sequences
    };
  }

  /**
   * Reset sequence cache for an account
   */
  resetAccountSequence(accountAddress: string): void {
    this.sequenceCache.delete(accountAddress);
    this.pendingSequences.delete(accountAddress);
    this.logger.info(`Reset sequence cache for account ${accountAddress}`);
  }

  /**
   * Clear all sequence data
   */
  clear(): void {
    this.sequenceCache.clear();
    this.pendingSequences.clear();
    this.logger.info('Cleared all sequence data');
  }

  /**
   * Check if account has pending sequence
   */
  hasPendingSequence(accountAddress: string): boolean {
    return this.pendingSequences.has(accountAddress);
  }

  /**
   * Get current sequence for account
   */
  getCurrentSequence(accountAddress: string): number {
    return this.sequenceCache.get(accountAddress) || 0;
  }
} 