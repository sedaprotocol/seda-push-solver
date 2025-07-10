/**
 * EVM Orchestrator
 * Consolidated EVM operations - replaces both EvmNetworkManager and EvmBatchManager
 * Handles all EVM network interactions including batch checking and posting
 */

import type { LoggingServiceInterface } from '../services';
import type { SignedBatch, NetworkBatchStatus, EvmNetworkConfig, DataRequestResult } from '../types';
import { getErrorMessage } from '../helpers/error-utils';
import { ProverDiscovery } from './prover-discovery';
import { BatchPoster } from './batch-poster';
import { ResultPoster } from './result-poster';
import { EvmNonceCoordinator, NonceStrategy } from './nonce-coordinator';

/**
 * Unified orchestrator for all EVM network operations
 */
export class EvmOrchestrator {
  private proverDiscovery: ProverDiscovery;
  private batchPoster: BatchPoster;
  private resultPoster: ResultPoster;
  private nonceCoordinator: EvmNonceCoordinator;
  
  // Cache to prevent duplicate batch posting attempts for the same batch+network combination
  private static batchPostingCache = new Map<string, Promise<any>>();
  
  // Cache expiration tracking to clean up old entries
  private static batchPostingCacheExpiry = new Map<string, number>();
  
  // Singleton instance to ensure shared nonce coordination across all DataRequest results
  private static sharedInstance: EvmOrchestrator | null = null;
  
  // Periodic cache cleanup timer
  private static cacheCleanupTimer: NodeJS.Timeout | null = null;

  constructor(private logger: LoggingServiceInterface, private networks: EvmNetworkConfig[]) {
    this.proverDiscovery = new ProverDiscovery(logger);
    this.batchPoster = new BatchPoster(logger);
    this.resultPoster = new ResultPoster(logger);
    // Initialize with HYBRID strategy for production-grade nonce management
    this.nonceCoordinator = new EvmNonceCoordinator(logger, NonceStrategy.HYBRID);
    
    // Start periodic cache cleanup to prevent memory leaks
    this.startPeriodicCacheCleanup();
  }

  /**
   * Shutdown the EVM orchestrator and clean up all resources
   */
  async shutdown(): Promise<void> {
    this.logger.info('🛑 Starting EVM orchestrator shutdown...');
    
    try {
      // Reset nonce coordinator (calls destroy on all managers)
      this.nonceCoordinator.reset();
      
      // Stop periodic cache cleanup timer
      if (EvmOrchestrator.cacheCleanupTimer) {
        clearInterval(EvmOrchestrator.cacheCleanupTimer);
        EvmOrchestrator.cacheCleanupTimer = null;
        this.logger.debug('⏰ Stopped periodic cache cleanup timer');
      }
      
      // Clear batch posting caches
      EvmOrchestrator.batchPostingCache.clear();
      EvmOrchestrator.batchPostingCacheExpiry.clear();
      
      // Clear shared instance
      EvmOrchestrator.sharedInstance = null;
      
      this.logger.info('✅ EVM orchestrator shutdown completed');
    } catch (error) {
      this.logger.error('❌ Error during EVM orchestrator shutdown:', error instanceof Error ? error : String(error));
    }
  }

  /**
   * Static method to shutdown all shared resources
   */
  static async shutdownAll(): Promise<void> {
    if (EvmOrchestrator.sharedInstance) {
      await EvmOrchestrator.sharedInstance.shutdown();
    }
    
    // Stop periodic cache cleanup timer
    if (EvmOrchestrator.cacheCleanupTimer) {
      clearInterval(EvmOrchestrator.cacheCleanupTimer);
      EvmOrchestrator.cacheCleanupTimer = null;
    }
    
    // Clear static caches
    EvmOrchestrator.batchPostingCache.clear();
    EvmOrchestrator.batchPostingCacheExpiry.clear();
  }

  /**
   * Get or create shared EvmOrchestrator instance for nonce coordination
   * This ensures all DataRequest results use the same nonce coordinator
   */
  static getSharedInstance(logger: LoggingServiceInterface, networks: EvmNetworkConfig[]): EvmOrchestrator {
    if (!EvmOrchestrator.sharedInstance) {
      logger.info('🔧 Creating shared EvmOrchestrator instance with advanced nonce coordination');
      EvmOrchestrator.sharedInstance = new EvmOrchestrator(logger, networks);
    }
    return EvmOrchestrator.sharedInstance;
  }

  /**
   * Reset the shared instance (for testing or configuration changes)
   */
  static resetSharedInstance(): void {
    if (EvmOrchestrator.sharedInstance) {
      EvmOrchestrator.sharedInstance.logger.info('🔄 Resetting shared EvmOrchestrator instance');
      EvmOrchestrator.sharedInstance.nonceCoordinator.reset();
      EvmOrchestrator.sharedInstance = null;
    }
  }

  /**
   * Initialize prover contracts for all enabled networks
   */
  async initialize(): Promise<void> {
    if (this.networks.length === 0) {
      return;
    }
    
    this.logger.info(`Initializing ${this.networks.length} EVM networks with advanced nonce management`);
    
    const discoveries = await Promise.all(
      this.networks.map(network => 
        this.proverDiscovery.discoverProverAddress(network)
      )
    );
     
    const successCount = discoveries.filter((addr: string | null) => addr !== null).length;
    this.logger.info(`Discovered ${successCount}/${this.networks.length} prover contracts`);
    
    // Log nonce coordinator status
    this.logNonceStatus();
  }

  /**
   * Process batch and optionally post results across all networks - main entry point
   */
  async processBatch(batch: SignedBatch, dataRequestResult?: DataRequestResult): Promise<NetworkBatchStatus[]> {
    if (this.networks.length === 0) {
      this.logger.info('No EVM networks configured');
      return [];
    }
    
    this.logger.info(`Processing batch ${batch.batchNumber} on ${this.networks.length} EVM networks`);

    // Phase 1: Handle batch posting (parallel across networks)
    const results = await Promise.all(
      this.networks.map(network => 
        this.processNetworkBatch(network, batch, undefined) // Don't post results yet
      )
    );

    // Phase 2: Post results sequentially across all networks where batches exist
    if (dataRequestResult) {
      this.logger.info(`🚀 Posting results sequentially across networks where batch ${batch.batchNumber} exists`);
      
      // CRITICAL: Ensure all batches are posted and confirmed before posting results
      const networksWithBatch = results
        .map((result, index) => ({ result, network: this.networks[index] }))
        .filter(({ result }) => result.batchExists || result.posted === true);

      if (networksWithBatch.length > 0) {
        this.logger.info(`📋 Ensuring batches are confirmed before posting results to ${networksWithBatch.length} networks`);
        
        // STEP 1: Ensure all batches are fully posted and confirmed
        for (const { result, network } of networksWithBatch) {
          if (!network) {
            throw new Error('Network is undefined in networksWithBatch');
          }
          
          // If batch was just posted (not pre-existing), wait for confirmation
          if (result.posted === true && !result.batchExists) {
            if (result.assumedPosted) {
              this.logger.info(`⏳ Waiting for batch ${batch.batchNumber} confirmation on ${network.displayName} (assumed posted)...`);
            } else {
              this.logger.info(`⏳ Waiting for batch ${batch.batchNumber} confirmation on ${network.displayName}...`);
            }
            await this.waitForBatchConfirmation(network, batch.batchNumber);
          }
        }
        
        this.logger.info(`✅ All batches confirmed. Posting results sequentially with advanced nonce management`);
        
        // STEP 2: Post results to all networks sequentially to avoid nonce conflicts
        for (const { result, network } of networksWithBatch) {
          if (!network) {
            throw new Error('Network is undefined in networksWithBatch');
          }
          await this.postResultToNetworkWithNonce(network, dataRequestResult, batch, result);
        }
        
        // Log nonce status after result posting
        this.logNonceStatus();
        
      } else {
        this.logger.warn(`⚠️ No networks have batch ${batch.batchNumber} available for result posting`);
      }
    }

    this.logBatchSummary(Number(batch.batchNumber), results);
    return results;
  }

  /**
   * Process batch on a specific network
   */
  private async processNetworkBatch(
    network: EvmNetworkConfig,
    batch: SignedBatch,
    dataRequestResult?: DataRequestResult
  ): Promise<NetworkBatchStatus> {
    try {
      const proverAddress = await this.proverDiscovery.discoverProverAddress(network);
      
      if (!proverAddress) {
        return this.createErrorResult(network, 'Failed to discover prover contract address');
      }

      const lastBatchHeight = await this.proverDiscovery.getLastBatchHeight(network, proverAddress);
      
      if (lastBatchHeight === null) {
        return this.createErrorResult(network, 'Failed to query last batch height');
      }
      
      const batchExists = lastBatchHeight >= BigInt(batch.batchNumber);
      
      // Initialize result for this network
      const networkResult: NetworkBatchStatus = {
        networkName: network.displayName,
        batchExists,
        lastBatchHeight,
      };

      if (batchExists) {
        this.logger.info(`${network.displayName}: Batch ${batch.batchNumber} exists (height: ${lastBatchHeight})`);
        
        // If batch exists and we have a DataRequest result, result posting will be handled in sequential phase
        if (dataRequestResult) {
          this.logger.debug(`${network.displayName}: Batch exists, result posting will be handled in sequential phase`);
        }
        
        return networkResult;
      }

      // Batch missing - attempt to post with atomic deduplication
      const cacheKey = `${network.displayName}-${batch.batchNumber}`;
      
      // Clean up expired cache entries first
      this.cleanupExpiredCacheEntries();
      
      let postResult;
      let existingPromise = EvmOrchestrator.batchPostingCache.get(cacheKey);
      
      if (existingPromise) {
        // Batch posting already in progress - wait for it to complete
        this.logger.info(`${network.displayName}: Batch ${batch.batchNumber} posting already in progress - waiting...`);
        postResult = await existingPromise;
        this.logger.info(`${network.displayName}: Batch ${batch.batchNumber} posting completed (deduplicated)`);
        
        // Update networkResult with the cached posting result
        if (postResult.success) {
          this.logger.info(`${network.displayName}: Using cached batch posting result - ${postResult.txHash}`);
          networkResult.posted = true;
          networkResult.txHash = postResult.txHash;
        } else {
          this.logger.warn(`${network.displayName}: Using cached batch posting result - ${postResult.error}`);
          this.logger.info(`${network.displayName}: Assuming batch ${batch.batchNumber} is already posted, continuing with result posting`);
          // Assume batch is already posted and continue with result posting
          networkResult.posted = true;
          networkResult.error = postResult.error;
          networkResult.assumedPosted = true; // Flag to indicate this was an assumption
        }
      } else {
        // Atomically create and cache the posting promise to prevent race conditions
        this.logger.info(`${network.displayName}: Posting missing batch ${batch.batchNumber}`);
        
        const postingPromise = this.batchPoster.postBatch(network, batch, proverAddress);
        
        // Check one more time if another thread already started posting
        existingPromise = EvmOrchestrator.batchPostingCache.get(cacheKey);
        if (existingPromise) {
          this.logger.info(`${network.displayName}: Batch ${batch.batchNumber} posting started by another thread - waiting...`);
          postResult = await existingPromise;
          this.logger.info(`${network.displayName}: Batch ${batch.batchNumber} posting completed (deduplicated late)`);
          
          // Update networkResult with the cached posting result
          if (postResult.success) {
            this.logger.info(`${network.displayName}: Using cached batch posting result (late) - ${postResult.txHash}`);
            networkResult.posted = true;
            networkResult.txHash = postResult.txHash;
          } else {
            this.logger.warn(`${network.displayName}: Using cached batch posting result (late) - ${postResult.error}`);
            this.logger.info(`${network.displayName}: Assuming batch ${batch.batchNumber} is already posted, continuing with result posting`);
            // Assume batch is already posted and continue with result posting
            networkResult.posted = true;
            networkResult.error = postResult.error;
            networkResult.assumedPosted = true; // Flag to indicate this was an assumption
          }
        } else {
          // We're the first thread to post this batch
          EvmOrchestrator.batchPostingCache.set(cacheKey, postingPromise);
          
          // Set expiration time for this cache entry (10 minutes from now)
          const expirationTime = Date.now() + (10 * 60 * 1000); // 10 minutes
          EvmOrchestrator.batchPostingCacheExpiry.set(cacheKey, expirationTime);
          
          try {
            postResult = await postingPromise;
            
            if (postResult.success) {
              this.logger.info(`${network.displayName}: Posted batch ${batch.batchNumber} - ${postResult.txHash}`);
              networkResult.posted = true;
              networkResult.txHash = postResult.txHash;
            } else {
              this.logger.warn(`${network.displayName}: Failed to post batch - ${postResult.error}`);
              this.logger.info(`${network.displayName}: Assuming batch ${batch.batchNumber} is already posted, continuing with result posting`);
              // Assume batch is already posted and continue with result posting
              networkResult.posted = true;
              networkResult.error = postResult.error;
              networkResult.assumedPosted = true; // Flag to indicate this was an assumption
            }
          } catch (error) {
            // If posting fails, clean up cache entry immediately so retry is possible
            EvmOrchestrator.batchPostingCache.delete(cacheKey);
            EvmOrchestrator.batchPostingCacheExpiry.delete(cacheKey);
            throw error;
          }
          
          // Don't clean up cache entry here - let it expire naturally
          // This prevents duplicate posting attempts for the same batch across multiple DataRequest results
        }
      }

      return networkResult;
      
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      this.logger.warn(`${network.displayName}: Error processing batch - ${errorMsg}`);
      return this.createErrorResult(network, errorMsg);
    }
  }

  /**
   * Start periodic cache cleanup to prevent memory leaks
   */
  private startPeriodicCacheCleanup(): void {
    // Only start cleanup timer once (static timer shared across instances)
    if (EvmOrchestrator.cacheCleanupTimer) {
      return;
    }
    
    // Clean up cache every 5 minutes
    EvmOrchestrator.cacheCleanupTimer = setInterval(() => {
      this.cleanupExpiredCacheEntries();
      
      // Also log cache statistics periodically
      const cacheSize = EvmOrchestrator.batchPostingCache.size;
      const expirySize = EvmOrchestrator.batchPostingCacheExpiry.size;
      
      if (cacheSize > 0 || expirySize > 0) {
        this.logger.debug(`📊 Batch posting cache stats: ${cacheSize} active entries, ${expirySize} expiry entries`);
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    this.logger.debug('⏰ Started periodic cache cleanup (5-minute intervals)');
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCacheEntries(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    // Find expired entries
    for (const [key, expirationTime] of EvmOrchestrator.batchPostingCacheExpiry.entries()) {
      if (now > expirationTime) {
        expiredKeys.push(key);
      }
    }
    
    // Clean up expired entries
    for (const key of expiredKeys) {
      EvmOrchestrator.batchPostingCache.delete(key);
      EvmOrchestrator.batchPostingCacheExpiry.delete(key);
    }
    
    if (expiredKeys.length > 0) {
      this.logger.debug(`🧹 Cleaned up ${expiredKeys.length} expired batch posting cache entries`);
    }
  }

  /**
   * Wait for batch confirmation on a specific network
   */
  private async waitForBatchConfirmation(network: EvmNetworkConfig, batchNumber: bigint): Promise<void> {
    const maxAttempts = 10;
    const delayMs = 2000; // 2 seconds
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const proverAddress = await this.proverDiscovery.discoverProverAddress(network);
        if (!proverAddress) {
          throw new Error('Failed to discover prover contract address');
        }

        const lastBatchHeight = await this.proverDiscovery.getLastBatchHeight(network, proverAddress);
        if (lastBatchHeight !== null && lastBatchHeight >= batchNumber) {
          this.logger.info(`✅ Batch ${batchNumber} confirmed on ${network.displayName} (height: ${lastBatchHeight})`);
          return;
        }
        
        this.logger.debug(`⏳ Batch ${batchNumber} not yet confirmed on ${network.displayName} (attempt ${attempt}/${maxAttempts}, current height: ${lastBatchHeight})`);
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
      } catch (error) {
        this.logger.warn(`⚠️ Error checking batch confirmation on ${network.displayName} (attempt ${attempt}): ${getErrorMessage(error)}`);
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    this.logger.warn(`⚠️ Batch ${batchNumber} confirmation timeout on ${network.displayName} after ${maxAttempts} attempts`);
  }

  /**
   * Get status of all networks
   */
  async getNetworkStatuses(): Promise<{ network: string; status: string; lastBatch?: bigint }[]> {
    return Promise.all(
      this.networks.map(async network => {
        try {
          const proverAddress = await this.proverDiscovery.discoverProverAddress(network);
          if (!proverAddress) {
            return { network: network.displayName, status: 'no prover address' };
          }
          
          const lastBatch = await this.proverDiscovery.getLastBatchHeight(network, proverAddress);
          if (lastBatch === null) {
            return { network: network.displayName, status: 'query failed' };
          }
          
          return { 
            network: network.displayName, 
            status: 'connected', 
            lastBatch 
          };
          
        } catch (error) {
          return { 
            network: network.displayName, 
            status: `error: ${getErrorMessage(error)}` 
          };
        }
      })
    );
  }

  /**
   * Post DataRequest result to a specific network with advanced nonce coordination
   */
  private async postResultToNetworkWithNonce(
    network: EvmNetworkConfig,
    dataRequestResult: DataRequestResult,
    batch: SignedBatch,
    networkResult: NetworkBatchStatus
  ): Promise<void> {
    try {
      this.logger.info(`🔍 Attempting to post result for DR ${dataRequestResult.drId} to ${network.displayName} (with advanced nonce coordination)`);
      
      const resultPostResult = await this.resultPoster.postResultWithNonce(
        network,
        dataRequestResult,
        batch,
        network.contractAddress, // SEDA Core contract address
        this.nonceCoordinator
      );

      // Update network result with result posting info
      networkResult.resultPosted = resultPostResult.success;
      networkResult.resultTxHash = resultPostResult.txHash;
      networkResult.resultError = resultPostResult.error;
      networkResult.resultId = resultPostResult.resultId;

      if (resultPostResult.success) {
        if (resultPostResult.txHash) {
          this.logger.info(`✅ ${network.displayName}: Posted result for DR ${dataRequestResult.drId} - ${resultPostResult.txHash}`);
        } else {
          this.logger.info(`✅ ${network.displayName}: Result confirmed for DR ${dataRequestResult.drId} - ${resultPostResult.error || 'already exists'}`);
        }
      } else {
        this.logger.warn(`⚠️ ${network.displayName}: Failed to post result - ${resultPostResult.error}`);
      }
      
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      this.logger.warn(`⚠️ ${network.displayName}: Result posting failed - ${errorMsg}`);
      networkResult.resultPosted = false;
      networkResult.resultError = errorMsg;
    }
  }

  /**
   * Post DataRequest result to a specific network (legacy method without nonce coordination)
   */
  private async postResultToNetwork(
    network: EvmNetworkConfig,
    dataRequestResult: DataRequestResult,
    batch: SignedBatch,
    networkResult: NetworkBatchStatus
  ): Promise<void> {
    try {
      this.logger.info(`🔍 Attempting to post result for DR ${dataRequestResult.drId} to ${network.displayName}`);
      
      const resultPostResult = await this.resultPoster.postResult(
        network,
        dataRequestResult,
        batch,
        network.contractAddress // SEDA Core contract address
      );

      // Update network result with result posting info
      networkResult.resultPosted = resultPostResult.success;
      networkResult.resultTxHash = resultPostResult.txHash;
      networkResult.resultError = resultPostResult.error;
      networkResult.resultId = resultPostResult.resultId;

      if (resultPostResult.success) {
        if (resultPostResult.txHash) {
          this.logger.info(`✅ ${network.displayName}: Posted result for DR ${dataRequestResult.drId} - ${resultPostResult.txHash}`);
        } else {
          this.logger.info(`✅ ${network.displayName}: Result confirmed for DR ${dataRequestResult.drId} - ${resultPostResult.error || 'already exists'}`);
        }
      } else {
        this.logger.warn(`⚠️ ${network.displayName}: Failed to post result - ${resultPostResult.error}`);
      }
      
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      this.logger.warn(`⚠️ ${network.displayName}: Result posting failed - ${errorMsg}`);
      networkResult.resultPosted = false;
      networkResult.resultError = errorMsg;
    }
  }

  /**
   * Log comprehensive nonce status for debugging
   */
  private logNonceStatus(): void {
    const summary = this.nonceCoordinator.getSummary();
    const status = this.nonceCoordinator.getComprehensiveStatus();
    
    this.logger.info(`🔢 Nonce Coordinator Status:`);
    this.logger.info(`   Networks: ${summary.totalNetworks}, Pending TXs: ${summary.totalPendingTransactions}`);
    this.logger.info(`   Gaps: ${summary.networksWithGaps}, Stuck: ${summary.networksWithStuckTx}`);
    
    // Log detailed status for networks with issues
    for (const [key, info] of Object.entries(status)) {
      if (info.gaps.length > 0 || info.pendingTransactions.some(tx => tx.isStuck)) {
        this.logger.warn(`⚠️ ${key}: confirmed=${info.confirmed}, pending=${info.pending}, gaps=[${info.gaps.join(',')}]`);
        
        const stuckTxs = info.pendingTransactions.filter(tx => tx.isStuck);
        if (stuckTxs.length > 0) {
          this.logger.warn(`   Stuck transactions: ${stuckTxs.map(tx => `${tx.nonce}(${tx.retryCount})`).join(', ')}`);
        }
      }
    }
  }

  /**
   * Force refresh all nonce managers (for error recovery)
   */
  async refreshNonceManagers(): Promise<void> {
    this.logger.info('🔄 Refreshing all nonce managers for error recovery');
    await this.nonceCoordinator.refreshAllNonces();
    this.logNonceStatus();
  }

  private createErrorResult(network: EvmNetworkConfig, error: string): NetworkBatchStatus {
    return {
      networkName: network.displayName,
      batchExists: false,
      lastBatchHeight: null,
      error
    };
  }

  private logBatchSummary(batchNumber: number, results: NetworkBatchStatus[]): void {
    const existsCount = results.filter(r => r.batchExists).length;
    const postedCount = results.filter(r => r.posted === true).length;
    const assumedPostedCount = results.filter(r => r.assumedPosted === true).length;
    const errorCount = results.filter(r => r.error).length;
    const successfulPosts = results.filter(r => r.posted === true && r.txHash);
    const assumedPosts = results.filter(r => r.assumedPosted === true);
    
    // Result posting summary
    const resultAttemptedCount = results.filter(r => r.resultPosted !== undefined).length;
    const resultPostedCount = results.filter(r => r.resultPosted === true).length;
    const successfulResultPosts = results.filter(r => r.resultPosted === true && r.resultTxHash);

    this.logger.info(`📊 Batch ${batchNumber} Summary:`);
    this.logger.info(`   📦 Batches: ${existsCount}/${this.networks.length} exist, ${postedCount} posted`);
    
    if (assumedPostedCount > 0) {
      this.logger.info(`   ⚠️ Assumed Posted: ${assumedPostedCount} batches assumed posted due to posting failures`);
    }
    
    if (resultAttemptedCount > 0) {
      this.logger.info(`   📋 Results: ${resultPostedCount}/${resultAttemptedCount} posted successfully`);
    }
    
    if (postedCount > 0) {
      this.logger.info(`   🚀 Batch Posts:`);
      successfulPosts.forEach(result => {
        this.logger.info(`     ${result.networkName}: ${result.txHash}`);
      });
    }
    
    if (assumedPostedCount > 0) {
      this.logger.info(`   🤔 Assumed Posts (batch posting failed, continuing with results):`);
      assumedPosts.forEach(result => {
        this.logger.info(`     ${result.networkName}: ${result.error}`);
      });
    }
    
    if (resultPostedCount > 0) {
      this.logger.info(`   📤 Result Posts:`);
      successfulResultPosts.forEach(result => {
        this.logger.info(`     ${result.networkName}: ${result.resultTxHash} (ID: ${result.resultId})`);
      });
    }
    
    if (errorCount > 0) {
      this.logger.info(`   ⚠️ ${errorCount} networks had errors`);
    }
  }
} 