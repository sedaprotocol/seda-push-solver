/**
 * DataRequest Completion Tracker
 * Tracks completed DataRequests and their batch assignments for EVM pushing
 */

import type { ILoggingService } from './logging-service';
import type { IBatchService } from './batch-service';
import type { AsyncTaskResult } from '../core/scheduler/types';
import type { BatchTrackingInfo } from '../types/evm-types';
import { EventEmitter } from 'events';

/**
 * Interface for DataRequest completion tracking
 */
export interface IDataRequestCompletionTracker {
  /**
   * Initialize the tracker
   */
  initialize(batchService: IBatchService): Promise<void>;

  /**
   * Track a completed DataRequest
   */
  trackCompletion(result: AsyncTaskResult): Promise<void>;

  /**
   * Get all tracked DataRequests waiting for batch assignment
   */
  getPendingDataRequests(): CompletedDataRequest[];

  /**
   * Get DataRequests that have been assigned to batches
   */
  getBatchAssignedDataRequests(): DataRequestBatchAssignment[];

  /**
   * Check for new batch assignments (periodic task)
   */
  checkForBatchAssignments(): Promise<void>;

  /**
   * Get completion statistics
   */
  getStatistics(): CompletionTrackerStatistics;

  /**
   * Register event listener for batch assignments
   */
  on(event: 'batch-assignment', listener: (assignment: DataRequestBatchAssignment) => void): void;
  on(event: 'batch-ready-for-pushing', listener: (batch: BatchTrackingInfo) => void): void;
}

/**
 * Represents a completed DataRequest waiting for batch assignment
 */
export interface CompletedDataRequest {
  taskId: string;
  drId: string;
  blockHeight: bigint;
  txHash: string;
  completedAt: number;
  sequenceNumber?: number;
  memo?: string;
}

/**
 * Represents a DataRequest that has been assigned to a batch
 */
export interface DataRequestBatchAssignment {
  dataRequest: CompletedDataRequest;
  batch: BatchTrackingInfo;
  assignedAt: number;
}

/**
 * Statistics for the completion tracker
 */
export interface CompletionTrackerStatistics {
  totalCompletions: number;
  pendingAssignments: number;
  batchAssignments: number;
  averageAssignmentTimeMs: number;
  recentCompletions: CompletedDataRequest[];
  recentAssignments: DataRequestBatchAssignment[];
}

/**
 * Production implementation of DataRequest completion tracker
 */
export class DataRequestCompletionTracker extends EventEmitter implements IDataRequestCompletionTracker {
  private batchService: IBatchService | null = null;
  private pendingDataRequests = new Map<string, CompletedDataRequest>(); // drId -> CompletedDataRequest
  private batchAssignments = new Map<string, DataRequestBatchAssignment>(); // drId -> Assignment
  private lastBatchCheck = 0;
  private statistics: CompletionTrackerStatistics;
  private readonly BATCH_CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds
  private readonly MAX_PENDING_AGE_MS = 3600_000; // 1 hour max age for pending DRs

  constructor(private logger: ILoggingService) {
    super();
    
    this.statistics = {
      totalCompletions: 0,
      pendingAssignments: 0,
      batchAssignments: 0,
      averageAssignmentTimeMs: 0,
      recentCompletions: [],
      recentAssignments: []
    };

    this.logger.info('📋 DataRequest completion tracker initialized');
  }

  async initialize(batchService: IBatchService): Promise<void> {
    if (!batchService.isInitialized()) {
      throw new Error('BatchService must be initialized before DataRequestCompletionTracker');
    }

    this.batchService = batchService;
    this.logger.info('📋 DataRequest completion tracker initialized with batch service');
  }

  async trackCompletion(result: AsyncTaskResult): Promise<void> {
    if (!result.success || !result.drId || result.blockHeight === undefined) {
      this.logger.debug(`⏭️  Skipping failed or incomplete DataRequest: ${result.taskId}`);
      return;
    }

    const completedDataRequest: CompletedDataRequest = {
      taskId: result.taskId,
      drId: result.drId,
      blockHeight: BigInt(result.blockHeight),
      txHash: '', // TODO: Extract from result if available
      completedAt: result.completedAt,
      sequenceNumber: result.sequenceNumber
    };

    this.pendingDataRequests.set(result.drId, completedDataRequest);
    this.statistics.totalCompletions++;
    this.statistics.pendingAssignments = this.pendingDataRequests.size;

    // Add to recent completions (keep last 50)
    this.statistics.recentCompletions.unshift(completedDataRequest);
    if (this.statistics.recentCompletions.length > 50) {
      this.statistics.recentCompletions.pop();
    }

    this.logger.info(`📋 Tracking completed DataRequest: ${result.drId} (Task: ${result.taskId})`);

    // Check if we should look for batch assignments
    if (Date.now() - this.lastBatchCheck > this.BATCH_CHECK_INTERVAL_MS) {
      setTimeout(() => this.checkForBatchAssignments(), 1000); // Check in 1 second
    }
  }

  getPendingDataRequests(): CompletedDataRequest[] {
    return Array.from(this.pendingDataRequests.values());
  }

  getBatchAssignedDataRequests(): DataRequestBatchAssignment[] {
    return Array.from(this.batchAssignments.values());
  }

  async checkForBatchAssignments(): Promise<void> {
    if (!this.batchService) {
      this.logger.warn('⚠️  Cannot check batch assignments: BatchService not initialized');
      return;
    }

    this.lastBatchCheck = Date.now();
    const pendingDataRequests = this.getPendingDataRequests();

    if (pendingDataRequests.length === 0) {
      this.logger.debug('📋 No pending DataRequests to check for batch assignments');
      return;
    }

    this.logger.debug(`📋 Checking batch assignments for ${pendingDataRequests.length} pending DataRequests`);

    const foundAssignments: DataRequestBatchAssignment[] = [];

    // Check each pending DataRequest for batch assignment
    for (const dataRequest of pendingDataRequests) {
      try {
        const batch = await this.batchService.findDataRequestBatch(dataRequest.drId);
        
        if (batch) {
          const assignment: DataRequestBatchAssignment = {
            dataRequest,
            batch,
            assignedAt: Date.now()
          };

          // Move from pending to assigned
          this.pendingDataRequests.delete(dataRequest.drId);
          this.batchAssignments.set(dataRequest.drId, assignment);
          foundAssignments.push(assignment);

          this.logger.info(`✅ DataRequest ${dataRequest.drId} assigned to batch ${batch.batchNumber}`);
          
          // Emit assignment event
          this.emit('batch-assignment', assignment);
        }
      } catch (error) {
        this.logger.error(`❌ Error checking batch assignment for ${dataRequest.drId}: ${error}`);
      }
    }

    // Update statistics
    this.statistics.pendingAssignments = this.pendingDataRequests.size;
    this.statistics.batchAssignments = this.batchAssignments.size;

    // Add to recent assignments
    for (const assignment of foundAssignments) {
      this.statistics.recentAssignments.unshift(assignment);
      if (this.statistics.recentAssignments.length > 50) {
        this.statistics.recentAssignments.pop();
      }
    }

    // Calculate average assignment time
    if (this.statistics.recentAssignments.length > 0) {
      const totalAssignmentTime = this.statistics.recentAssignments
        .reduce((sum, assignment) => {
          return sum + (assignment.assignedAt - assignment.dataRequest.completedAt);
        }, 0);
      this.statistics.averageAssignmentTimeMs = totalAssignmentTime / this.statistics.recentAssignments.length;
    }

    // Clean up old pending DataRequests
    this.cleanupOldPendingDataRequests();

    // Check if any batches are ready for pushing
    await this.checkBatchesReadyForPushing(foundAssignments);

    if (foundAssignments.length > 0) {
      this.logger.info(`📋 Found ${foundAssignments.length} new batch assignments`);
    }
  }

  getStatistics(): CompletionTrackerStatistics {
    return { ...this.statistics };
  }

  /**
   * Clean up old pending DataRequests that are too old
   */
  private cleanupOldPendingDataRequests(): void {
    const cutoffTime = Date.now() - this.MAX_PENDING_AGE_MS;
    const toRemove: string[] = [];

    for (const [drId, dataRequest] of this.pendingDataRequests.entries()) {
      if (dataRequest.completedAt < cutoffTime) {
        toRemove.push(drId);
      }
    }

    for (const drId of toRemove) {
      this.pendingDataRequests.delete(drId);
      this.logger.warn(`🧹 Cleaned up old pending DataRequest: ${drId}`);
    }

    if (toRemove.length > 0) {
      this.statistics.pendingAssignments = this.pendingDataRequests.size;
    }
  }

  /**
   * Check if any batches with new assignments are ready for EVM pushing
   */
  private async checkBatchesReadyForPushing(newAssignments: DataRequestBatchAssignment[]): Promise<void> {
    const batchesForPushing = new Map<bigint, BatchTrackingInfo>();

    // Collect unique batches from new assignments
    for (const assignment of newAssignments) {
      batchesForPushing.set(assignment.batch.batchNumber, assignment.batch);
    }

    // Emit events for batches ready for pushing
    for (const batch of batchesForPushing.values()) {
      this.logger.info(`🚀 Batch ${batch.batchNumber} ready for EVM pushing`);
      this.emit('batch-ready-for-pushing', batch);
    }
  }
}

/**
 * Mock implementation for testing
 */
export class MockDataRequestCompletionTracker extends EventEmitter implements IDataRequestCompletionTracker {
  private mockPendingDataRequests: CompletedDataRequest[] = [];
  private mockBatchAssignments: DataRequestBatchAssignment[] = [];
  private mockStatistics: CompletionTrackerStatistics;

  constructor(private logger: ILoggingService) {
    super();
    
    this.mockStatistics = {
      totalCompletions: 0,
      pendingAssignments: 0,
      batchAssignments: 0,
      averageAssignmentTimeMs: 5000,
      recentCompletions: [],
      recentAssignments: []
    };

    this.logger.info('📋 Mock DataRequest completion tracker initialized');
  }

  async initialize(_batchService: IBatchService): Promise<void> {
    this.logger.info('📋 Mock completion tracker initialized with batch service');
  }

  async trackCompletion(result: AsyncTaskResult): Promise<void> {
    if (!result.success || !result.drId || result.blockHeight === undefined) {
      return;
    }

    const completedDataRequest: CompletedDataRequest = {
      taskId: result.taskId,
      drId: result.drId,
      blockHeight: BigInt(result.blockHeight),
      txHash: 'mock-tx-hash',
      completedAt: result.completedAt,
      sequenceNumber: result.sequenceNumber
    };

    this.mockPendingDataRequests.push(completedDataRequest);
    this.mockStatistics.totalCompletions++;
    this.mockStatistics.pendingAssignments = this.mockPendingDataRequests.length;

    this.logger.info(`📋 Mock: Tracking completed DataRequest: ${result.drId}`);
  }

  getPendingDataRequests(): CompletedDataRequest[] {
    return [...this.mockPendingDataRequests];
  }

  getBatchAssignedDataRequests(): DataRequestBatchAssignment[] {
    return [...this.mockBatchAssignments];
  }

  async checkForBatchAssignments(): Promise<void> {
    this.logger.debug('📋 Mock: Checking for batch assignments');
    // Mock implementation would simulate finding assignments
  }

  getStatistics(): CompletionTrackerStatistics {
    return { ...this.mockStatistics };
  }

  /**
   * Mock helpers for testing
   */
  addMockPendingDataRequest(dataRequest: CompletedDataRequest): void {
    this.mockPendingDataRequests.push(dataRequest);
    this.mockStatistics.pendingAssignments = this.mockPendingDataRequests.length;
  }

  addMockBatchAssignment(assignment: DataRequestBatchAssignment): void {
    this.mockBatchAssignments.push(assignment);
    this.mockStatistics.batchAssignments = this.mockBatchAssignments.length;
    
    // Remove from pending if it exists
    this.mockPendingDataRequests = this.mockPendingDataRequests.filter(
      dr => dr.drId !== assignment.dataRequest.drId
    );
    this.mockStatistics.pendingAssignments = this.mockPendingDataRequests.length;
  }

  clearMockData(): void {
    this.mockPendingDataRequests = [];
    this.mockBatchAssignments = [];
    this.mockStatistics = {
      totalCompletions: 0,
      pendingAssignments: 0,
      batchAssignments: 0,
      averageAssignmentTimeMs: 5000,
      recentCompletions: [],
      recentAssignments: []
    };
  }
} 