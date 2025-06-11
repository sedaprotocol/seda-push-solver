/**
 * EVM Pusher Service
 * Main orchestrator for the multi-chain EVM batch pushing system
 */

import type { ILoggingService } from '../../services/logging-service';
import type { IBatchService } from '../../services/batch-service';
import type { IDataRequestCompletionTracker } from '../../services/dataquest-completion-tracker';
import type {
  EVMPusherConfig,
  BatchTrackingInfo,
  MultiChainPushResult,
  ChainBatchStatus
} from '../../types/evm-types';
import { ChainManager, type IChainManager } from './chain-manager';
import { buildEVMPusherConfig, validateEVMPusherConfig } from '../network/evm-config';
import { EventEmitter } from 'events';

/**
 * Interface for EVM Pusher Service operations
 */
export interface IEVMPusherService {
  /**
   * Initialize the EVM pusher service
   */
  initialize(): Promise<void>;
  
  /**
   * Start the background batch processing
   */
  start(): Promise<void>;
  
  /**
   * Stop the background processing
   */
  stop(): Promise<void>;
  
  /**
   * Manually push a specific batch to all chains
   */
  pushBatch(batch: BatchTrackingInfo): Promise<MultiChainPushResult>;
  
  /**
   * Get the status of a batch across all chains
   */
  getBatchStatus(batchNumber: bigint): Promise<Record<number, ChainBatchStatus>>;
  
  /**
   * Get service health status
   */
  getHealthStatus(): Promise<{
    isHealthy: boolean;
    chainHealth: Record<number, 'healthy' | 'degraded' | 'unhealthy'>;
    lastProcessingTime?: number;
    queueSize: number;
  }>;
  
  /**
   * Get comprehensive statistics
   */
  getStatistics(): Promise<{
    totalBatchesProcessed: number;
    successfulPushes: number;
    failedPushes: number;
    averageProcessingTimeMs: number;
    chainManager: any;
    batchDiscovery: {
      totalBatchesDiscovered: number;
      pendingBatches: number;
    };
  }>;
  
  /**
   * Gracefully shutdown the service
   */
  shutdown(): Promise<void>;
}

/**
 * EVM Pusher Service Implementation
 * Coordinates batch discovery, chain management, and pushing operations
 */
export class EVMPusherService extends EventEmitter implements IEVMPusherService {
  private config: EVMPusherConfig;
  private chainManager: IChainManager;
  private initialized = false;
  private running = false;
  private shutdownRequested = false;
  
  // Background processing
  private processingInterval?: NodeJS.Timeout;
  private lastProcessingTime?: number;
  
  // Batch queue and state
  private batchQueue = new Set<bigint>();
  private processedBatches = new Set<bigint>();
  private failedBatches = new Map<bigint, { attempts: number; lastError: string; nextRetryAt: number }>();
  
  // Statistics
  private statistics = {
    totalBatchesProcessed: 0,
    successfulPushes: 0,
    failedPushes: 0,
    totalProcessingTime: 0,
    batchesDiscovered: 0
  };

  constructor(
    private batchService: IBatchService,
    private completionTracker: IDataRequestCompletionTracker,
    private logger: ILoggingService
  ) {
    super();
    
    // Load and validate configuration
    this.config = buildEVMPusherConfig();
    validateEVMPusherConfig(this.config);
    
    // Initialize chain manager
    this.chainManager = new ChainManager(this.config, this.logger);
    
    this.logger.info(`🌐 EVM Pusher Service created for ${this.config.enabledChains.length} chains`);
    
    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('⚠️  EVM Pusher Service already initialized');
      return;
    }

    this.logger.info('🚀 Initializing EVM Pusher Service...');

    try {
      // Initialize chain manager
      await this.chainManager.initialize();
      
      // Set up completion tracker event handlers
      this.setupCompletionTrackerEvents();
      
      this.initialized = true;
      this.logger.info('✅ EVM Pusher Service initialized successfully');
      
    } catch (error) {
      this.logger.error(`❌ Failed to initialize EVM Pusher Service: ${error}`);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (!this.initialized) {
      throw new Error('EVM Pusher Service not initialized. Call initialize() first.');
    }

    if (this.running) {
      this.logger.warn('⚠️  EVM Pusher Service already running');
      return;
    }

    this.logger.info('▶️  Starting EVM Pusher Service...');

    try {
      this.running = true;
      this.shutdownRequested = false;
      
      // Start background processing
      this.startBackgroundProcessing();
      
      // Perform initial batch discovery
      await this.discoverPendingBatches();
      
      this.logger.info('✅ EVM Pusher Service started successfully');
      this.emit('service-started');
      
    } catch (error) {
      this.running = false;
      this.logger.error(`❌ Failed to start EVM Pusher Service: ${error}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      this.logger.warn('⚠️  EVM Pusher Service not running');
      return;
    }

    this.logger.info('⏹️  Stopping EVM Pusher Service...');

    try {
      this.running = false;
      
      // Stop background processing
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
        this.processingInterval = undefined;
      }
      
      // Process any remaining batches in queue
      await this.processQueuedBatches();
      
      this.logger.info('✅ EVM Pusher Service stopped successfully');
      this.emit('service-stopped');
      
    } catch (error) {
      this.logger.error(`❌ Error stopping EVM Pusher Service: ${error}`);
      throw error;
    }
  }

  async pushBatch(batch: BatchTrackingInfo): Promise<MultiChainPushResult> {
    if (!this.initialized) {
      throw new Error('EVM Pusher Service not initialized');
    }

    this.logger.info(`🎯 Manual push requested for batch ${batch.batchNumber}`);

    try {
      const startTime = Date.now();
      const result = await this.chainManager.pushBatchToAllChains(batch);
      const duration = Date.now() - startTime;
      
      // Update statistics
      this.updateStatistics(result, duration);
      
      // Mark as processed
      this.processedBatches.add(batch.batchNumber);
      this.batchQueue.delete(batch.batchNumber);
      
      this.logger.info(`🎯 Manual push completed for batch ${batch.batchNumber} in ${duration}ms`);
      return result;
      
    } catch (error) {
      this.logger.error(`❌ Manual push failed for batch ${batch.batchNumber}: ${error}`);
      throw error;
    }
  }

  async getBatchStatus(batchNumber: bigint): Promise<Record<number, ChainBatchStatus>> {
    if (!this.initialized) {
      throw new Error('EVM Pusher Service not initialized');
    }

    return await this.chainManager.getBatchStatus(batchNumber);
  }

  async getHealthStatus(): Promise<{
    isHealthy: boolean;
    chainHealth: Record<number, 'healthy' | 'degraded' | 'unhealthy'>;
    lastProcessingTime?: number;
    queueSize: number;
  }> {
    const chainHealth = this.initialized 
      ? await this.chainManager.checkChainsHealth()
      : {};
    
    const healthyChains = Object.values(chainHealth).filter(status => status === 'healthy').length;
    const totalChains = Object.keys(chainHealth).length;
    
    return {
      isHealthy: this.running && healthyChains === totalChains,
      chainHealth,
      lastProcessingTime: this.lastProcessingTime,
      queueSize: this.batchQueue.size
    };
  }

  async getStatistics(): Promise<{
    totalBatchesProcessed: number;
    successfulPushes: number;
    failedPushes: number;
    averageProcessingTimeMs: number;
    chainManager: any;
    batchDiscovery: {
      totalBatchesDiscovered: number;
      pendingBatches: number;
    };
  }> {
    const chainManagerStats = this.initialized 
      ? await this.chainManager.getStatistics()
      : { totalPushes: 0, successfulPushes: 0, failedPushes: 0, averagePushTimeMs: 0, chainStatistics: {} };
    
    const averageProcessingTimeMs = this.statistics.totalBatchesProcessed > 0
      ? this.statistics.totalProcessingTime / this.statistics.totalBatchesProcessed
      : 0;

    return {
      totalBatchesProcessed: this.statistics.totalBatchesProcessed,
      successfulPushes: this.statistics.successfulPushes,
      failedPushes: this.statistics.failedPushes,
      averageProcessingTimeMs,
      chainManager: chainManagerStats,
      batchDiscovery: {
        totalBatchesDiscovered: this.statistics.batchesDiscovered,
        pendingBatches: this.batchQueue.size
      }
    };
  }

  async shutdown(): Promise<void> {
    if (this.shutdownRequested) {
      this.logger.warn('⚠️  EVM Pusher Service shutdown already in progress');
      return;
    }

    this.shutdownRequested = true;
    this.logger.info('🔄 Shutting down EVM Pusher Service...');

    try {
      // Stop service if running
      if (this.running) {
        await this.stop();
      }
      
      // Shutdown chain manager
      if (this.initialized) {
        await this.chainManager.shutdown();
      }
      
      // Clear state
      this.batchQueue.clear();
      this.processedBatches.clear();
      this.failedBatches.clear();
      
      this.initialized = false;
      this.logger.info('✅ EVM Pusher Service shutdown complete');
      this.emit('service-shutdown');
      
    } catch (error) {
      this.logger.error(`❌ EVM Pusher Service shutdown failed: ${error}`);
      throw error;
    }
  }

  private startBackgroundProcessing(): void {
    const intervalMs = this.config.batchPolling.intervalMs;
    
    this.logger.info(`⏰ Starting background processing with ${intervalMs}ms interval`);
    
    this.processingInterval = setInterval(async () => {
      if (this.shutdownRequested || !this.running) {
        return;
      }
      
      try {
        await this.performBackgroundProcessing();
      } catch (error) {
        this.logger.error(`❌ Background processing error: ${error}`);
        this.emit('service-error', error);
      }
    }, intervalMs);
  }

  private async performBackgroundProcessing(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Discover new batches
      await this.discoverPendingBatches();
      
      // Process queued batches
      await this.processQueuedBatches();
      
      // Retry failed batches
      await this.retryFailedBatches();
      
      // Clean up old state
      this.cleanupOldState();
      
      this.lastProcessingTime = Date.now();
      const duration = this.lastProcessingTime - startTime;
      
      this.logger.debug(`🔄 Background processing completed in ${duration}ms`);
      
    } catch (error) {
      this.logger.error(`❌ Background processing failed: ${error}`);
      throw error;
    }
  }

  private async discoverPendingBatches(): Promise<void> {
    try {
      // Get batches that are ready for pushing from completion tracker
      const readyBatches = await this.completionTracker.getBatchesReadyForPushing();
      
      for (const batchInfo of readyBatches) {
        if (!this.processedBatches.has(batchInfo.batchNumber) && 
            !this.batchQueue.has(batchInfo.batchNumber)) {
          
          this.batchQueue.add(batchInfo.batchNumber);
          this.statistics.batchesDiscovered++;
          
          this.logger.info(`📥 Discovered new batch for pushing: ${batchInfo.batchNumber}`);
          this.emit('batch-discovered', batchInfo);
        }
      }
      
    } catch (error) {
      this.logger.warn(`Failed to discover pending batches: ${error}`);
    }
  }

  private async processQueuedBatches(): Promise<void> {
    if (this.batchQueue.size === 0) {
      return;
    }

    this.logger.debug(`📦 Processing ${this.batchQueue.size} queued batches`);

    // Convert to array and process in batches to avoid overwhelming the system
    const batchNumbers = Array.from(this.batchQueue);
    const maxConcurrent = this.config.concurrency.maxParallelChains;
    
    for (let i = 0; i < batchNumbers.length; i += maxConcurrent) {
      const batchChunk = batchNumbers.slice(i, i + maxConcurrent);
      
      const processingPromises = batchChunk.map(async (batchNumber) => {
        try {
          await this.processSingleBatch(batchNumber);
        } catch (error) {
          this.logger.error(`Failed to process batch ${batchNumber}: ${error}`);
        }
      });

      await Promise.all(processingPromises);
    }
  }

  private async processSingleBatch(batchNumber: bigint): Promise<void> {
    try {
      // Get batch tracking info
      const batchInfo = await this.batchService.getBatchTrackingInfo(batchNumber);
      if (!batchInfo) {
        this.logger.warn(`⚠️  Batch ${batchNumber} not found, removing from queue`);
        this.batchQueue.delete(batchNumber);
        return;
      }

      this.logger.info(`🚀 Processing batch ${batchNumber}`);
      
      const startTime = Date.now();
      const result = await this.chainManager.pushBatchToAllChains(batchInfo);
      const duration = Date.now() - startTime;
      
      // Update statistics and state
      this.updateStatistics(result, duration);
      this.processedBatches.add(batchNumber);
      this.batchQueue.delete(batchNumber);
      
      if (result.success) {
        this.logger.info(`✅ Batch ${batchNumber} successfully pushed to all chains`);
        this.failedBatches.delete(batchNumber);
      } else {
        this.logger.warn(`⚠️  Batch ${batchNumber} partially failed, scheduling retry`);
        this.scheduleRetry(batchNumber, `${result.failureCount}/${result.chainResults.length} chains failed`);
      }
      
    } catch (error) {
      this.logger.error(`❌ Failed to process batch ${batchNumber}: ${error}`);
      this.scheduleRetry(batchNumber, error instanceof Error ? error.message : String(error));
      this.batchQueue.delete(batchNumber);
    }
  }

  private async retryFailedBatches(): Promise<void> {
    const now = Date.now();
    const retriesToProcess: bigint[] = [];
    
    for (const [batchNumber, failureInfo] of this.failedBatches) {
      if (failureInfo.nextRetryAt <= now && failureInfo.attempts < 3) {
        retriesToProcess.push(batchNumber);
      }
    }
    
    if (retriesToProcess.length === 0) {
      return;
    }
    
    this.logger.info(`🔄 Retrying ${retriesToProcess.length} failed batches`);
    
    for (const batchNumber of retriesToProcess) {
      try {
        await this.processSingleBatch(batchNumber);
      } catch (error) {
        this.logger.error(`❌ Retry failed for batch ${batchNumber}: ${error}`);
      }
    }
  }

  private scheduleRetry(batchNumber: bigint, error: string): void {
    const existing = this.failedBatches.get(batchNumber);
    const attempts = existing ? existing.attempts + 1 : 1;
    
    if (attempts > 3) {
      this.logger.error(`💥 Batch ${batchNumber} failed permanently after ${attempts} attempts`);
      this.failedBatches.delete(batchNumber);
      return;
    }
    
    const retryDelayMs = Math.min(5000 * Math.pow(2, attempts - 1), 60000); // Exponential backoff
    const nextRetryAt = Date.now() + retryDelayMs;
    
    this.failedBatches.set(batchNumber, {
      attempts,
      lastError: error,
      nextRetryAt
    });
    
    this.logger.info(`⏰ Scheduling retry ${attempts}/3 for batch ${batchNumber} in ${retryDelayMs}ms`);
  }

  private cleanupOldState(): void {
    const maxAgeMs = this.config.batchPolling.maxBatchAgeMs;
    const cutoffTime = Date.now() - maxAgeMs;
    
    // Clean up old processed batches (keep only recent ones for deduplication)
    const oldProcessedBatches = Array.from(this.processedBatches).filter(batchNumber => {
      // Assume batch number correlates with time for cleanup purposes
      return Number(batchNumber) < cutoffTime / 1000;
    });
    
    for (const batchNumber of oldProcessedBatches.slice(0, -100)) { // Keep last 100
      this.processedBatches.delete(batchNumber);
    }
    
    // Clean up old failed batches
    for (const [batchNumber, failureInfo] of this.failedBatches) {
      if (Date.now() - failureInfo.nextRetryAt > maxAgeMs) {
        this.failedBatches.delete(batchNumber);
      }
    }
  }

  private updateStatistics(result: MultiChainPushResult, duration: number): void {
    this.statistics.totalBatchesProcessed++;
    this.statistics.totalProcessingTime += duration;
    this.statistics.successfulPushes += result.successCount;
    this.statistics.failedPushes += result.failureCount;
  }

  private setupEventHandlers(): void {
    // Event forwarding will be set up when needed
    // For now, using direct method calls for simplicity
  }

  private setupCompletionTrackerEvents(): void {
    // Listen for batch ready events from completion tracker
    this.completionTracker.on('batch-ready-for-pushing', (batchInfo: BatchTrackingInfo) => {
      if (!this.processedBatches.has(batchInfo.batchNumber) && 
          !this.batchQueue.has(batchInfo.batchNumber)) {
        
        this.batchQueue.add(batchInfo.batchNumber);
        this.statistics.batchesDiscovered++;
        
        this.logger.info(`📥 Batch ${batchInfo.batchNumber} ready for pushing via event`);
        this.emit('batch-discovered', batchInfo);
      }
    });
  }
}

/**
 * Mock implementation for testing
 */
export class MockEVMPusherService extends EventEmitter implements IEVMPusherService {
  private mockStatistics = {
    totalBatchesProcessed: 0,
    successfulPushes: 0,
    failedPushes: 0
  };
  
  private mockBatches = new Set<bigint>();

  constructor(
    private batchService: IBatchService,
    private completionTracker: IDataRequestCompletionTracker,
    private logger: ILoggingService
  ) {
    super();
    this.logger.info('⚡ Mock EVM Pusher Service initialized');
  }

  async initialize(): Promise<void> {
    this.logger.info('🚀 Mock: Initializing EVM Pusher Service...');
    this.logger.info('✅ Mock: EVM Pusher Service initialized');
  }

  async start(): Promise<void> {
    this.logger.info('▶️  Mock: Starting EVM Pusher Service...');
    this.logger.info('✅ Mock: EVM Pusher Service started');
  }

  async stop(): Promise<void> {
    this.logger.info('⏹️  Mock: Stopping EVM Pusher Service...');
    this.logger.info('✅ Mock: EVM Pusher Service stopped');
  }

  async pushBatch(batch: BatchTrackingInfo): Promise<MultiChainPushResult> {
    this.logger.info(`🎯 Mock: Pushing batch ${batch.batchNumber}`);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    this.mockBatches.add(batch.batchNumber);
    this.mockStatistics.totalBatchesProcessed++;
    this.mockStatistics.successfulPushes += 2; // Mock 2 chains
    
    return {
      batchNumber: batch.batchNumber,
      chainResults: [
        { chainId: 42161, success: true, txHash: `0x${'0'.repeat(64)}`, blockNumber: BigInt(1000000), gasUsed: BigInt(300000), durationMs: 150 },
        { chainId: 10, success: true, txHash: `0x${'0'.repeat(64)}`, blockNumber: BigInt(2000000), gasUsed: BigInt(280000), durationMs: 140 }
      ],
      success: true,
      successCount: 2,
      failureCount: 0,
      totalDurationMs: 300
    };
  }

  async getBatchStatus(_batchNumber: bigint): Promise<Record<number, ChainBatchStatus>> {
    return {
      42161: { chainId: 42161, status: 'pushed', retryCount: 0 },
      10: { chainId: 10, status: 'pushed', retryCount: 0 }
    };
  }

  async getHealthStatus(): Promise<{
    isHealthy: boolean;
    chainHealth: Record<number, 'healthy' | 'degraded' | 'unhealthy'>;
    lastProcessingTime?: number;
    queueSize: number;
  }> {
    return {
      isHealthy: true,
      chainHealth: { 42161: 'healthy', 10: 'healthy' },
      lastProcessingTime: Date.now(),
      queueSize: 0
    };
  }

  async getStatistics(): Promise<{
    totalBatchesProcessed: number;
    successfulPushes: number;
    failedPushes: number;
    averageProcessingTimeMs: number;
    chainManager: any;
    batchDiscovery: {
      totalBatchesDiscovered: number;
      pendingBatches: number;
    };
  }> {
    return {
      ...this.mockStatistics,
      averageProcessingTimeMs: 300,
      chainManager: { totalPushes: 10, successfulPushes: 10, failedPushes: 0 },
      batchDiscovery: { totalBatchesDiscovered: 5, pendingBatches: 0 }
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('🔄 Mock: Shutting down EVM Pusher Service...');
    this.mockBatches.clear();
    this.logger.info('✅ Mock: EVM Pusher Service shutdown complete');
  }
} 