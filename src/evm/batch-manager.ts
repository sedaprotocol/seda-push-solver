/**
 * EVM Batch Manager
 * Centralized EVM batch checking and posting operations
 */

import type { ILoggingService } from '../services';
import type { SignedBatch, NetworkBatchStatus, EvmNetworkConfig } from '../types';
import { BatchPoster } from './batch-poster';
import { ProverDiscovery } from './prover-discovery';
import { getEnabledEvmNetworks } from '../../config';

export class EvmBatchManager {
  private batchPoster: BatchPoster;
  private proverDiscovery: ProverDiscovery;

  constructor(private logger: ILoggingService) {
    this.batchPoster = new BatchPoster(logger);
    this.proverDiscovery = new ProverDiscovery(logger);
  }

  /**
   * Check and post batch to all enabled EVM networks
   */
  async handleBatch(batch: SignedBatch): Promise<NetworkBatchStatus[]> {
    const enabledNetworks = getEnabledEvmNetworks();
    
    if (enabledNetworks.length === 0) {
      this.logger.info('No EVM networks configured - skipping batch operations');
      return [];
    }
    
    this.logger.info(`🌐 Checking and posting batch ${batch.batchNumber} on ${enabledNetworks.length} EVM networks...`);
    
    // Process all networks in parallel
    const results = await Promise.all(
      enabledNetworks.map(network => 
        this.checkAndPostBatchOnNetwork(network, batch)
      )
    );
    
    // Log summary
    const existsCount = results.filter(r => r.batchExists).length;
    const postedCount = results.filter(r => r.posted).length;
    const errorCount = results.filter(r => r.error).length;
    
    this.logger.info(`📊 Batch processing summary: ${existsCount}/${enabledNetworks.length} networks have batch`);
    if (postedCount > 0) {
      this.logger.info(`🚀 Posted to ${postedCount} networks`);
    }
    if (errorCount > 0) {
      this.logger.warn(`⚠️ ${errorCount} networks had errors`);
    }
    
    return results;
  }

  /**
   * Check and post batch on a specific EVM network
   */
  private async checkAndPostBatchOnNetwork(
    network: EvmNetworkConfig,
    batch: SignedBatch
  ): Promise<NetworkBatchStatus> {
    try {
      this.logger.info(`🔍 Checking batch ${batch.batchNumber} on ${network.displayName}...`);
      
      // Discover prover contract address
      const proverAddress = await this.proverDiscovery.discoverProverAddress(network);
      
      if (!proverAddress) {
        return {
          networkName: network.displayName,
          batchExists: false,
          lastBatchHeight: null,
          error: 'Failed to discover prover contract address'
        };
      }
      
      // Check if batch already exists
      const lastBatchHeight = await this.proverDiscovery.getLastBatchHeight(network, proverAddress);
      const batchExists = lastBatchHeight !== null && lastBatchHeight >= batch.batchNumber;
      
      if (batchExists) {
        this.logger.info(`✅ ${network.displayName}: Batch ${batch.batchNumber} exists (last height: ${lastBatchHeight})`);
        return {
          networkName: network.displayName,
          batchExists: true,
          lastBatchHeight,
        };
      } else {
        this.logger.info(`❌ ${network.displayName}: Batch ${batch.batchNumber} missing, posting...`);
        
        // Post the missing batch
        const postResult = await this.batchPoster.postBatch(network, batch, proverAddress);
        
        return {
          networkName: network.displayName,
          batchExists: false,
          lastBatchHeight,
          posted: postResult.success,
          txHash: postResult.txHash,
          error: postResult.error
        };
      }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`⚠️ Failed to check/post batch on ${network.displayName}: ${errorMsg}`);
      
      return {
        networkName: network.displayName,
        batchExists: false,
        lastBatchHeight: null,
        error: errorMsg
      };
    }
  }
} 