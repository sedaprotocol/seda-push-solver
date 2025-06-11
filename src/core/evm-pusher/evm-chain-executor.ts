/**
 * EVM Chain Executor
 * Handles all interactions with a specific EVM chain
 */

import type { ILoggingService } from '../../services/logging-service';
import type {
  EVMChainConfig,
  BatchTrackingInfo,
  BatchPushResult,
  ChainBatchStatus
} from '../../types/evm-types';
import { ContractInterface } from './contract-interface';
import { executeWithRetry } from '../../helpers/retry-helper';
import { EventEmitter } from 'events';

/**
 * Interface for EVM Chain Executor operations
 */
export interface IEVMChainExecutor {
  /**
   * Initialize the executor
   */
  initialize(): Promise<void>;
  
  /**
   * Push a batch to this chain
   */
  pushBatch(batch: BatchTrackingInfo): Promise<BatchPushResult>;
  
  /**
   * Check if a batch has been pushed to this chain
   */
  isBatchPushed(batchNumber: bigint): Promise<boolean>;
  
  /**
   * Get the status of a specific batch
   */
  getBatchStatus(batchNumber: bigint): Promise<ChainBatchStatus>;
  
  /**
   * Check health of this chain connection
   */
  checkHealth(): Promise<boolean>;
  
  /**
   * Get executor statistics
   */
  getStatistics(): Promise<{
    totalPushes: number;
    successfulPushes: number;
    failedPushes: number;
    averagePushTimeMs: number;
    lastPushTime?: number;
    consecutiveFailures: number;
  }>;
  
  /**
   * Shutdown the executor
   */
  shutdown(): Promise<void>;
}

/**
 * EVM Chain Executor Implementation
 * Manages batch pushing to a single EVM chain
 */
export class EVMChainExecutor extends EventEmitter implements IEVMChainExecutor {
  private contractInterface!: ContractInterface;
  private initialized = false;
  private shutdownRequested = false;
  
  // Statistics tracking
  private statistics = {
    totalPushes: 0,
    successfulPushes: 0,
    failedPushes: 0,
    totalPushTime: 0,
    lastPushTime: undefined as number | undefined,
    consecutiveFailures: 0
  };
  
  // Batch status cache
  private batchStatusCache = new Map<bigint, ChainBatchStatus>();
  private cacheExpiryMs = 60_000; // 1 minute cache

  constructor(
    private config: EVMChainConfig,
    private logger: ILoggingService
  ) {
    super();
    this.logger.debug(`⚙️  EVM Chain Executor created for ${config.name} (${config.chainId})`);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn(`⚠️  Executor for ${this.config.name} already initialized`);
      return;
    }

    this.logger.info(`🚀 Initializing ${this.config.name} executor...`);

    try {
      // Initialize contract interface
      this.contractInterface = new ContractInterface(this.config, this.logger);
      await this.contractInterface.initialize();
      
      // Validate chain connection
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        throw new Error(`Failed to establish connection to ${this.config.name}`);
      }
      
      this.initialized = true;
      this.logger.info(`✅ ${this.config.name} executor initialized successfully`);
      
    } catch (error) {
      this.logger.error(`❌ Failed to initialize ${this.config.name} executor: ${error}`);
      throw error;
    }
  }

  async pushBatch(batch: BatchTrackingInfo): Promise<BatchPushResult> {
    if (!this.initialized) {
      throw new Error(`Executor for ${this.config.name} not initialized`);
    }

    if (this.shutdownRequested) {
      throw new Error(`Executor for ${this.config.name} is shutting down`);
    }

    const startTime = Date.now();
    const chainId = this.config.chainId;
    
    this.logger.info(`🚀 Pushing batch ${batch.batchNumber} to ${this.config.name}...`);

    try {
      // Check if batch is already pushed
      const alreadyPushed = await this.isBatchPushed(batch.batchNumber);
      if (alreadyPushed) {
        this.logger.info(`✅ Batch ${batch.batchNumber} already pushed to ${this.config.name}`);
        
        const result: BatchPushResult = {
          chainId,
          success: true,
          txHash: 'already-pushed',
          blockNumber: BigInt(0),
          gasUsed: BigInt(0),
          durationMs: Date.now() - startTime
        };
        
        this.updateStatistics(true, Date.now() - startTime);
        return result;
      }

      // Validate batch data
      this.validateBatchData(batch);

      // Push batch with retry logic
      const result = await executeWithRetry(
        async () => this.executeBatchPush(batch, startTime),
        this.config.retry.maxAttempts,
        this.config.retry.initialDelayMs,
        this.config.retry.backoffMultiplier,
        this.config.retry.maxDelayMs,
        this.logger
      );

      this.updateStatistics(result.success, Date.now() - startTime);

      if (result.success) {
        this.logger.info(`✅ Batch ${batch.batchNumber} pushed successfully to ${this.config.name}`);
        this.logger.info(`   TX: ${this.getExplorerLink(result.txHash!)}`);
        this.logger.info(`   Gas: ${result.gasUsed} | Duration: ${result.durationMs}ms`);
        
        // Clear cache for this batch
        this.batchStatusCache.delete(batch.batchNumber);
        
        this.emit('batch-push-success', result);
      } else {
        this.logger.error(`❌ Batch ${batch.batchNumber} push failed on ${this.config.name}: ${result.error}`);
        this.emit('batch-push-failed', result);
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const result: BatchPushResult = {
        chainId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: duration
      };
      
      this.updateStatistics(false, duration);
      this.logger.error(`❌ Batch ${batch.batchNumber} push failed on ${this.config.name}: ${error}`);
      
      this.emit('batch-push-failed', result);
      return result;
    }
  }

  async isBatchPushed(batchNumber: bigint): Promise<boolean> {
    try {
      // Check cache first
      const cached = this.batchStatusCache.get(batchNumber);
      if (cached && this.isCacheValid(cached)) {
        return cached.status === 'pushed';
      }

      // Query contract
      const isPushed = await this.contractInterface.isBatchPushed(batchNumber);
      
      // Update cache
      const status: ChainBatchStatus = {
        chainId: this.config.chainId,
        status: isPushed ? 'pushed' : 'pending',
        retryCount: 0,
        lastAttemptAt: Date.now()
      };
      
      this.batchStatusCache.set(batchNumber, status);
      return isPushed;
      
    } catch (error) {
      this.logger.warn(`Failed to check batch push status for ${batchNumber} on ${this.config.name}: ${error}`);
      return false;
    }
  }

  async getBatchStatus(batchNumber: bigint): Promise<ChainBatchStatus> {
    try {
      // Check cache first
      const cached = this.batchStatusCache.get(batchNumber);
      if (cached && this.isCacheValid(cached)) {
        return cached;
      }

      // Query contract for detailed status
      const batchInfo = await this.contractInterface.getBatchInfo(batchNumber);
      
      let status: ChainBatchStatus;
      
      if (batchInfo) {
        status = {
          chainId: this.config.chainId,
          status: 'pushed',
          txHash: batchInfo.txHash,
          blockNumber: batchInfo.blockNumber,
          confirmations: batchInfo.confirmations,
          retryCount: 0,
          lastAttemptAt: Date.now()
        };
      } else {
        status = {
          chainId: this.config.chainId,
          status: 'pending',
          retryCount: 0,
          lastAttemptAt: Date.now()
        };
      }
      
      this.batchStatusCache.set(batchNumber, status);
      return status;
      
    } catch (error) {
      this.logger.warn(`Failed to get batch status for ${batchNumber} on ${this.config.name}: ${error}`);
      
      return {
        chainId: this.config.chainId,
        status: 'failed',
        lastError: error instanceof Error ? error.message : String(error),
        retryCount: 0,
        lastAttemptAt: Date.now()
      };
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      if (!this.contractInterface) {
        return false;
      }
      
      return await this.contractInterface.checkHealth();
    } catch (error) {
      this.logger.warn(`Health check failed for ${this.config.name}: ${error}`);
      return false;
    }
  }

  async getStatistics() {
    const averagePushTimeMs = this.statistics.totalPushes > 0 
      ? this.statistics.totalPushTime / this.statistics.totalPushes 
      : 0;

    return {
      totalPushes: this.statistics.totalPushes,
      successfulPushes: this.statistics.successfulPushes,
      failedPushes: this.statistics.failedPushes,
      averagePushTimeMs,
      lastPushTime: this.statistics.lastPushTime,
      consecutiveFailures: this.statistics.consecutiveFailures
    };
  }

  async shutdown(): Promise<void> {
    if (this.shutdownRequested) {
      this.logger.warn(`⚠️  ${this.config.name} executor shutdown already in progress`);
      return;
    }

    this.shutdownRequested = true;
    this.logger.info(`🔄 Shutting down ${this.config.name} executor...`);

    try {
      if (this.contractInterface) {
        await this.contractInterface.shutdown();
      }
      
      // Clear caches
      this.batchStatusCache.clear();
      
      this.initialized = false;
      this.logger.info(`✅ ${this.config.name} executor shutdown complete`);
      
    } catch (error) {
      this.logger.error(`❌ ${this.config.name} executor shutdown failed: ${error}`);
      throw error;
    }
  }

  private async executeBatchPush(batch: BatchTrackingInfo, startTime: number): Promise<BatchPushResult> {
    const chainId = this.config.chainId;
    
    try {
      // Estimate gas
      const gasEstimate = await this.contractInterface.estimateGasForBatchPush(batch);
      this.logger.debug(`   Gas estimate: ${gasEstimate}`);
      
      // Execute the push transaction
      const txResult = await this.contractInterface.pushBatch(batch);
      
      return {
        chainId,
        success: true,
        txHash: txResult.txHash,
        blockNumber: txResult.blockNumber,
        gasUsed: txResult.gasUsed,
        durationMs: Date.now() - startTime
      };
      
    } catch (error) {
      throw error; // Let retry logic handle it
    }
  }

  private validateBatchData(batch: BatchTrackingInfo): void {
    if (!batch.batchId) {
      throw new Error('Invalid batch: missing batch ID');
    }
    
    if (!batch.merkleRoot) {
      throw new Error('Invalid batch: missing merkle root');
    }
    
    if (!batch.signatures || batch.signatures.length === 0) {
      throw new Error('Invalid batch: missing signatures');
    }
    
    if (!batch.batchNumber || batch.batchNumber <= 0n) {
      throw new Error('Invalid batch: invalid batch number');
    }
  }

  private updateStatistics(success: boolean, durationMs: number): void {
    this.statistics.totalPushes++;
    this.statistics.totalPushTime += durationMs;
    this.statistics.lastPushTime = Date.now();
    
    if (success) {
      this.statistics.successfulPushes++;
      this.statistics.consecutiveFailures = 0;
    } else {
      this.statistics.failedPushes++;
      this.statistics.consecutiveFailures++;
    }
    
    // Emit health change if needed
    if (this.statistics.consecutiveFailures >= 3) {
      this.emit('chain-health-changed', this.config.chainId, 'unhealthy');
    } else if (this.statistics.consecutiveFailures === 0 && this.statistics.failedPushes > 0) {
      this.emit('chain-health-changed', this.config.chainId, 'healthy');
    }
  }

  private isCacheValid(status: ChainBatchStatus): boolean {
    if (!status.lastAttemptAt) {
      return false;
    }
    
    return (Date.now() - status.lastAttemptAt) < this.cacheExpiryMs;
  }

  private getExplorerLink(txHash: string): string {
    return `${this.config.explorerUrl}/tx/${txHash}`;
  }
}

/**
 * Mock implementation for testing
 */
export class MockEVMChainExecutor extends EventEmitter implements IEVMChainExecutor {
  private mockStatistics = {
    totalPushes: 0,
    successfulPushes: 0,
    failedPushes: 0,
    averagePushTimeMs: 150,
    consecutiveFailures: 0
  };
  
  private mockBatches = new Set<bigint>();

  constructor(
    private config: EVMChainConfig,
    private logger: ILoggingService
  ) {
    super();
    this.logger.info(`⚡ Mock EVM Chain Executor created for ${config.name}`);
  }

  async initialize(): Promise<void> {
    this.logger.info(`🚀 Mock: Initializing ${this.config.name} executor...`);
    this.logger.info(`✅ Mock: ${this.config.name} executor initialized`);
  }

  async pushBatch(batch: BatchTrackingInfo): Promise<BatchPushResult> {
    this.logger.info(`🚀 Mock: Pushing batch ${batch.batchNumber} to ${this.config.name}`);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Mark batch as pushed
    this.mockBatches.add(batch.batchNumber);
    
    // Update statistics
    this.mockStatistics.totalPushes++;
    this.mockStatistics.successfulPushes++;
    
    const result: BatchPushResult = {
      chainId: this.config.chainId,
      success: true,
      txHash: `0x${'0'.repeat(64)}`,
      blockNumber: BigInt(1000000),
      gasUsed: BigInt(300000),
      durationMs: 150
    };
    
    this.emit('batch-push-success', result);
    return result;
  }

  async isBatchPushed(batchNumber: bigint): Promise<boolean> {
    return this.mockBatches.has(batchNumber);
  }

  async getBatchStatus(batchNumber: bigint): Promise<ChainBatchStatus> {
    if (this.mockBatches.has(batchNumber)) {
      return {
        chainId: this.config.chainId,
        status: 'pushed',
        txHash: `0x${'0'.repeat(64)}`,
        blockNumber: BigInt(1000000),
        confirmations: 10,
        retryCount: 0,
        lastAttemptAt: Date.now()
      };
    } else {
      return {
        chainId: this.config.chainId,
        status: 'pending',
        retryCount: 0,
        lastAttemptAt: Date.now()
      };
    }
  }

  async checkHealth(): Promise<boolean> {
    return true;
  }

  async getStatistics() {
    return {
      ...this.mockStatistics,
      lastPushTime: Date.now()
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info(`🔄 Mock: Shutting down ${this.config.name} executor...`);
    this.mockBatches.clear();
    this.logger.info(`✅ Mock: ${this.config.name} executor shutdown complete`);
  }
} 