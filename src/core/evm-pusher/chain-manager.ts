/**
 * Chain Manager
 * Orchestrates parallel batch pushing across multiple EVM chains
 */

import type { ILoggingService } from '../../services/logging-service';
import type { 
  EVMChainConfig, 
  EVMPusherConfig,
  BatchTrackingInfo,
  MultiChainPushResult,
  BatchPushResult,
  ChainBatchStatus,
  EVMPusherEvents
} from '../../types/evm-types';
import { EVMChainExecutor } from './evm-chain-executor';
import { EventEmitter } from 'events';

/**
 * Interface for Chain Manager operations
 */
export interface IChainManager extends EventEmitter {
  /**
   * Initialize all chain executors
   */
  initialize(): Promise<void>;
  
  /**
   * Push a batch to all enabled chains in parallel
   */
  pushBatchToAllChains(batch: BatchTrackingInfo): Promise<MultiChainPushResult>;
  
  /**
   * Get status of a batch across all chains
   */
  getBatchStatus(batchNumber: bigint): Promise<Record<number, ChainBatchStatus>>;
  
  /**
   * Check health of all chain executors
   */
  checkChainsHealth(): Promise<Record<number, 'healthy' | 'degraded' | 'unhealthy'>>;
  
  /**
   * Gracefully shutdown all executors
   */
  shutdown(): Promise<void>;
  
  /**
   * Get statistics from all executors
   */
  getStatistics(): Promise<{
    totalPushes: number;
    successfulPushes: number;
    failedPushes: number;
    averagePushTimeMs: number;
    chainStatistics: Record<number, any>;
  }>;
}

/**
 * Chain Manager Implementation
 * Manages parallel execution across multiple EVM chains
 */
export class ChainManager extends EventEmitter implements IChainManager {
  private executors: Map<number, EVMChainExecutor> = new Map();
  private initialized = false;
  private shutdownRequested = false;

  constructor(
    private config: EVMPusherConfig,
    private logger: ILoggingService
  ) {
    super();
    this.logger.info(`🔗 Chain Manager initialized for ${config.enabledChains.length} chains`);
    
    // Set up event forwarding from executors
    this.setupEventForwarding();
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('⚠️  Chain Manager already initialized');
      return;
    }

    this.logger.info('🚀 Initializing Chain Manager...');

    try {
      // Initialize executor for each enabled chain
      const initPromises = this.config.enabledChains.map(async (chainId) => {
        const chainConfig = this.config.chains[chainId];
        if (!chainConfig) {
          throw new Error(`Missing configuration for chain ${chainId}`);
        }

        this.logger.info(`   Initializing executor for ${chainConfig.name} (${chainId})`);
        
        const executor = new EVMChainExecutor(chainConfig, this.logger);
        await executor.initialize();
        
        this.executors.set(chainId, executor);
        
        // Forward events from executor
        executor.on('batch-push-success', (result: BatchPushResult) => {
          this.emit('batch-push-success', result);
        });
        
        executor.on('batch-push-failed', (result: BatchPushResult) => {
          this.emit('batch-push-failed', result);
        });
        
        executor.on('chain-health-changed', (chainId: number, status: 'healthy' | 'degraded' | 'unhealthy') => {
          this.emit('chain-health-changed', chainId, status);
        });

        this.logger.info(`   ✅ ${chainConfig.name} executor ready`);
      });

      await Promise.all(initPromises);
      
      this.initialized = true;
      this.logger.info(`✅ Chain Manager initialized with ${this.executors.size} executors`);
      
    } catch (error) {
      this.logger.error(`❌ Chain Manager initialization failed: ${error}`);
      throw error;
    }
  }

  async pushBatchToAllChains(batch: BatchTrackingInfo): Promise<MultiChainPushResult> {
    if (!this.initialized) {
      throw new Error('Chain Manager not initialized');
    }

    if (this.shutdownRequested) {
      throw new Error('Chain Manager is shutting down');
    }

    const startTime = Date.now();
    this.logger.info(`🌐 Pushing batch ${batch.batchNumber} to ${this.executors.size} chains in parallel`);
    
    this.emit('batch-discovered', batch);

    try {
      // Apply concurrency limits
      const maxParallel = this.config.concurrency.maxParallelChains;
      const chainIds = Array.from(this.executors.keys());
      const chainResults: BatchPushResult[] = [];

      // Process chains in batches respecting concurrency limits
      for (let i = 0; i < chainIds.length; i += maxParallel) {
        const batch_chunk = chainIds.slice(i, i + maxParallel);
        
        this.logger.debug(`📦 Processing chain batch: ${batch_chunk.join(', ')}`);
        
        const chunkPromises = batch_chunk.map(async (chainId) => {
          const executor = this.executors.get(chainId)!;
          
          this.emit('batch-push-started', batch.batchNumber, chainId);
          
          try {
            const result = await executor.pushBatch(batch);
            
            if (result.success) {
              this.emit('batch-push-success', result);
            } else {
              this.emit('batch-push-failed', result);
            }
            
            return result;
          } catch (error) {
            const failureResult: BatchPushResult = {
              chainId,
              success: false,
              error: error instanceof Error ? error.message : String(error),
              durationMs: Date.now() - startTime
            };
            
            this.emit('batch-push-failed', failureResult);
            return failureResult;
          }
        });

        const chunkResults = await Promise.all(chunkPromises);
        chainResults.push(...chunkResults);
      }

      // Aggregate results
      const successCount = chainResults.filter(result => result.success).length;
      const failureCount = chainResults.length - successCount;
      const totalDuration = Date.now() - startTime;

      const multiChainResult: MultiChainPushResult = {
        batchNumber: batch.batchNumber,
        chainResults,
        success: failureCount === 0,
        successCount,
        failureCount,
        totalDurationMs: totalDuration
      };

      // Log summary
      this.logger.info(`🎯 Multi-chain push completed for batch ${batch.batchNumber}`);
      this.logger.info(`   Success: ${successCount}/${chainResults.length} chains`);
      this.logger.info(`   Total Duration: ${totalDuration}ms`);
      
      if (failureCount > 0) {
        this.logger.warn(`⚠️  ${failureCount} chains failed to receive the batch`);
        const failedChains = chainResults
          .filter(result => !result.success)
          .map(result => result.chainId);
        this.logger.warn(`   Failed Chain IDs: ${failedChains.join(', ')}`);
      }

      this.emit('batch-completed', multiChainResult);
      return multiChainResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ Multi-chain push failed for batch ${batch.batchNumber}: ${error}`);
      
      // Create failure result for all chains
      const chainResults: BatchPushResult[] = Array.from(this.executors.keys()).map(chainId => ({
        chainId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: duration
      }));

      const failureResult: MultiChainPushResult = {
        batchNumber: batch.batchNumber,
        chainResults,
        success: false,
        successCount: 0,
        failureCount: chainResults.length,
        totalDurationMs: duration
      };

      this.emit('batch-completed', failureResult);
      return failureResult;
    }
  }

  async getBatchStatus(batchNumber: bigint): Promise<Record<number, ChainBatchStatus>> {
    if (!this.initialized) {
      throw new Error('Chain Manager not initialized');
    }

    const statusPromises = Array.from(this.executors.entries()).map(async ([chainId, executor]) => {
      try {
        const status = await executor.getBatchStatus(batchNumber);
        return [chainId, status] as const;
      } catch (error) {
        this.logger.warn(`Failed to get batch status for chain ${chainId}: ${error}`);
        
        const failureStatus: ChainBatchStatus = {
          chainId,
          status: 'failed',
          lastError: error instanceof Error ? error.message : String(error),
          retryCount: 0
        };
        
        return [chainId, failureStatus] as const;
      }
    });

    const statusResults = await Promise.all(statusPromises);
    return Object.fromEntries(statusResults);
  }

  async checkChainsHealth(): Promise<Record<number, 'healthy' | 'degraded' | 'unhealthy'>> {
    if (!this.initialized) {
      return {};
    }

    const healthPromises = Array.from(this.executors.entries()).map(async ([chainId, executor]) => {
      try {
        const isHealthy = await executor.checkHealth();
        return [chainId, isHealthy ? 'healthy' : 'unhealthy'] as const;
      } catch (error) {
        this.logger.warn(`Health check failed for chain ${chainId}: ${error}`);
        return [chainId, 'unhealthy' as const] as const;
      }
    });

    const healthResults = await Promise.all(healthPromises);
    return Object.fromEntries(healthResults);
  }

  async getStatistics(): Promise<{
    totalPushes: number;
    successfulPushes: number;
    failedPushes: number;
    averagePushTimeMs: number;
    chainStatistics: Record<number, any>;
  }> {
    if (!this.initialized) {
      return {
        totalPushes: 0,
        successfulPushes: 0,
        failedPushes: 0,
        averagePushTimeMs: 0,
        chainStatistics: {}
      };
    }

    const statsPromises = Array.from(this.executors.entries()).map(async ([chainId, executor]) => {
      try {
        const stats = await executor.getStatistics();
        return [chainId, stats] as const;
      } catch (error) {
        this.logger.warn(`Failed to get statistics for chain ${chainId}: ${error}`);
        return [chainId, null] as const;
      }
    });

    const statsResults = await Promise.all(statsPromises);
    const chainStatistics = Object.fromEntries(
      statsResults.filter(([, stats]) => stats !== null)
    );

    // Aggregate statistics
    let totalPushes = 0;
    let successfulPushes = 0;
    let failedPushes = 0;
    let totalPushTime = 0;
    let pushCount = 0;

    for (const [, stats] of statsResults) {
      if (stats) {
        totalPushes += stats.totalPushes || 0;
        successfulPushes += stats.successfulPushes || 0;
        failedPushes += stats.failedPushes || 0;
        
        if (stats.averagePushTimeMs && stats.totalPushes) {
          totalPushTime += stats.averagePushTimeMs * stats.totalPushes;
          pushCount += stats.totalPushes;
        }
      }
    }

    const averagePushTimeMs = pushCount > 0 ? totalPushTime / pushCount : 0;

    return {
      totalPushes,
      successfulPushes,
      failedPushes,
      averagePushTimeMs,
      chainStatistics
    };
  }

  async shutdown(): Promise<void> {
    if (this.shutdownRequested) {
      this.logger.warn('⚠️  Chain Manager shutdown already in progress');
      return;
    }

    this.shutdownRequested = true;
    this.logger.info('🔄 Shutting down Chain Manager...');

    try {
      // Shutdown all executors in parallel
      const shutdownPromises = Array.from(this.executors.values()).map(executor => 
        executor.shutdown()
      );

      await Promise.all(shutdownPromises);
      
      this.executors.clear();
      this.initialized = false;
      
      this.logger.info('✅ Chain Manager shutdown complete');
    } catch (error) {
      this.logger.error(`❌ Chain Manager shutdown failed: ${error}`);
      throw error;
    }
  }

  private setupEventForwarding(): void {
    // Event forwarding is set up in the initialize method
    // when executors are created
  }
}

/**
 * Mock implementation for testing
 */
export class MockChainManager extends EventEmitter implements IChainManager {
  private mockExecutors = new Map<number, any>();
  private mockStatistics = {
    totalPushes: 0,
    successfulPushes: 0,
    failedPushes: 0
  };

  constructor(
    private config: EVMPusherConfig,
    private logger: ILoggingService
  ) {
    super();
    this.logger.info('⚡ Mock Chain Manager initialized');
  }

  async initialize(): Promise<void> {
    this.logger.info('🚀 Mock: Initializing Chain Manager...');
    
    for (const chainId of this.config.enabledChains) {
      this.mockExecutors.set(chainId, { chainId, initialized: true });
    }
    
    this.logger.info(`✅ Mock: Chain Manager initialized with ${this.mockExecutors.size} executors`);
  }

  async pushBatchToAllChains(batch: BatchTrackingInfo): Promise<MultiChainPushResult> {
    this.logger.info(`🌐 Mock: Pushing batch ${batch.batchNumber} to ${this.mockExecutors.size} chains`);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const chainResults: BatchPushResult[] = Array.from(this.mockExecutors.keys()).map(chainId => ({
      chainId,
      success: true,
      txHash: `0x${'0'.repeat(64)}`,
      blockNumber: BigInt(1000000),
      gasUsed: BigInt(300000),
      durationMs: 200
    }));

    this.mockStatistics.totalPushes += chainResults.length;
    this.mockStatistics.successfulPushes += chainResults.length;

    return {
      batchNumber: batch.batchNumber,
      chainResults,
      success: true,
      successCount: chainResults.length,
      failureCount: 0,
      totalDurationMs: 200
    };
  }

  async getBatchStatus(batchNumber: bigint): Promise<Record<number, ChainBatchStatus>> {
    const status: Record<number, ChainBatchStatus> = {};
    
    for (const chainId of this.mockExecutors.keys()) {
      status[chainId] = {
        chainId,
        status: 'pushed',
        txHash: `0x${'0'.repeat(64)}`,
        blockNumber: BigInt(1000000),
        confirmations: 10,
        retryCount: 0
      };
    }
    
    return status;
  }

  async checkChainsHealth(): Promise<Record<number, 'healthy' | 'degraded' | 'unhealthy'>> {
    const health: Record<number, 'healthy' | 'degraded' | 'unhealthy'> = {};
    
    for (const chainId of this.mockExecutors.keys()) {
      health[chainId] = 'healthy';
    }
    
    return health;
  }

  async getStatistics(): Promise<{
    totalPushes: number;
    successfulPushes: number;
    failedPushes: number;
    averagePushTimeMs: number;
    chainStatistics: Record<number, any>;
  }> {
    return {
      ...this.mockStatistics,
      averagePushTimeMs: 200,
      chainStatistics: Object.fromEntries(
        Array.from(this.mockExecutors.keys()).map(chainId => [
          chainId, 
          { totalPushes: 5, successfulPushes: 5, failedPushes: 0 }
        ])
      )
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('🔄 Mock: Shutting down Chain Manager...');
    this.mockExecutors.clear();
    this.logger.info('✅ Mock: Chain Manager shutdown complete');
  }
} 