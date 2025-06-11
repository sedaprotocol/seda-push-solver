/**
 * Batch Service
 * SEDA chain integration for batch querying and DataRequest tracking
 */

import type { ILoggingService } from './logging-service';
import type { BatchTrackingInfo, BatchSignature } from '../types/evm-types';

/**
 * Interface for SEDA batch operations
 */
export interface IBatchService {
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
  getRecentBatches(maxAgeMs: number): Promise<BatchTrackingInfo[]>;

  /**
   * Validate batch data integrity
   */
  validateBatch(batch: BatchTrackingInfo): Promise<boolean>;

  /**
   * Get batch by DataRequest IDs
   */
  getBatchesContainingDataRequests(dataRequestIds: string[]): Promise<BatchTrackingInfo[]>;
}

/**
 * Production implementation of batch service
 * Integrates with SEDA chain using existing patterns
 */
export class BatchService implements IBatchService {
  private sedaRpcEndpoint: string;
  private batchCache = new Map<string, { batch: BatchTrackingInfo; timestamp: number }>();
  private readonly CACHE_TTL_MS = 60_000; // 1 minute cache
  private readonly MAX_CACHE_SIZE = 1000;

  constructor(
    private logger: ILoggingService,
    sedaRpcEndpoint?: string
  ) {
    // Use provided endpoint or default from environment
    this.sedaRpcEndpoint = sedaRpcEndpoint || process.env.SEDA_RPC_ENDPOINT || 'https://rpc.testnet.seda.xyz';
    this.logger.info(`📦 Batch service initialized with RPC: ${this.sedaRpcEndpoint}`);
  }

  async getBatch(batchNumber: bigint): Promise<BatchTrackingInfo | null> {
    const cacheKey = `batch_${batchNumber}`;
    
    // Check cache first
    const cached = this.getCachedBatch(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      this.logger.debug(`🔍 Querying SEDA chain for batch ${batchNumber}`);
      
      // TODO: Implement actual SEDA chain query using @seda-protocol/dev-tools
      // For now, return a mock structure to establish the interface
      const mockBatch: BatchTrackingInfo = {
        batchNumber,
        batchId: `0x${batchNumber.toString(16).padStart(64, '0')}`,
        merkleRoot: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        signatures: [],
        sedaBlockHeight: batchNumber * 100n, // Mock relationship
        dataRequestIds: [],
        chainStatus: new Map(),
        discoveredAt: Date.now()
      };

      this.setCachedBatch(cacheKey, mockBatch);
      this.logger.debug(`✅ Retrieved batch ${batchNumber}`);
      
      return mockBatch;
    } catch (error) {
      this.logger.error(`❌ Failed to get batch ${batchNumber}: ${error}`);
      return null;
    }
  }

  async getLatestBatch(): Promise<BatchTrackingInfo | null> {
    try {
      this.logger.debug('🔍 Querying SEDA chain for latest batch');
      
      // TODO: Implement actual SEDA chain query for latest batch
      // For now, return a mock latest batch
      const latestBatchNumber = BigInt(Date.now() / 10000); // Mock incrementing batch
      return this.getBatch(latestBatchNumber);
    } catch (error) {
      this.logger.error(`❌ Failed to get latest batch: ${error}`);
      return null;
    }
  }

  async getBatchRange(startBatch: bigint, endBatch: bigint): Promise<BatchTrackingInfo[]> {
    try {
      this.logger.debug(`🔍 Querying SEDA chain for batch range ${startBatch} to ${endBatch}`);
      
      const batches: BatchTrackingInfo[] = [];
      
      for (let batchNum = startBatch; batchNum <= endBatch; batchNum++) {
        const batch = await this.getBatch(batchNum);
        if (batch) {
          batches.push(batch);
        }
      }
      
      this.logger.debug(`✅ Retrieved ${batches.length} batches from range`);
      return batches;
    } catch (error) {
      this.logger.error(`❌ Failed to get batch range: ${error}`);
      return [];
    }
  }

  async findDataRequestBatch(dataRequestId: string): Promise<BatchTrackingInfo | null> {
    try {
      this.logger.debug(`🔍 Finding batch containing DataRequest ${dataRequestId}`);
      
      // TODO: Implement actual SEDA chain query to find which batch contains the DR
      // This would typically involve querying the batch inclusion data
      
      // Mock implementation: search recent batches
      const recentBatches = await this.getRecentBatches(3600_000); // Last hour
      
      for (const batch of recentBatches) {
        if (batch.dataRequestIds.includes(dataRequestId)) {
          this.logger.debug(`✅ Found DataRequest ${dataRequestId} in batch ${batch.batchNumber}`);
          return batch;
        }
      }
      
      this.logger.debug(`❌ DataRequest ${dataRequestId} not found in recent batches`);
      return null;
    } catch (error) {
      this.logger.error(`❌ Failed to find batch for DataRequest ${dataRequestId}: ${error}`);
      return null;
    }
  }

  async getRecentBatches(maxAgeMs: number): Promise<BatchTrackingInfo[]> {
    try {
      const cutoffTime = Date.now() - maxAgeMs;
      this.logger.debug(`🔍 Getting recent batches (max age: ${maxAgeMs}ms)`);
      
      // TODO: Implement efficient query for recent batches
      // For now, get latest and work backwards
      const latestBatch = await this.getLatestBatch();
      if (!latestBatch) {
        return [];
      }

      const recentBatches: BatchTrackingInfo[] = [latestBatch];
      
      // Get previous batches until we hit the age limit
      let currentBatchNum = latestBatch.batchNumber - 1n;
      let searchCount = 0;
      const maxSearch = 100; // Limit search to prevent infinite loops
      
      while (searchCount < maxSearch) {
        const batch = await this.getBatch(currentBatchNum);
        if (!batch || batch.discoveredAt < cutoffTime) {
          break;
        }
        
        recentBatches.unshift(batch);
        currentBatchNum--;
        searchCount++;
      }
      
      this.logger.debug(`✅ Retrieved ${recentBatches.length} recent batches`);
      return recentBatches;
    } catch (error) {
      this.logger.error(`❌ Failed to get recent batches: ${error}`);
      return [];
    }
  }

  async validateBatch(batch: BatchTrackingInfo): Promise<boolean> {
    try {
      this.logger.debug(`🔍 Validating batch ${batch.batchNumber}`);
      
      // Basic validation checks
      if (!batch.batchId || !batch.merkleRoot) {
        this.logger.error(`❌ Batch ${batch.batchNumber} missing required fields`);
        return false;
      }

      if (batch.signatures.length === 0) {
        this.logger.error(`❌ Batch ${batch.batchNumber} has no signatures`);
        return false;
      }

      // TODO: Implement cryptographic validation of signatures and merkle proof
      // This would involve verifying signatures against validator set
      
      this.logger.debug(`✅ Batch ${batch.batchNumber} validation passed`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to validate batch ${batch.batchNumber}: ${error}`);
      return false;
    }
  }

  async getBatchesContainingDataRequests(dataRequestIds: string[]): Promise<BatchTrackingInfo[]> {
    try {
      this.logger.debug(`🔍 Finding batches containing ${dataRequestIds.length} DataRequests`);
      
      const foundBatches = new Map<bigint, BatchTrackingInfo>();
      
      for (const drId of dataRequestIds) {
        const batch = await this.findDataRequestBatch(drId);
        if (batch) {
          foundBatches.set(batch.batchNumber, batch);
        }
      }
      
      const result = Array.from(foundBatches.values());
      this.logger.debug(`✅ Found ${result.length} batches containing the DataRequests`);
      
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to find batches for DataRequests: ${error}`);
      return [];
    }
  }

  /**
   * Get cached batch if valid
   */
  private getCachedBatch(cacheKey: string): BatchTrackingInfo | null {
    const cached = this.batchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
      return cached.batch;
    }
    
    // Remove expired cache entry
    if (cached) {
      this.batchCache.delete(cacheKey);
    }
    
    return null;
  }

  /**
   * Store batch in cache with cleanup if needed
   */
  private setCachedBatch(cacheKey: string, batch: BatchTrackingInfo): void {
    // Clean up cache if it's getting too large
    if (this.batchCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKeys = Array.from(this.batchCache.keys()).slice(0, 100);
      for (const key of oldestKeys) {
        this.batchCache.delete(key);
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

  constructor(private logger: ILoggingService) {
    this.logger.info('📦 Mock batch service initialized');
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
      .filter(batch => batch.discoveredAt >= cutoffTime)
      .sort((a, b) => a.batchNumber > b.batchNumber ? -1 : 1);
  }

  async validateBatch(batch: BatchTrackingInfo): Promise<boolean> {
    return batch.batchId !== '' && batch.merkleRoot !== '';
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