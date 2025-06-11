/**
 * Batch Service
 * SEDA chain integration for batch querying and DataRequest tracking using solver-sdk
 */

import type { ILoggingService } from './logging-service';
import type { BatchTrackingInfo, BatchSignature } from '../types/evm-types';

// TODO: Import solver-sdk batch functionality when dependencies are available
// import { getBatch, getBatches, getLatestBatch } from '../../solver-sdk/src/services/batch-service';
// import type { Batch, UnsignedBatch } from '../../solver-sdk/src/models/batch';
// import type { SedaChain } from '../../solver-sdk/src/chains/seda/seda-chain';
// import { Result, Maybe } from 'true-myth';

// Temporary mock types for development
type Batch = {
  batchNumber: bigint;
  batchId: string;
  blockHeight: bigint;
  dataResultRoot: string;
  secp256k1Signatures: Array<{
    validatorAddr: string;
    signature: { getRawSignature(): Buffer };
    ethAddress: Buffer;
    votingPowerPercentage: number;
    proof: Buffer[];
  }>;
};

type UnsignedBatch = {
  batchNumber: bigint;
};

type SedaChain = {
  getSignerAddress(): string;
};

type Result<T, E> = {
  isErr: boolean;
  isOk: boolean;
  value: T;
  error: E;
};

type Maybe<T> = {
  isNothing: boolean;
  isJust: boolean;
  value: T;
};

// Temporary mock functions
const getBatch = async (_batchNumber: bigint, _sedaChain: SedaChain): Promise<Result<Maybe<Batch>, Error>> => {
  throw new Error('Solver SDK not available - this is a development placeholder');
};

const getBatches = async (_start: bigint, _end: bigint, _sedaChain: SedaChain): Promise<Result<UnsignedBatch[], Error>> => {
  throw new Error('Solver SDK not available - this is a development placeholder');
};

const getLatestBatch = async (_sedaChain: SedaChain): Promise<Result<Batch, Error>> => {
  throw new Error('Solver SDK not available - this is a development placeholder');
};

/**
 * Interface for SEDA batch operations
 */
export interface IBatchService {
  /**
   * Initialize the batch service with SEDA chain connection
   */
  initialize(sedaChain: SedaChain): Promise<void>;

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
 * Production implementation using solver-sdk for SEDA chain integration
 */
export class BatchService implements IBatchService {
  private sedaChain: SedaChain | null = null;
  private batchCache = new Map<string, { batch: BatchTrackingInfo; timestamp: number }>();
  private dataRequestBatchCache = new Map<string, bigint>(); // drId -> batchNumber
  private readonly CACHE_TTL_MS = 60_000; // 1 minute cache
  private readonly MAX_CACHE_SIZE = 1000;

  constructor(private logger: ILoggingService) {
    this.logger.info('📦 SEDA batch service initializing...');
  }

  async initialize(sedaChain: SedaChain): Promise<void> {
    this.sedaChain = sedaChain;
    this.logger.info(`📦 SEDA batch service initialized with chain address: ${sedaChain.getSignerAddress()}`);
  }

  isInitialized(): boolean {
    return this.sedaChain !== null;
  }

  async getBatch(batchNumber: bigint): Promise<BatchTrackingInfo | null> {
    if (!this.sedaChain) {
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
      
      const result = await getBatch(batchNumber, this.sedaChain);
      
      if (result.isErr) {
        this.logger.error(`❌ Failed to get batch ${batchNumber}: ${result.error.message}`);
        return null;
      }

      if (result.value.isNothing) {
        this.logger.debug(`ℹ️  Batch ${batchNumber} not found`);
        return null;
      }

      const solverBatch = result.value.value;
      const trackingInfo = this.convertToTrackingInfo(solverBatch);
      
      this.setCachedBatch(cacheKey, trackingInfo);
      this.logger.debug(`✅ Retrieved batch ${batchNumber} with ${trackingInfo.dataRequestIds.length} DataRequests`);
      
      return trackingInfo;
    } catch (error) {
      this.logger.error(`❌ Failed to get batch ${batchNumber}: ${error}`);
      return null;
    }
  }

  async getLatestBatch(): Promise<BatchTrackingInfo | null> {
    if (!this.sedaChain) {
      throw new Error('BatchService not initialized. Call initialize() first.');
    }

    try {
      this.logger.debug('🔍 Querying SEDA chain for latest batch');
      
      const result = await getLatestBatch(this.sedaChain);
      
      if (result.isErr) {
        this.logger.error(`❌ Failed to get latest batch: ${result.error.message}`);
        return null;
      }

      const trackingInfo = this.convertToTrackingInfo(result.value);
      this.logger.debug(`✅ Retrieved latest batch ${trackingInfo.batchNumber}`);
      
      return trackingInfo;
    } catch (error) {
      this.logger.error(`❌ Failed to get latest batch: ${error}`);
      return null;
    }
  }

  async getBatchRange(startBatch: bigint, endBatch: bigint): Promise<BatchTrackingInfo[]> {
    if (!this.sedaChain) {
      throw new Error('BatchService not initialized. Call initialize() first.');
    }

    try {
      this.logger.debug(`🔍 Querying SEDA chain for batch range ${startBatch} to ${endBatch}`);
      
      const result = await getBatches(startBatch, endBatch, this.sedaChain);
      
      if (result.isErr) {
        this.logger.error(`❌ Failed to get batch range: ${result.error.message}`);
        return [];
      }

      // For unsigned batches, we need to get full batch details individually
      const trackingInfos: BatchTrackingInfo[] = [];
      
      for (const unsignedBatch of result.value) {
        const fullBatch = await this.getBatch(unsignedBatch.batchNumber);
        if (fullBatch) {
          trackingInfos.push(fullBatch);
        }
      }
      
      this.logger.debug(`✅ Retrieved ${trackingInfos.length} batches from range`);
      return trackingInfos;
    } catch (error) {
      this.logger.error(`❌ Failed to get batch range: ${error}`);
      return [];
    }
  }

  async findDataRequestBatch(dataRequestId: string): Promise<BatchTrackingInfo | null> {
    if (!this.sedaChain) {
      throw new Error('BatchService not initialized. Call initialize() first.');
    }

    try {
      // Check cache first
      const cachedBatchNumber = this.dataRequestBatchCache.get(dataRequestId);
      if (cachedBatchNumber !== undefined) {
        const batch = await this.getBatch(cachedBatchNumber);
        if (batch && batch.dataRequestIds.includes(dataRequestId)) {
          return batch;
        }
        // Cache was stale, remove it
        this.dataRequestBatchCache.delete(dataRequestId);
      }

      this.logger.debug(`🔍 Finding batch containing DataRequest ${dataRequestId}`);
      
      // Search recent batches for the DataRequest
      const recentBatches = await this.getRecentBatches(3600_000, 50); // Last hour, up to 50 batches
      
      for (const batch of recentBatches) {
        if (batch.dataRequestIds.includes(dataRequestId)) {
          this.logger.debug(`✅ Found DataRequest ${dataRequestId} in batch ${batch.batchNumber}`);
          // Cache the result
          this.dataRequestBatchCache.set(dataRequestId, batch.batchNumber);
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

  async getRecentBatches(maxAgeMs: number, windowSize: number = 20): Promise<BatchTrackingInfo[]> {
    if (!this.sedaChain) {
      throw new Error('BatchService not initialized. Call initialize() first.');
    }

    try {
      const cutoffTime = Date.now() - maxAgeMs;
      this.logger.debug(`🔍 Getting recent batches (max age: ${maxAgeMs}ms, window: ${windowSize})`);
      
      // Get latest batch and work backwards
      const latestBatch = await this.getLatestBatch();
      if (!latestBatch) {
        return [];
      }

      const recentBatches: BatchTrackingInfo[] = [];
      
      // Start from latest and go backwards
      let currentBatchNum = latestBatch.batchNumber;
      let searchCount = 0;
      
      while (searchCount < windowSize) {
        const batch = await this.getBatch(currentBatchNum);
        if (!batch) {
          // If we can't find a batch, skip to next
          currentBatchNum--;
          searchCount++;
          continue;
        }
        
        // Check if batch is too old
        if (batch.discoveredAt < cutoffTime) {
          break;
        }
        
        recentBatches.push(batch);
        currentBatchNum--;
        searchCount++;
      }
      
      // Sort by batch number descending (most recent first)
      recentBatches.sort((a, b) => a.batchNumber > b.batchNumber ? -1 : 1);
      
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

      // Validate signatures have required fields
      for (const signature of batch.signatures) {
        if (!signature.validatorAddress || !signature.ethAddress) {
          this.logger.error(`❌ Batch ${batch.batchNumber} has invalid signature`);
          return false;
        }
      }
      
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

  async getBatchTrackingInfo(batchNumber: bigint): Promise<BatchTrackingInfo | null> {
    // This is an alias for getBatch for EVM pusher compatibility
    return this.getBatch(batchNumber);
  }

  /**
   * Convert solver-sdk Batch to our BatchTrackingInfo format
   */
  private convertToTrackingInfo(solverBatch: Batch): BatchTrackingInfo {
    const signatures: BatchSignature[] = solverBatch.secp256k1Signatures.map(sig => ({
      validatorAddress: sig.validatorAddr,
      signature: sig.signature.getRawSignature(),
      ethAddress: sig.ethAddress.toString('hex'),
      votingPowerPercentage: sig.votingPowerPercentage,
      proof: sig.proof
    }));

    // Extract DataRequest IDs from data result entries
    // TODO: This needs to be implemented based on how DataResults are structured
    const dataRequestIds: string[] = [];
    
    return {
      batchNumber: solverBatch.batchNumber,
      batchId: solverBatch.batchId,
      merkleRoot: solverBatch.dataResultRoot,
      signatures,
      sedaBlockHeight: solverBatch.blockHeight,
      dataRequestIds,
      chainStatus: new Map(),
      discoveredAt: Date.now()
    };
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
  private initialized = false;

  constructor(private logger: ILoggingService) {
    this.logger.info('📦 Mock batch service initialized');
  }

  async initialize(_sedaChain: SedaChain): Promise<void> {
    this.initialized = true;
    this.logger.info('📦 Mock batch service initialized with SEDA chain');
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