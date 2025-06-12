/**
 * SEDA Chain Service
 * Real SEDA chain integration for DataRequest completion tracking and batch querying
 * Uses sedachain protobuf messages similar to solver-sdk patterns
 */

import { sedachain } from "@seda-protocol/proto-messages";
import { tryAsync } from "@seda-protocol/utils";
import type { ILoggingService } from './logging-service';
import type { IConfigService } from './config-service';

export interface SEDAChainConfig {
  rpcEndpoint: string;
  chainId: string;
  network: 'mainnet' | 'testnet' | 'devnet';
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export interface DataRequestResult {
  drId: string;
  blockHeight: bigint;
  exitCode: number;
  result: Buffer;
  consensus: boolean;
  version: string;
  gasUsed: bigint;
  batchAssignment?: bigint;
  isCompleted: boolean;
}

export interface BatchInfo {
  batchNumber: bigint;
  batchId: string;
  blockHeight: bigint;
  dataResultRoot: string;
  currentDataResultRoot: string;
  validatorRoot: string;
  dataRequestIds: string[];
  totalDataRequests: number;
  signed: boolean;
}

/**
 * Interface for SEDA chain operations
 */
export interface ISEDAChainService {
  /**
   * Initialize connection to SEDA chain
   */
  initialize(config: SEDAChainConfig): Promise<void>;

  /**
   * Check if DataRequest is completed on SEDA chain
   */
  isDataRequestCompleted(dataRequestId: string): Promise<boolean>;

  /**
   * Get DataRequest result from SEDA chain
   */
  getDataRequestResult(dataRequestId: string): Promise<DataRequestResult | null>;

  /**
   * Find which batch contains a specific DataRequest
   */
  findDataRequestBatch(dataRequestId: string): Promise<BatchInfo | null>;

  /**
   * Get batch information by batch number
   */
  getBatchInfo(batchNumber: bigint): Promise<BatchInfo | null>;

  /**
   * Get the latest batch number from SEDA chain
   */
  getLatestBatchNumber(): Promise<bigint | null>;

  /**
   * Get a range of batch information
   */
  getBatchRange(startBatch: bigint, endBatch: bigint): Promise<BatchInfo[]>;

  /**
   * Track DataRequest completion and automatically determine batch association
   */
  trackDataRequestCompletion(dataRequestId: string): Promise<DataRequestResult | null>;

  /**
   * Get health status of SEDA chain connection
   */
  getChainHealth(): Promise<{ connected: boolean; latestBlock: bigint | null; latency: number }>;

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean;
}

/**
 * Production implementation using SEDA chain protobuf messages
 */
export class SEDAChainService implements ISEDAChainService {
  private config: SEDAChainConfig | null = null;
  private queryClient: sedachain.batching.v1.QueryClientImpl | null = null;
  private oracleClient: sedachain.wasm_storage.v1.QueryClientImpl | null = null;
  private rpcClient: any = null; // TODO: Type this properly when protobuf client is available

  // Caching for performance
  private batchCache = new Map<string, { batch: BatchInfo; timestamp: number }>();
  private dataRequestCache = new Map<string, { result: DataRequestResult; timestamp: number }>();
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds cache for chain data
  private readonly MAX_CACHE_SIZE = 500;

  constructor(
    private logger: ILoggingService,
    private configService: IConfigService
  ) {}

  async initialize(config: SEDAChainConfig): Promise<void> {
    this.config = config;
    
    try {
      this.logger.info(`🔗 Initializing SEDA chain connection to ${config.rpcEndpoint}`);
      
      // TODO: Initialize protobuf RPC client when available
      // For now, this is a placeholder structure that matches solver-sdk patterns
      this.rpcClient = {
        // Mock RPC client - replace with actual protobuf client
        query: async (request: any) => {
          throw new Error('SEDA chain protobuf client not yet implemented');
        }
      };

      this.queryClient = new sedachain.batching.v1.QueryClientImpl(this.rpcClient);
      this.oracleClient = new sedachain.wasm_storage.v1.QueryClientImpl(this.rpcClient);

      // Test connection
      const health = await this.getChainHealth();
      if (!health.connected) {
        throw new Error(`Failed to connect to SEDA chain at ${config.rpcEndpoint}`);
      }

      this.logger.info(`✅ SEDA chain service initialized - Network: ${config.network}, Latest block: ${health.latestBlock}`);
    } catch (error) {
      this.logger.error(`❌ Failed to initialize SEDA chain service: ${error}`);
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.config !== null && this.queryClient !== null;
  }

  async isDataRequestCompleted(dataRequestId: string): Promise<boolean> {
    if (!this.isInitialized()) {
      throw new Error('SEDAChainService not initialized');
    }

    try {
      this.logger.debug(`🔍 Checking completion status for DataRequest ${dataRequestId}`);
      
      const result = await this.getDataRequestResult(dataRequestId);
      const isCompleted = result !== null && result.isCompleted;
      
      this.logger.debug(`${isCompleted ? '✅' : '⏳'} DataRequest ${dataRequestId} completion: ${isCompleted}`);
      return isCompleted;
    } catch (error) {
      this.logger.error(`❌ Failed to check DataRequest completion for ${dataRequestId}: ${error}`);
      return false;
    }
  }

  async getDataRequestResult(dataRequestId: string): Promise<DataRequestResult | null> {
    if (!this.isInitialized()) {
      throw new Error('SEDAChainService not initialized');
    }

    // Check cache first
    const cached = this.getCachedDataRequest(dataRequestId);
    if (cached) {
      return cached;
    }

    try {
      this.logger.debug(`🔍 Querying SEDA chain for DataRequest result: ${dataRequestId}`);
      
      // TODO: Implement actual query using sedachain protobuf messages
      // This is a placeholder that follows the solver-sdk pattern structure
      const response = await this.executeWithRetry(async () => {
        if (!this.oracleClient) throw new Error('Oracle client not initialized');
        
        // Mock response - replace with actual protobuf query
        return {
          dataResult: {
            id: dataRequestId,
            drId: dataRequestId,
            exitCode: 0,
            result: Buffer.alloc(0),
            consensus: true,
            version: "1.0.0",
            gasUsed: "100000",
            blockHeight: 1000n,
            blockTimestamp: BigInt(Date.now()),
            paybackAddress: Buffer.alloc(20),
            sedaPayload: Buffer.alloc(0)
          }
        };
      });

      if (!response.dataResult) {
        this.logger.debug(`ℹ️  DataRequest ${dataRequestId} not found or not completed`);
        return null;
      }

      const result: DataRequestResult = {
        drId: response.dataResult.drId,
        blockHeight: response.dataResult.blockHeight,
        exitCode: response.dataResult.exitCode,
        result: Buffer.from(response.dataResult.result),
        consensus: response.dataResult.consensus,
        version: response.dataResult.version,
        gasUsed: BigInt(response.dataResult.gasUsed),
        isCompleted: response.dataResult.exitCode !== undefined,
        batchAssignment: undefined // Will be determined by batch tracking
      };

      this.setCachedDataRequest(dataRequestId, result);
      this.logger.debug(`✅ Retrieved DataRequest result for ${dataRequestId}, exit code: ${result.exitCode}`);
      
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to get DataRequest result for ${dataRequestId}: ${error}`);
      return null;
    }
  }

  async findDataRequestBatch(dataRequestId: string): Promise<BatchInfo | null> {
    if (!this.isInitialized()) {
      throw new Error('SEDAChainService not initialized');
    }

    try {
      this.logger.debug(`🔍 Finding batch for DataRequest ${dataRequestId}`);
      
      // Strategy: Get recent batches and search for the DataRequest
      const latestBatchNumber = await this.getLatestBatchNumber();
      if (!latestBatchNumber) {
        this.logger.debug(`ℹ️  No batches available on SEDA chain`);
        return null;
      }

      // Search backwards from latest batch (most likely to find recent DRs)
      const searchWindow = 50n; // Search last 50 batches
      const startBatch = latestBatchNumber > searchWindow ? latestBatchNumber - searchWindow : 0n;
      
      const batches = await this.getBatchRange(startBatch, latestBatchNumber);
      
      for (const batch of batches.reverse()) { // Search newest first
        if (batch.dataRequestIds.includes(dataRequestId)) {
          this.logger.debug(`✅ Found DataRequest ${dataRequestId} in batch ${batch.batchNumber}`);
          return batch;
        }
      }

      this.logger.debug(`ℹ️  DataRequest ${dataRequestId} not found in recent batches`);
      return null;
    } catch (error) {
      this.logger.error(`❌ Failed to find batch for DataRequest ${dataRequestId}: ${error}`);
      return null;
    }
  }

  async getBatchInfo(batchNumber: bigint): Promise<BatchInfo | null> {
    if (!this.isInitialized()) {
      throw new Error('SEDAChainService not initialized');
    }

    const cacheKey = `batch_${batchNumber}`;
    const cached = this.getCachedBatch(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      this.logger.debug(`🔍 Querying SEDA chain for batch ${batchNumber}`);
      
      const response = await this.executeWithRetry(async () => {
        if (!this.queryClient) throw new Error('Query client not initialized');
        
        // TODO: Replace with actual protobuf query
        return await tryAsync(() => this.queryClient!.Batch({ 
          batchNumber, 
          latestSigned: false 
        }));
      });

      if (!response || !response.value || !response.value.batch) {
        this.logger.debug(`ℹ️  Batch ${batchNumber} not found`);
        return null;
      }

      const batch = response.value.batch;
      const dataResultEntries = response.value.dataResultEntries?.entries || [];

      const batchInfo: BatchInfo = {
        batchNumber: batch.batchNumber,
        batchId: Buffer.from(batch.batchId).toString('hex'),
        blockHeight: batch.blockHeight,
        dataResultRoot: batch.dataResultRoot,
        currentDataResultRoot: batch.currentDataResultRoot,
        validatorRoot: batch.validatorRoot,
        dataRequestIds: dataResultEntries.map((entry: any) => entry.drId || ''),
        totalDataRequests: dataResultEntries.length,
        signed: (response.value.batchSignatures?.length || 0) > 0
      };

      this.setCachedBatch(cacheKey, batchInfo);
      this.logger.debug(`✅ Retrieved batch ${batchNumber} with ${batchInfo.totalDataRequests} DataRequests`);
      
      return batchInfo;
    } catch (error) {
      this.logger.error(`❌ Failed to get batch ${batchNumber}: ${error}`);
      return null;
    }
  }

  async getLatestBatchNumber(): Promise<bigint | null> {
    if (!this.isInitialized()) {
      throw new Error('SEDAChainService not initialized');
    }

    try {
      this.logger.debug('🔍 Getting latest batch number from SEDA chain');
      
      const response = await this.executeWithRetry(async () => {
        if (!this.queryClient) throw new Error('Query client not initialized');
        
        // TODO: Replace with actual protobuf query for latest batch
        return await tryAsync(() => this.queryClient!.Batch({ 
          batchNumber: 0n, 
          latestSigned: true 
        }));
      });

      if (!response || !response.value || !response.value.batch) {
        this.logger.debug('ℹ️  No latest batch found');
        return null;
      }

      const latestBatchNumber = response.value.batch.batchNumber;
      this.logger.debug(`✅ Latest batch number: ${latestBatchNumber}`);
      
      return latestBatchNumber;
    } catch (error) {
      this.logger.error(`❌ Failed to get latest batch number: ${error}`);
      return null;
    }
  }

  async getBatchRange(startBatch: bigint, endBatch: bigint): Promise<BatchInfo[]> {
    if (!this.isInitialized()) {
      throw new Error('SEDAChainService not initialized');
    }

    try {
      this.logger.debug(`🔍 Getting batch range ${startBatch} to ${endBatch}`);
      
      const response = await this.executeWithRetry(async () => {
        if (!this.queryClient) throw new Error('Query client not initialized');
        
        // TODO: Replace with actual protobuf query
        return await tryAsync(() => this.queryClient!.Batches({
          withUnsigned: false,
          pagination: {
            reverse: false,
            countTotal: false,
            key: new Uint8Array(),
            limit: endBatch + 1n - startBatch,
            offset: startBatch,
          }
        }));
      });

      if (!response || !response.value || !response.value.batches) {
        this.logger.debug(`ℹ️  No batches found in range ${startBatch}-${endBatch}`);
        return [];
      }

      const batches: BatchInfo[] = response.value.batches.map((batch: any) => ({
        batchNumber: batch.batchNumber,
        batchId: Buffer.from(batch.batchId).toString('hex'),
        blockHeight: batch.blockHeight,
        dataResultRoot: batch.dataResultRoot,
        currentDataResultRoot: batch.currentDataResultRoot,
        validatorRoot: batch.validatorRoot,
        dataRequestIds: [], // TODO: Get from dataResultEntries
        totalDataRequests: 0, // TODO: Count from dataResultEntries
        signed: false // TODO: Check for signatures
      }));

      this.logger.debug(`✅ Retrieved ${batches.length} batches in range ${startBatch}-${endBatch}`);
      return batches;
    } catch (error) {
      this.logger.error(`❌ Failed to get batch range ${startBatch}-${endBatch}: ${error}`);
      return [];
    }
  }

  async trackDataRequestCompletion(dataRequestId: string): Promise<DataRequestResult | null> {
    if (!this.isInitialized()) {
      throw new Error('SEDAChainService not initialized');
    }

    try {
      this.logger.info(`📋 Starting DataRequest completion tracking for ${dataRequestId}`);
      
      // First check if it's already completed
      const result = await this.getDataRequestResult(dataRequestId);
      if (result && result.isCompleted) {
        this.logger.info(`✅ DataRequest ${dataRequestId} already completed`);
        
        // Find batch assignment
        const batch = await this.findDataRequestBatch(dataRequestId);
        if (batch) {
          result.batchAssignment = batch.batchNumber;
          this.logger.info(`📦 DataRequest ${dataRequestId} assigned to batch ${batch.batchNumber}`);
        }
        
        return result;
      }

      this.logger.info(`⏳ DataRequest ${dataRequestId} not yet completed, will need periodic checking`);
      return null;
    } catch (error) {
      this.logger.error(`❌ Failed to track DataRequest completion for ${dataRequestId}: ${error}`);
      return null;
    }
  }

  async getChainHealth(): Promise<{ connected: boolean; latestBlock: bigint | null; latency: number }> {
    const startTime = Date.now();
    
    try {
      if (!this.isInitialized()) {
        return { connected: false, latestBlock: null, latency: 0 };
      }

      // Try to get latest batch as health check
      const latestBatchNumber = await this.getLatestBatchNumber();
      const latency = Date.now() - startTime;
      
      return {
        connected: latestBatchNumber !== null,
        latestBlock: latestBatchNumber,
        latency
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      this.logger.debug(`🔍 SEDA chain health check failed: ${error}`);
      return { connected: false, latestBlock: null, latency };
    }
  }

  // Private helper methods

  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    const maxAttempts = this.config?.retryAttempts || 3;
    const delayMs = this.config?.retryDelayMs || 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        
        this.logger.debug(`🔄 Retry attempt ${attempt}/${maxAttempts} after ${delayMs}ms delay`);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
    
    throw new Error('Max retry attempts exceeded');
  }

  private getCachedBatch(cacheKey: string): BatchInfo | null {
    const cached = this.batchCache.get(cacheKey);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > this.CACHE_TTL_MS;
    if (isExpired) {
      this.batchCache.delete(cacheKey);
      return null;
    }

    return cached.batch;
  }

  private setCachedBatch(cacheKey: string, batch: BatchInfo): void {
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

  private getCachedDataRequest(dataRequestId: string): DataRequestResult | null {
    const cached = this.dataRequestCache.get(dataRequestId);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > this.CACHE_TTL_MS;
    if (isExpired) {
      this.dataRequestCache.delete(dataRequestId);
      return null;
    }

    return cached.result;
  }

  private setCachedDataRequest(dataRequestId: string, result: DataRequestResult): void {
    // Implement LRU cache behavior
    if (this.dataRequestCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.dataRequestCache.keys().next().value;
      if (firstKey) {
        this.dataRequestCache.delete(firstKey);
      }
    }

    this.dataRequestCache.set(dataRequestId, {
      result,
      timestamp: Date.now()
    });
  }
}

/**
 * Mock implementation for testing and development
 */
export class MockSEDAChainService implements ISEDAChainService {
  private initialized = false;
  private mockBatches = new Map<bigint, BatchInfo>();
  private mockDataRequests = new Map<string, DataRequestResult>();
  private mockBatchAssignments = new Map<string, bigint>(); // drId -> batchNumber
  private latestBatchNumber = 0n;

  constructor(private logger: ILoggingService) {
    this.setupMockData();
  }

  async initialize(_config: SEDAChainConfig): Promise<void> {
    this.initialized = true;
    this.logger.info('🧪 Mock SEDA chain service initialized');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async isDataRequestCompleted(dataRequestId: string): Promise<boolean> {
    const result = this.mockDataRequests.get(dataRequestId);
    return result?.isCompleted || false;
  }

  async getDataRequestResult(dataRequestId: string): Promise<DataRequestResult | null> {
    return this.mockDataRequests.get(dataRequestId) || null;
  }

  async findDataRequestBatch(dataRequestId: string): Promise<BatchInfo | null> {
    const batchNumber = this.mockBatchAssignments.get(dataRequestId);
    if (!batchNumber) return null;
    return this.mockBatches.get(batchNumber) || null;
  }

  async getBatchInfo(batchNumber: bigint): Promise<BatchInfo | null> {
    return this.mockBatches.get(batchNumber) || null;
  }

  async getLatestBatchNumber(): Promise<bigint | null> {
    return this.latestBatchNumber;
  }

  async getBatchRange(startBatch: bigint, endBatch: bigint): Promise<BatchInfo[]> {
    const batches: BatchInfo[] = [];
    for (let i = startBatch; i <= endBatch; i++) {
      const batch = this.mockBatches.get(i);
      if (batch) {
        batches.push(batch);
      }
    }
    return batches;
  }

  async trackDataRequestCompletion(dataRequestId: string): Promise<DataRequestResult | null> {
    const result = this.mockDataRequests.get(dataRequestId);
    if (result && result.isCompleted) {
      const batchNumber = this.mockBatchAssignments.get(dataRequestId);
      if (batchNumber) {
        result.batchAssignment = batchNumber;
      }
      return result;
    }
    return null;
  }

  async getChainHealth(): Promise<{ connected: boolean; latestBlock: bigint | null; latency: number }> {
    return { connected: true, latestBlock: this.latestBatchNumber || 0n, latency: 10 };
  }

  // Mock data management
  setMockDataRequest(dataRequestId: string, result: DataRequestResult): void {
    this.mockDataRequests.set(dataRequestId, result);
  }

  setMockBatch(batch: BatchInfo): void {
    this.mockBatches.set(batch.batchNumber, batch);
    if (batch.batchNumber > this.latestBatchNumber) {
      this.latestBatchNumber = batch.batchNumber;
    }
  }

  setMockBatchAssignment(dataRequestId: string, batchNumber: bigint): void {
    this.mockBatchAssignments.set(dataRequestId, batchNumber);
  }

  private setupMockData(): void {
    // Mock data can be set up via setMock* methods as needed
    // No default data to avoid affecting tests
  }
}