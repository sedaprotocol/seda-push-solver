/**
 * Batch Service
 * SEDA chain integration for batch querying and DataRequest tracking using real SEDA chain service
 */

import type { ILoggingService } from './logging-service';
import type { ISEDAChainService, BatchInfo as SEDABatchInfo } from './seda-chain-service';
import type { BatchTrackingInfo, BatchSignature } from '../types/evm-types';

// SEDA chain integration now implemented via ISEDAChainService

/**
 * Interface for SEDA batch operations
 */
export interface IBatchService {
  /**
   * Initialize the batch service with SEDA chain connection
   */
  initialize(sedaChainService: ISEDAChainService): Promise<void>;

  /**
   * Query SEDA chain for batch information by batch number
   */
  getBatch(batchNumber: bigint): Promise<BatchTrackingInfo | null>;

  /**
   * Get the latest batch from SEDA chain
   */
  getLatestBatch(): Promise<BatchTrackingInfo | null>;

  /**
   * Get a range of batches from SEDA chain
   */
  getBatchRange(startBatch: bigint, endBatch: bigint): Promise<BatchTrackingInfo[]>;

  /**
   * Check if a DataRequest is included in any batch
   */
  findDataRequestBatch(dataRequestId: string): Promise<BatchTrackingInfo | null>;

  /**
   * Check if batches are available within a time window
   */
  getRecentBatches(maxAgeMs: number, windowSize?: number): Promise<BatchTrackingInfo[]>;

  /**
   * Validate batch data integrity
   */
  validateBatch(batch: BatchTrackingInfo): Promise<boolean>;

  /**
   * Get batch by DataRequest IDs
   */
  getBatchesContainingDataRequests(dataRequestIds: string[]): Promise<BatchTrackingInfo[]>;

  /**
   * Get batch tracking information (alias for getBatch for EVM pusher compatibility)
   */
  getBatchTrackingInfo(batchNumber: bigint): Promise<BatchTrackingInfo | null>;

  /**
   * Check if service is properly initialized
   */
  isInitialized(): boolean;
}

/**
 * Production implementation using SEDA chain service for real chain integration
 */
export class BatchService implements IBatchService {
  private sedaChainService: ISEDAChainService | null = null;
  private batchCache = new Map<string, { batch: BatchTrackingInfo; timestamp: number }>();
  private dataRequestBatchCache = new Map<string, bigint>(); // drId -> batchNumber
  private readonly CACHE_TTL_MS = 60_000; // 1 minute cache
  private readonly MAX_CACHE_SIZE = 1000;

  constructor(private logger: ILoggingService) {
    this.logger.info('📦 SEDA batch service initializing...');
  }

  async initialize(sedaChainService: ISEDAChainService): Promise<void> {
    if (!sedaChainService.isInitialized()) {
      throw new Error('SEDA chain service must be initialized before batch service');
    }

    this.sedaChainService = sedaChainService;
    this.logger.info('📦 SEDA batch service initialized with real SEDA chain integration');
  }

  isInitialized(): boolean {
    return this.sedaChainService !== null;
  }

  async getBatch(batchNumber: bigint): Promise<BatchTrackingInfo | null> {
    if (!this.sedaChainService) {
      throw new Error('BatchService not initialized. Call initialize() first.');
    }

    const cacheKey = `batch_${batchNumber}`;
    
    // Check cache first
    const cached = this.getCachedBatch(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      this.logger.debug(`🔍 Querying SEDA chain for batch ${batchNumber}`);
      
      const batchInfo = await this.sedaChainService.getBatchInfo(batchNumber);
      
      if (!batchInfo) {
        this.logger.debug(`ℹ️  Batch ${batchNumber} not found`);
        return null;
      }

      const trackingInfo = this.convertToTrackingInfo(batchInfo);
      
      this.setCachedBatch(cacheKey, trackingInfo);
      this.logger.debug(`✅ Retrieved batch ${batchNumber} with ${trackingInfo.dataRequestIds.length} DataRequests`);
      
      return trackingInfo;
    } catch (error) {
      this.logger.error(`❌ Failed to get batch ${batchNumber}: ${error}`);
      return null;
    }
  }

  async getLatestBatch(): Promise<BatchTrackingInfo | null> {
    if (!this.sedaChainService) {
      throw new Error('BatchService not initialized. Call initialize() first.');
    }

    try {
      this.logger.debug('🔍 Querying SEDA chain for latest batch');
      
      const latestBatchNumber = await this.sedaChainService.getLatestBatchNumber();
      
      if (!latestBatchNumber) {
        this.logger.debug('ℹ️  No latest batch found');
        return null;
      }

      const trackingInfo = await this.getBatch(latestBatchNumber);
      if (trackingInfo) {
        this.logger.debug(`✅ Retrieved latest batch ${trackingInfo.batchNumber}`);
      }
      
      return trackingInfo;
    } catch (error) {
      this.logger.error(`❌ Failed to get latest batch: ${error}`);
      return null;
    }
  }

  async getBatchRange(startBatch: bigint, endBatch: bigint): Promise<BatchTrackingInfo[]> {
    if (!this.sedaChainService) {
      throw new Error('BatchService not initialized. Call initialize() first.');
    }

    try {
      this.logger.debug(`🔍 Querying SEDA chain for batch range ${startBatch} to ${endBatch}`);
      
      const batchInfos = await this.sedaChainService.getBatchRange(startBatch, endBatch);
      
      const trackingInfos = batchInfos.map(info => this.convertToTrackingInfo(info));
      
      this.logger.debug(`✅ Retrieved ${trackingInfos.length} batches in range ${startBatch}-${endBatch}`);
      return trackingInfos;
    } catch (error) {
      this.logger.error(`❌ Failed to get batch range ${startBatch}-${endBatch}: ${error}`);
      return [];
    }
  }

  async findDataRequestBatch(dataRequestId: string): Promise<BatchTrackingInfo | null> {
    if (!this.sedaChainService) {
      throw new Error('BatchService not initialized. Call initialize() first.');
    }

    // Check cache first
    const cachedBatchNumber = this.dataRequestBatchCache.get(dataRequestId);
    if (cachedBatchNumber) {
      const batch = await this.getBatch(cachedBatchNumber);
      if (batch && batch.dataRequestIds.includes(dataRequestId)) {
        return batch;
      }
      // Cache miss or stale data, remove from cache
      this.dataRequestBatchCache.delete(dataRequestId);
    }

    try {
      this.logger.debug(`🔍 Finding batch for DataRequest ${dataRequestId}`);
      
      const batchInfo = await this.sedaChainService.findDataRequestBatch(dataRequestId);
      
      if (!batchInfo) {
        this.logger.debug(`ℹ️  DataRequest ${dataRequestId} not found in any batch`);
        return null;
      }

      const trackingInfo = this.convertToTrackingInfo(batchInfo);
      
      // Cache the mapping for future lookups
      this.dataRequestBatchCache.set(dataRequestId, trackingInfo.batchNumber);
      
      this.logger.debug(`✅ Found DataRequest ${dataRequestId} in batch ${trackingInfo.batchNumber}`);
      return trackingInfo;
    } catch (error) {
      this.logger.error(`❌ Failed to find batch for DataRequest ${dataRequestId}: ${error}`);
      return null;
    }
  }

  async getRecentBatches(maxAgeMs: number, windowSize: number = 20): Promise<BatchTrackingInfo[]> {
    if (!this.sedaChainService) {
      throw new Error('BatchService not initialized. Call initialize() first.');
    }

    try {
      this.logger.debug(`🔍 Getting recent batches within ${maxAgeMs}ms, window size: ${windowSize}`);
      
      const latestBatchNumber = await this.sedaChainService.getLatestBatchNumber();
      if (!latestBatchNumber) {
        return [];
      }

      // Get the last N batches as specified by windowSize
      const startBatch = latestBatchNumber >= BigInt(windowSize) 
        ? latestBatchNumber - BigInt(windowSize) + 1n
        : 0n;

      const batches = await this.getBatchRange(startBatch, latestBatchNumber);
      
      // Filter by age if we can determine batch timestamps
      // Note: This is a simplified filter since we don't have precise timestamps
      // In a real implementation, you'd compare against actual batch block timestamps
      const cutoffTime = Date.now() - maxAgeMs;
      const recentBatches = batches.filter(batch => {
        // Approximate age check - in reality you'd use batch.blockHeight and chain timestamp
        return true; // For now, return all batches in the window
      });

      this.logger.debug(`✅ Retrieved ${recentBatches.length} recent batches`);
      return recentBatches;
    } catch (error) {
      this.logger.error(`❌ Failed to get recent batches: ${error}`);
      return [];
    }
  }

  async validateBatch(batch: BatchTrackingInfo): Promise<boolean> {
    if (!this.sedaChainService) {
      throw new Error('BatchService not initialized. Call initialize() first.');
    }

    try {
      this.logger.debug(`🔍 Validating batch ${batch.batchNumber}`);
      
      // Basic validation checks
      if (!batch.batchId || batch.batchId.length === 0) {
        this.logger.debug(`❌ Batch ${batch.batchNumber} invalid: missing batch ID`);
        return false;
      }

      if (!batch.dataResultRoot || batch.dataResultRoot.length === 0) {
        this.logger.debug(`❌ Batch ${batch.batchNumber} invalid: missing data result root`);
        return false;
      }

      if (batch.dataRequestIds.length !== batch.totalDataRequests) {
        this.logger.debug(`❌ Batch ${batch.batchNumber} invalid: DataRequest count mismatch`);
        return false;
      }

      // Verify batch exists on chain
      const chainBatch = await this.sedaChainService.getBatchInfo(batch.batchNumber);
      if (!chainBatch) {
        this.logger.debug(`❌ Batch ${batch.batchNumber} invalid: not found on chain`);
        return false;
      }

      // Compare critical fields
      if (chainBatch.batchId !== batch.batchId) {
        this.logger.debug(`❌ Batch ${batch.batchNumber} invalid: batch ID mismatch`);
        return false;
      }

      if (chainBatch.dataResultRoot !== batch.dataResultRoot) {
        this.logger.debug(`❌ Batch ${batch.batchNumber} invalid: data result root mismatch`);
        return false;
      }

      this.logger.debug(`✅ Batch ${batch.batchNumber} validation successful`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to validate batch ${batch.batchNumber}: ${error}`);
      return false;
    }
  }

  async getBatchesContainingDataRequests(dataRequestIds: string[]): Promise<BatchTrackingInfo[]> {
    if (!this.sedaChainService) {
      throw new Error('BatchService not initialized. Call initialize() first.');
    }

    try {
      this.logger.debug(`🔍 Finding batches containing ${dataRequestIds.length} DataRequests`);
      
      const batchMap = new Map<bigint, BatchTrackingInfo>();
      
      // Find batch for each DataRequest
      const batchPromises = dataRequestIds.map(async (drId) => {
        try {
          const batch = await this.findDataRequestBatch(drId);
          if (batch) {
            batchMap.set(batch.batchNumber, batch);
          }
        } catch (error) {
          this.logger.error(`❌ Error finding batch for DR ${drId}: ${error}`);
        }
      });

      await Promise.allSettled(batchPromises);
      
      const uniqueBatches = Array.from(batchMap.values());
      this.logger.debug(`✅ Found ${uniqueBatches.length} unique batches containing the DataRequests`);
      
      return uniqueBatches;
    } catch (error) {
      this.logger.error(`❌ Failed to get batches containing DataRequests: ${error}`);
      return [];
    }
  }

  async getBatchTrackingInfo(batchNumber: bigint): Promise<BatchTrackingInfo | null> {
    // Alias for getBatch to maintain EVM pusher compatibility
    return this.getBatch(batchNumber);
  }

  private convertToTrackingInfo(sedaBatch: SEDABatchInfo): BatchTrackingInfo {
    const signatures: BatchSignature[] = []; // TODO: Convert SEDA signatures when available
    
    return {
      batchNumber: sedaBatch.batchNumber,
      batchId: sedaBatch.batchId,
      blockHeight: sedaBatch.blockHeight,
      dataResultRoot: sedaBatch.dataResultRoot,
      currentDataResultRoot: sedaBatch.currentDataResultRoot,
      validatorRoot: sedaBatch.validatorRoot,
      signatures,
      dataRequestIds: sedaBatch.dataRequestIds,
      totalDataRequests: sedaBatch.totalDataRequests,
      isSigned: sedaBatch.signed,
      chainInfo: {
        network: 'seda-chain',
        blockHeight: sedaBatch.blockHeight,
        timestamp: Date.now() // TODO: Get actual block timestamp
      }
    };
  }

  private getCachedBatch(cacheKey: string): BatchTrackingInfo | null {
    const cached = this.batchCache.get(cacheKey);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > this.CACHE_TTL_MS;
    if (isExpired) {
      this.batchCache.delete(cacheKey);
      return null;
    }

    return cached.batch;
  }

  private setCachedBatch(cacheKey: string, batch: BatchTrackingInfo): void {
    // Implement LRU cache behavior
    if (this.batchCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.batchCache.keys().next().value;
      if (firstKey) {
        this.batchCache.delete(firstKey);
      }
    }

    this.batchCache.set(cacheKey, {
      batch,
      timestamp: Date.now()
    });
  }
}

/**
 * Mock implementation for testing
 */
export class MockBatchService implements IBatchService {
  private mockBatches = new Map<bigint, BatchTrackingInfo>();
  private mockDataRequestMappings = new Map<string, bigint>();
  private initialized = false;

  constructor(private logger: ILoggingService) {
    this.logger.info('📦 Mock batch service initialized');
  }

  async initialize(_sedaChainService: ISEDAChainService): Promise<void> {
    this.initialized = true;
    this.logger.info('📦 Mock batch service initialized with SEDA chain service');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async getBatch(batchNumber: bigint): Promise<BatchTrackingInfo | null> {
    const batch = this.mockBatches.get(batchNumber);
    if (batch) {
      this.logger.debug(`✅ Mock: Retrieved batch ${batchNumber}`);
    } else {
      this.logger.debug(`❌ Mock: Batch ${batchNumber} not found`);
    }
    return batch || null;
  }

  async getLatestBatch(): Promise<BatchTrackingInfo | null> {
    const batchNumbers = Array.from(this.mockBatches.keys()).sort((a, b) => 
      a > b ? -1 : a < b ? 1 : 0
    );
    
    if (batchNumbers.length === 0) {
      return null;
    }
    
    const latestBatchNumber = batchNumbers[0];
    if (latestBatchNumber === undefined) {
      return null;
    }
    
    return this.mockBatches.get(latestBatchNumber) || null;
  }

  async getBatchRange(startBatch: bigint, endBatch: bigint): Promise<BatchTrackingInfo[]> {
    const batches: BatchTrackingInfo[] = [];
    
    for (let batchNum = startBatch; batchNum <= endBatch; batchNum++) {
      const batch = this.mockBatches.get(batchNum);
      if (batch) {
        batches.push(batch);
      }
    }
    
    return batches;
  }

  async findDataRequestBatch(dataRequestId: string): Promise<BatchTrackingInfo | null> {
    const batchNumber = this.mockDataRequestMappings.get(dataRequestId);
    if (batchNumber !== undefined) {
      return this.mockBatches.get(batchNumber) || null;
    }
    return null;
  }

  async getRecentBatches(maxAgeMs: number): Promise<BatchTrackingInfo[]> {
    const cutoffTime = Date.now() - maxAgeMs;
    return Array.from(this.mockBatches.values())
      .filter(batch => (batch.discoveredAt ?? Date.now()) >= cutoffTime)
      .sort((a, b) => a.batchNumber > b.batchNumber ? -1 : 1);
  }

  async validateBatch(batch: BatchTrackingInfo): Promise<boolean> {
    return batch.batchId !== '' && batch.dataResultRoot !== '';
  }

  async getBatchesContainingDataRequests(dataRequestIds: string[]): Promise<BatchTrackingInfo[]> {
    const foundBatches = new Set<BatchTrackingInfo>();
    
    for (const drId of dataRequestIds) {
      const batch = await this.findDataRequestBatch(drId);
      if (batch) {
        foundBatches.add(batch);
      }
    }
    
    return Array.from(foundBatches);
  }

  async getBatchTrackingInfo(batchNumber: bigint): Promise<BatchTrackingInfo | null> {
    // This is an alias for getBatch for EVM pusher compatibility
    return this.getBatch(batchNumber);
  }

  /**
   * Mock helpers for testing
   */
  setMockBatch(batch: BatchTrackingInfo): void {
    this.mockBatches.set(batch.batchNumber, batch);
  }

  setMockDataRequestMapping(dataRequestId: string, batchNumber: bigint): void {
    this.mockDataRequestMappings.set(dataRequestId, batchNumber);
  }

  clearMockData(): void {
    this.mockBatches.clear();
    this.mockDataRequestMappings.clear();
  }
} 