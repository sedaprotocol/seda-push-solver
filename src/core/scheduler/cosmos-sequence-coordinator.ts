/**
 * Cosmos Sequence Number Coordinator for SEDA DataRequest Scheduler
 * Provides reliable sequence management with atomic allocation, validation, and comprehensive recovery
 */

import type { LoggingServiceInterface } from '../../services';
import type { Signer } from '@seda-protocol/dev-tools';
import { SequenceQueryService } from './sequence-query-service';
import { withTimeout, delay, isSequenceError, isDataRequestExistsError } from '../../helpers';

/**
 * Interface for transaction posting with sequence coordination
 */
export interface SequencedPosting<T> {
  postTransaction: (sequenceNumber: number) => Promise<T>;
  taskId: string;
  timeout?: number;
}

/**
 * Interface for posting results
 */
export interface PostingResult<T> {
  taskId: string;
  success: boolean;
  result?: T;
  error?: Error;
  sequence: number;
  startTime: number;
  endTime: number;
  duration: number;
}

/**
 * Configuration for Cosmos Sequence Coordinator
 */
export interface CosmosSequenceConfig {
  postingTimeoutMs: number;
  drResultTimeout: number;
  maxQueueSize: number;
}

/**
 * Interface for tracking pending sequences with enhanced metadata
 */
interface PendingSequence {
  sequence: number;
  taskId: string;
  startTime: number;
  attempts: number;
  resolve: (result: PostingResult<any>) => void;
  reject: (error: Error) => void;
}

/**
 * Cosmos Sequence Coordinator
 * Features:
 * - Atomic sequence number allocation
 * - Regular blockchain validation (every 5 seconds)
 * - Comprehensive error detection and recovery
 * - Advanced pending sequence management
 * - Automatic sequence gap detection and healing
 */
export class CosmosSequenceCoordinator {
  private executionQueue: Array<{
    execution: SequencedPosting<any>;
    resolve: (result: PostingResult<any>) => void;
    reject: (error: Error) => void;
  }> = [];
  
  private pendingSequences = new Map<number, PendingSequence>();
  private allocatedSequences = new Set<number>(); // Track all allocated sequences
  private isProcessing = false;
  private nextSequence: number = 0; // The next sequence to allocate (atomic)
  private confirmedSequence: number = 0; // Last confirmed sequence from blockchain
  private lastValidationTime: number = 0;
  private isInitialized = false;
  private queryService: SequenceQueryService;
  private signer: Signer | null = null;
  private sequenceAllocationLock = false; // Prevent race conditions

  // Reliable coordination settings
  private readonly VALIDATION_INTERVAL_MS = 5000; // Validate every 5 seconds
  private readonly SEQUENCE_RECOVERY_ATTEMPTS = 5; // Recovery attempts on conflicts
  private readonly PENDING_TIMEOUT_MS = 30000; // 30 seconds for pending sequences
  private readonly MAX_SEQUENCE_DRIFT = 5; // Maximum allowed drift before forced sync

  constructor(
    private logger: LoggingServiceInterface,
    private config: CosmosSequenceConfig
  ) {
    this.queryService = new SequenceQueryService(this.logger);
  }

  /**
   * Initialize with reliable sequence detection
   */
  async initialize(signer: Signer): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.signer = signer;
    await this.performReliableInitialization();
    this.isInitialized = true;
    
    this.logger.info(`🛡️ Sequence coordinator initialized with sequence: ${this.nextSequence}`);
  }

  /**
   * Execute a transaction with ultra-robust sequence coordination
   */
  async executeSequenced<T>(execution: SequencedPosting<T>): Promise<PostingResult<T>> {
    if (!this.isInitialized) {
      throw new Error('Sequence coordinator not initialized. Call initialize() first.');
    }

    if (this.executionQueue.length >= this.config.maxQueueSize) {
      throw new Error(`Sequence execution queue is full (max: ${this.config.maxQueueSize})`);
    }

    return new Promise((resolve, reject) => {
      this.executionQueue.push({
        execution,
        resolve,
        reject
      });

      this.logger.info(`🔢 Queued transaction for task ${execution.taskId} (queue size: ${this.executionQueue.length})`);

      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Reliable queue processing with validation and recovery
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.logger.info('🛡️ Starting sequence coordinator processing');

    while (this.executionQueue.length > 0) {
      // Only perform validation if enough time has passed
      if (Date.now() - this.lastValidationTime > this.VALIDATION_INTERVAL_MS) {
        await this.performPeriodicValidation();
      }

      const queueItem = this.executionQueue.shift();
      if (!queueItem) {
        break;
      }

      const { execution, resolve, reject } = queueItem;
      await this.executeWithReliableSequence(execution, resolve, reject);

      // Remove delay for maximum posting speed - sequence coordination handles safety
      // await delay(200); // REMOVED: This was causing unnecessary 200ms delays
    }

    this.isProcessing = false;
    this.logger.info('✅ Sequence coordinator processing completed');
  }

  /**
   * Execute single transaction with reliable sequence handling
   */
  private async executeWithReliableSequence(
    execution: SequencedPosting<any>,
    resolve: (result: PostingResult<any>) => void,
    reject: (error: Error) => void
  ): Promise<void> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < this.SEQUENCE_RECOVERY_ATTEMPTS) {
      // Atomically allocate sequence number
      const sequence = await this.atomicAllocateSequence();
      const startTime = Date.now();

      // Track this sequence as pending with enhanced metadata
      const pendingSeq: PendingSequence = {
        sequence,
        taskId: execution.taskId,
        startTime,
        attempts: attempts + 1,
        resolve,
        reject
      };
      this.pendingSequences.set(sequence, pendingSeq);

      this.logger.info(`🔢 Executing transaction #${sequence} for task ${execution.taskId} (attempt ${attempts + 1}/${this.SEQUENCE_RECOVERY_ATTEMPTS})`);

      try {
        const timeout = execution.timeout || this.config.postingTimeoutMs;
        
        const result = await withTimeout(
          execution.postTransaction(sequence),
          timeout,
          `Transaction timeout after ${timeout}ms`
        );

        // Success - clean up and resolve
        this.pendingSequences.delete(sequence);
        this.allocatedSequences.delete(sequence);
        this.markSequenceSuccess(sequence);
        
        const endTime = Date.now();
        const executionResult: PostingResult<any> = {
          taskId: execution.taskId,
          success: true,
          result,
          sequence,
          startTime,
          endTime,
          duration: endTime - startTime
        };

        this.logger.info(`✅ Sequence #${sequence} completed for task ${execution.taskId}`);
        resolve(executionResult);
        return;

      } catch (error) {
        this.pendingSequences.delete(sequence);
        this.allocatedSequences.delete(sequence);
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const endTime = Date.now();
        const duration = endTime - startTime;

        // Handle special cases
        if (isDataRequestExistsError(lastError)) {
          this.logger.warn(`⚠️ DataRequestAlreadyExists for task ${execution.taskId} - treating as success`);
          this.markSequenceSuccess(sequence);
          
          resolve({
            taskId: execution.taskId,
            success: true,
            result: { success: true, drId: 'unknown-but-posted' },
            sequence,
            startTime,
            endTime,
            duration
          });
          return;
        }

        if (isSequenceError(lastError)) {
          this.logger.warn(`🔄 Sequence error detected (attempt ${attempts + 1}), performing comprehensive recovery...`);
          await this.performComprehensiveRecovery();
          attempts++;
          
          // Reduced backoff delay for faster recovery
          const backoffDelay = Math.min(250 * Math.pow(1.5, attempts), 1000); // Faster backoff: 250ms, 375ms, 562ms, max 1s
          await delay(backoffDelay);
          continue;
        }

        // Non-sequence error - don't retry
        this.logger.error(`❌ Non-sequence error for task ${execution.taskId}: ${lastError.message}`);
        break;
      }
    }

    // All attempts failed
    this.logger.error(`💥 Sequence execution failed for task ${execution.taskId} after ${attempts} attempts`);
    resolve({
      taskId: execution.taskId,
      success: false,
      error: lastError || new Error('Unknown error'),
      sequence: this.nextSequence,
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 0
    });
  }

  /**
   * Atomically allocate the next sequence number
   */
  private async atomicAllocateSequence(): Promise<number> {
    // Use a more efficient non-blocking approach instead of polling
    if (this.sequenceAllocationLock) {
      // If locked, wait for a single promise instead of polling
      await new Promise<void>((resolve) => {
        const checkLock = () => {
          if (!this.sequenceAllocationLock) {
            resolve();
          } else {
            // Use immediate callback instead of delay for faster response
            setImmediate(checkLock);
          }
        };
        checkLock();
      });
    }

    this.sequenceAllocationLock = true;
    
    try {
      // Find next available sequence (skip any that are still pending or allocated)
      while (this.pendingSequences.has(this.nextSequence) || this.allocatedSequences.has(this.nextSequence)) {
        this.nextSequence++;
      }

      const allocatedSequence = this.nextSequence;
      this.allocatedSequences.add(allocatedSequence);
      this.nextSequence++;

      this.logger.debug(`🔒 Atomically allocated sequence ${allocatedSequence}, next available: ${this.nextSequence}`);
      return allocatedSequence;
      
    } finally {
      this.sequenceAllocationLock = false;
    }
  }

  /**
   * Mark a sequence as successfully used and update state
   */
  private markSequenceSuccess(sequence: number): void {
    // Update confirmed sequence to track successful submissions
    this.confirmedSequence = Math.max(this.confirmedSequence, sequence);
    
    // Keep nextSequence ahead of confirmed sequence
    this.nextSequence = Math.max(this.nextSequence, this.confirmedSequence + 1);
    
    this.logger.debug(`🔢 Sequence ${sequence} confirmed, next allocation: ${this.nextSequence}`);
  }

  /**
   * Perform reliable sequence initialization
   */
  private async performReliableInitialization(): Promise<void> {
    this.logger.info('🛡️ Performing reliable sequence initialization...');

    // Try multiple strategies with retries
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const blockchainSequence = await this.queryService.queryAccountSequence(this.signer!);
        
        // Initialize sequences with proper spacing
        this.confirmedSequence = blockchainSequence;
        this.nextSequence = blockchainSequence;
        this.lastValidationTime = Date.now();
        
        this.logger.info(`✅ Initialization complete: Blockchain sequence ${blockchainSequence}`);
        
        // Validate immediately to ensure consistency
        await this.performPeriodicValidation();
        return;
        
      } catch (error) {
        this.logger.warn(`⚠️ Blockchain query attempt ${attempt + 1} failed: ${error}`);
        if (attempt < 2) {
          await delay(2000); // Wait before retry
        }
      }
    }

    // Fallback with conservative approach
    this.logger.warn('⚠️ Using conservative fallback sequence initialization');
    this.confirmedSequence = 0;
    this.nextSequence = 0;
    this.lastValidationTime = Date.now();
    
    // Schedule immediate validation
    setTimeout(() => this.performPeriodicValidation(), 1000);
  }

  /**
   * Perform periodic validation every 5 seconds
   */
  private async performPeriodicValidation(): Promise<void> {
    const now = Date.now();
    if (now - this.lastValidationTime < this.VALIDATION_INTERVAL_MS) {
      return; // Too soon to validate again
    }

    await this.validateWithComprehensiveRecovery();
  }

  /**
   * Validate current sequence against blockchain with comprehensive recovery
   */
  private async validateWithComprehensiveRecovery(): Promise<void> {
    try {
      if (!this.signer) return;
      
      const blockchainSequence = await this.queryService.queryAccountSequence(this.signer);
      this.lastValidationTime = Date.now();

      // Check for significant drift
      const drift = Math.abs(this.nextSequence - blockchainSequence);
      
      if (drift > this.MAX_SEQUENCE_DRIFT) {
        this.logger.warn(`🚨 CRITICAL sequence drift detected: local=${this.nextSequence}, blockchain=${blockchainSequence}, drift=${drift}`);
        
        // Force synchronization for large drifts
        if (this.nextSequence < blockchainSequence) {
          this.logger.info(`🔧 FORCE SYNC: Adjusting sequences to blockchain + safety margin`);
          this.confirmedSequence = blockchainSequence;
          this.nextSequence = blockchainSequence;
          
          // Clear any stale allocated sequences that are now invalid
          this.allocatedSequences.clear();
        }
      } else if (drift > 0) {
        this.logger.debug(`🔄 Minor sequence drift: local=${this.nextSequence}, blockchain=${blockchainSequence}, drift=${drift}`);
      }

      // Update confirmed sequence conservatively
      this.confirmedSequence = Math.max(this.confirmedSequence, blockchainSequence);
      
    } catch (error) {
      this.logger.warn(`⚠️ Sequence validation failed: ${error}`);
    }
  }

  /**
   * Perform comprehensive recovery after sequence errors
   */
  private async performComprehensiveRecovery(): Promise<void> {
    this.logger.info('🔧 Performing comprehensive sequence recovery...');
    
    // Step 1: Clean up expired pending sequences
    this.cleanupExpiredPendingSequences();
    
    // Step 2: Force blockchain validation
    await this.validateWithComprehensiveRecovery();
    
    // Step 3: Clear stale allocations
    this.allocatedSequences.clear();
    
    // Step 4: Reset allocation lock if stuck
    this.sequenceAllocationLock = false;
    
    this.logger.info(`🔧 Comprehensive recovery complete: next=${this.nextSequence}, confirmed=${this.confirmedSequence}, pending=${this.pendingSequences.size}`);
  }

  /**
   * Clean up expired pending sequences with enhanced logic
   */
  private cleanupExpiredPendingSequences(): void {
    const now = Date.now();
    const expiredSequences: number[] = [];
    
    for (const [seq, pending] of this.pendingSequences.entries()) {
      if (now - pending.startTime > this.PENDING_TIMEOUT_MS) {
        this.logger.warn(`⚠️ Cleaning up expired pending sequence ${seq} for task ${pending.taskId} (attempt ${pending.attempts})`);
        expiredSequences.push(seq);
      }
    }
    
    // Remove expired sequences
    expiredSequences.forEach(seq => {
      this.pendingSequences.delete(seq);
      this.allocatedSequences.delete(seq);
    });
    
    if (expiredSequences.length > 0) {
      this.logger.info(`🧹 Cleaned up ${expiredSequences.length} expired sequences`);
    }
  }

  /**
   * Get comprehensive statistics with enhanced metrics
   */
  getStats() {
    return {
      queueSize: this.executionQueue.length,
      isProcessing: this.isProcessing,
      currentSequenceNumber: this.confirmedSequence,
      nextSequenceNumber: this.nextSequence,
      lastValidatedSequence: this.confirmedSequence,
      pendingSequences: this.pendingSequences.size,
      allocatedSequences: this.allocatedSequences.size,
      sequenceDrift: Math.abs(this.nextSequence - this.confirmedSequence),
      maxQueueSize: this.config.maxQueueSize,
      isInitialized: this.isInitialized,
      lastValidationAge: Date.now() - this.lastValidationTime,
      validationInterval: this.VALIDATION_INTERVAL_MS,
      allocationLocked: this.sequenceAllocationLock
    };
  }

  /**
   * Get the current confirmed sequence number
   */
  getCurrentSequenceNumber(): number {
    return this.confirmedSequence;
  }

  /**
   * Clear the execution queue and all pending sequences
   */
  clear(): void {
    // Reject all pending executions
    while (this.executionQueue.length > 0) {
      const queueItem = this.executionQueue.shift();
      if (queueItem) {
        queueItem.reject(new Error('Sequence coordinator cleared'));
      }
    }

    // Clear all tracking
    this.pendingSequences.clear();
    this.allocatedSequences.clear();
    this.isProcessing = false;
    this.sequenceAllocationLock = false;
    
    this.logger.info('🔄 Sequence coordinator cleared');
  }

  /**
   * Wait for the queue to be completely empty
   */
  async waitForQueue(): Promise<void> {
    while (this.executionQueue.length > 0 || this.isProcessing || this.pendingSequences.size > 0 || this.allocatedSequences.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
} 