/**
 * DataRequest Completion Tracker
 * Integrates with existing task completion handlers to track DataRequest lifecycle
 * and coordinate batch assignment detection via SEDA chain service
 */

import type { ILoggingService } from './logging-service';
import type { ISEDAChainService, DataRequestResult, BatchInfo } from './seda-chain-service';
// import type { SchedulerStatistics } from '../types'; // Not needed for this service

export interface DataRequestCompletionInfo {
  drId: string;
  status: 'pending' | 'completed' | 'batch_assigned' | 'failed';
  result?: DataRequestResult;
  batchInfo?: BatchInfo;
  completionTimestamp?: number;
  batchAssignmentTimestamp?: number;
  processingDurationMs?: number;
  retryCount: number;
  lastError?: string;
}

export interface CompletionTrackingOptions {
  maxRetryAttempts?: number;
  retryDelayMs?: number;
  batchDetectionTimeoutMs?: number;
  completionPollingIntervalMs?: number;
  enableBatchTracking?: boolean;
}

/**
 * Event emitted when DataRequest completion status changes
 */
export interface DataRequestCompletionEvent {
  drId: string;
  status: DataRequestCompletionInfo['status'];
  result?: DataRequestResult;
  batchInfo?: BatchInfo;
  timestamp: number;
}

export type CompletionEventHandler = (event: DataRequestCompletionEvent) => void | Promise<void>;

/**
 * Interface for DataRequest completion tracking
 */
export interface IDataRequestTracker {
  /**
   * Initialize the tracker service
   */
  initialize(sedaChainService: ISEDAChainService, options?: CompletionTrackingOptions): Promise<void>;

  /**
   * Start tracking a DataRequest for completion
   */
  trackDataRequest(drId: string): Promise<void>;

  /**
   * Stop tracking a specific DataRequest
   */
  stopTracking(drId: string): Promise<void>;

  /**
   * Get completion information for a DataRequest
   */
  getCompletionInfo(drId: string): DataRequestCompletionInfo | null;

  /**
   * Get all currently tracked DataRequests
   */
  getTrackedDataRequests(): string[];

  /**
   * Get completion statistics
   */
  getTrackingStatistics(): {
    totalTracked: number;
    completed: number;
    batchAssigned: number;
    pending: number;
    failed: number;
    avgCompletionTimeMs: number;
    avgBatchAssignmentTimeMs: number;
  };

  /**
   * Register event handler for completion events
   */
  onCompletion(handler: CompletionEventHandler): void;

  /**
   * Force check completion status for all tracked DataRequests
   */
  forceCompletionCheck(): Promise<void>;

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean;

  /**
   * Start/stop the tracking loop
   */
  startTracking(): Promise<void>;
  stopTrackingAll(): Promise<void>;
}

/**
 * Production implementation of DataRequest completion tracker
 */
export class DataRequestTracker implements IDataRequestTracker {
  private sedaChainService: ISEDAChainService | null = null;
  private options: CompletionTrackingOptions = {};
  private trackedRequests = new Map<string, DataRequestCompletionInfo>();
  private completionHandlers: CompletionEventHandler[] = [];
  private trackingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private initialized = false;

  // Statistics
  private stats = {
    totalTracked: 0,
    completed: 0,
    batchAssigned: 0,
    failed: 0,
    completionTimes: [] as number[],
    batchAssignmentTimes: [] as number[]
  };

  constructor(private logger: ILoggingService) {}

  async initialize(sedaChainService: ISEDAChainService, options: CompletionTrackingOptions = {}): Promise<void> {
    this.sedaChainService = sedaChainService;
    this.options = {
      maxRetryAttempts: 5,
      retryDelayMs: 2000,
      batchDetectionTimeoutMs: 300_000, // 5 minutes
      completionPollingIntervalMs: 10_000, // 10 seconds
      enableBatchTracking: true,
      ...options
    };

    if (!this.sedaChainService.isInitialized()) {
      throw new Error('SEDA chain service must be initialized before DataRequest tracker');
    }

    this.initialized = true;
    this.logger.info('📋 DataRequest completion tracker initialized');
    this.logger.debug(`   Completion polling interval: ${this.options.completionPollingIntervalMs}ms`);
    this.logger.debug(`   Batch tracking enabled: ${this.options.enableBatchTracking}`);
    this.logger.debug(`   Max retry attempts: ${this.options.maxRetryAttempts}`);
  }

  isInitialized(): boolean {
    return this.initialized && this.sedaChainService !== null;
  }

  async startTracking(): Promise<void> {
    if (!this.isInitialized()) {
      throw new Error('DataRequest tracker not initialized');
    }

    if (this.isRunning) {
      this.logger.debug('📋 DataRequest tracker already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('🚀 Starting DataRequest completion tracking loop');

    // Start periodic completion checking
    this.trackingInterval = setInterval(async () => {
      try {
        await this.processTrackedRequests();
      } catch (error) {
        this.logger.error(`❌ Error in tracking loop: ${error}`);
      }
    }, this.options.completionPollingIntervalMs);
  }

  async stopTrackingAll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.logger.info('⏹️  Stopping DataRequest completion tracking');

    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
  }

  async trackDataRequest(drId: string): Promise<void> {
    if (!this.isInitialized()) {
      throw new Error('DataRequest tracker not initialized');
    }

    if (this.trackedRequests.has(drId)) {
      this.logger.debug(`📋 DataRequest ${drId} already being tracked`);
      return;
    }

    const trackingInfo: DataRequestCompletionInfo = {
      drId,
      status: 'pending',
      retryCount: 0
    };

    this.trackedRequests.set(drId, trackingInfo);
    this.stats.totalTracked++;

    this.logger.info(`📋 Started tracking DataRequest completion: ${drId}`);
    
    // Emit tracking started event
    await this.emitCompletionEvent({
      drId,
      status: 'pending',
      timestamp: Date.now()
    });

    // If not running periodic checks, trigger immediate check
    if (!this.isRunning) {
      this.checkDataRequestCompletion(drId).catch(error => {
        this.logger.error(`❌ Error checking DR completion for ${drId}: ${error}`);
      });
    }
  }

  async stopTracking(drId: string): Promise<void> {
    const trackingInfo = this.trackedRequests.get(drId);
    if (!trackingInfo) {
      this.logger.debug(`📋 DataRequest ${drId} not being tracked`);
      return;
    }

    this.trackedRequests.delete(drId);
    this.logger.info(`📋 Stopped tracking DataRequest: ${drId}`);
  }

  getCompletionInfo(drId: string): DataRequestCompletionInfo | null {
    return this.trackedRequests.get(drId) || null;
  }

  getTrackedDataRequests(): string[] {
    return Array.from(this.trackedRequests.keys());
  }

  getTrackingStatistics() {
    const avgCompletionTime = this.stats.completionTimes.length > 0
      ? this.stats.completionTimes.reduce((a, b) => a + b, 0) / this.stats.completionTimes.length
      : 0;

    const avgBatchAssignmentTime = this.stats.batchAssignmentTimes.length > 0
      ? this.stats.batchAssignmentTimes.reduce((a, b) => a + b, 0) / this.stats.batchAssignmentTimes.length
      : 0;

    return {
      totalTracked: this.stats.totalTracked,
      completed: this.stats.completed,
      batchAssigned: this.stats.batchAssigned,
      pending: Array.from(this.trackedRequests.values()).filter(info => info.status === 'pending').length,
      failed: this.stats.failed,
      avgCompletionTimeMs: avgCompletionTime,
      avgBatchAssignmentTimeMs: avgBatchAssignmentTime
    };
  }

  onCompletion(handler: CompletionEventHandler): void {
    this.completionHandlers.push(handler);
  }

  async forceCompletionCheck(): Promise<void> {
    if (!this.isInitialized()) {
      throw new Error('DataRequest tracker not initialized');
    }

    this.logger.info('🔍 Forcing completion check for all tracked DataRequests');
    await this.processTrackedRequests();
  }

  // Private methods

  private async processTrackedRequests(): Promise<void> {
    const trackedIds = this.getTrackedDataRequests();
    if (trackedIds.length === 0) {
      return;
    }

    this.logger.debug(`🔍 Checking completion status for ${trackedIds.length} tracked DataRequests`);

    const checkPromises = trackedIds.map(drId => 
      this.checkDataRequestCompletion(drId).catch(error => {
        this.logger.error(`❌ Error checking completion for ${drId}: ${error}`);
      })
    );

    await Promise.allSettled(checkPromises);
  }

  private async checkDataRequestCompletion(drId: string): Promise<void> {
    const trackingInfo = this.trackedRequests.get(drId);
    if (!trackingInfo || !this.sedaChainService) {
      return;
    }

    try {
      // Check if DataRequest is completed
      const isCompleted = await this.sedaChainService.isDataRequestCompleted(drId);
      
      if (!isCompleted) {
        // Still pending - check if we should retry or timeout
        if (trackingInfo.retryCount >= (this.options.maxRetryAttempts || 5)) {
          await this.handleTrackingFailure(drId, 'Maximum retry attempts exceeded');
        }
        return;
      }

      // DataRequest is completed - get result
      if (trackingInfo.status === 'pending') {
        await this.handleDataRequestCompleted(drId);
      }

      // If batch tracking is enabled and we haven't found batch yet, check for batch assignment
      if (this.options.enableBatchTracking && trackingInfo.status === 'completed') {
        await this.checkBatchAssignment(drId);
      }

    } catch (error) {
      this.logger.error(`❌ Error checking completion for ${drId}: ${error}`);
      trackingInfo.retryCount++;
      trackingInfo.lastError = String(error);
      
      if (trackingInfo.retryCount >= (this.options.maxRetryAttempts || 5)) {
        await this.handleTrackingFailure(drId, String(error));
      }
    }
  }

  private async handleDataRequestCompleted(drId: string): Promise<void> {
    const trackingInfo = this.trackedRequests.get(drId);
    if (!trackingInfo || !this.sedaChainService) {
      return;
    }

    try {
      const result = await this.sedaChainService.getDataRequestResult(drId);
      if (!result) {
        throw new Error('DataRequest marked as completed but no result found');
      }

      trackingInfo.status = 'completed';
      trackingInfo.result = result;
      trackingInfo.completionTimestamp = Date.now();
      
      // Calculate processing duration if we have tracking start time
      if (trackingInfo.completionTimestamp) {
        const processingDuration = trackingInfo.completionTimestamp - (trackingInfo.completionTimestamp - 30000); // Rough estimate
        trackingInfo.processingDurationMs = processingDuration;
        this.stats.completionTimes.push(processingDuration);
      }

      this.stats.completed++;

      this.logger.info(`✅ DataRequest ${drId} completed - Exit Code: ${result.exitCode}, Consensus: ${result.consensus}`);

      await this.emitCompletionEvent({
        drId,
        status: 'completed',
        result,
        timestamp: trackingInfo.completionTimestamp
      });

    } catch (error) {
      this.logger.error(`❌ Error handling completion for ${drId}: ${error}`);
      await this.handleTrackingFailure(drId, String(error));
    }
  }

  private async checkBatchAssignment(drId: string): Promise<void> {
    const trackingInfo = this.trackedRequests.get(drId);
    if (!trackingInfo || !this.sedaChainService) {
      return;
    }

    try {
      const batchInfo = await this.sedaChainService.findDataRequestBatch(drId);
      
      if (batchInfo) {
        trackingInfo.status = 'batch_assigned';
        trackingInfo.batchInfo = batchInfo;
        trackingInfo.batchAssignmentTimestamp = Date.now();

        // Update result with batch assignment
        if (trackingInfo.result) {
          trackingInfo.result.batchAssignment = batchInfo.batchNumber;
        }

        // Calculate batch assignment duration
        if (trackingInfo.completionTimestamp && trackingInfo.batchAssignmentTimestamp) {
          const batchAssignmentDuration = trackingInfo.batchAssignmentTimestamp - trackingInfo.completionTimestamp;
          this.stats.batchAssignmentTimes.push(batchAssignmentDuration);
        }

        this.stats.batchAssigned++;

        this.logger.info(`📦 DataRequest ${drId} assigned to batch ${batchInfo.batchNumber}`);

        await this.emitCompletionEvent({
          drId,
          status: 'batch_assigned',
          result: trackingInfo.result,
          batchInfo,
          timestamp: trackingInfo.batchAssignmentTimestamp
        });

        // Stop tracking this DataRequest as it's fully processed
        await this.stopTracking(drId);
      }
    } catch (error) {
      this.logger.error(`❌ Error checking batch assignment for ${drId}: ${error}`);
      // Don't fail the tracking, just continue trying
    }
  }

  private async handleTrackingFailure(drId: string, error: string): Promise<void> {
    const trackingInfo = this.trackedRequests.get(drId);
    if (!trackingInfo) {
      return;
    }

    trackingInfo.status = 'failed';
    trackingInfo.lastError = error;
    this.stats.failed++;

    this.logger.error(`❌ DataRequest tracking failed for ${drId}: ${error}`);

    await this.emitCompletionEvent({
      drId,
      status: 'failed',
      timestamp: Date.now()
    });

    // Stop tracking this failed DataRequest
    await this.stopTracking(drId);
  }

  private async emitCompletionEvent(event: DataRequestCompletionEvent): Promise<void> {
    const handlerPromises = this.completionHandlers.map(async handler => {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error(`❌ Error in completion event handler: ${error}`);
      }
    });

    await Promise.allSettled(handlerPromises);
  }
}

/**
 * Mock implementation for testing
 */
export class MockDataRequestTracker implements IDataRequestTracker {
  private initialized = false;
  private trackedRequests = new Map<string, DataRequestCompletionInfo>();
  private completionHandlers: CompletionEventHandler[] = [];
  private mockResults = new Map<string, DataRequestResult>();
  private mockBatches = new Map<string, BatchInfo>();

  constructor(private logger: ILoggingService) {}

  async initialize(_sedaChainService: ISEDAChainService, _options?: CompletionTrackingOptions): Promise<void> {
    this.initialized = true;
    this.logger.info('🧪 Mock DataRequest tracker initialized');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async startTracking(): Promise<void> {
    this.logger.info('🧪 Mock tracking started');
  }

  async stopTrackingAll(): Promise<void> {
    this.logger.info('🧪 Mock tracking stopped');
  }

  async trackDataRequest(drId: string): Promise<void> {
    const trackingInfo: DataRequestCompletionInfo = {
      drId,
      status: 'pending',
      retryCount: 0
    };

    this.trackedRequests.set(drId, trackingInfo);
    this.logger.info(`🧪 Mock tracking started for ${drId}`);
  }

  async stopTracking(drId: string): Promise<void> {
    this.trackedRequests.delete(drId);
    this.logger.info(`🧪 Mock tracking stopped for ${drId}`);
  }

  getCompletionInfo(drId: string): DataRequestCompletionInfo | null {
    return this.trackedRequests.get(drId) || null;
  }

  getTrackedDataRequests(): string[] {
    return Array.from(this.trackedRequests.keys());
  }

  getTrackingStatistics() {
    return {
      totalTracked: this.trackedRequests.size,
      completed: 0,
      batchAssigned: 0,
      pending: this.trackedRequests.size,
      failed: 0,
      avgCompletionTimeMs: 0,
      avgBatchAssignmentTimeMs: 0
    };
  }

  onCompletion(handler: CompletionEventHandler): void {
    this.completionHandlers.push(handler);
  }

  async forceCompletionCheck(): Promise<void> {
    this.logger.info('🧪 Mock force completion check');
  }

  // Mock data management
  setMockResult(drId: string, result: DataRequestResult): void {
    this.mockResults.set(drId, result);
  }

  setMockBatch(drId: string, batch: BatchInfo): void {
    this.mockBatches.set(drId, batch);
  }

  async simulateCompletion(drId: string): Promise<void> {
    const trackingInfo = this.trackedRequests.get(drId);
    if (!trackingInfo) return;

    const result = this.mockResults.get(drId);
    const batch = this.mockBatches.get(drId);

    if (result) {
      trackingInfo.status = batch ? 'batch_assigned' : 'completed';
      trackingInfo.result = result;
      trackingInfo.batchInfo = batch;
      trackingInfo.completionTimestamp = Date.now();

      await this.emitCompletionEvent({
        drId,
        status: trackingInfo.status,
        result,
        batchInfo: batch,
        timestamp: Date.now()
      });
    }
  }

  private async emitCompletionEvent(event: DataRequestCompletionEvent): Promise<void> {
    const handlerPromises = this.completionHandlers.map(async handler => {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error(`❌ Error in mock completion event handler: ${error}`);
      }
    });

    await Promise.allSettled(handlerPromises);
  }
}