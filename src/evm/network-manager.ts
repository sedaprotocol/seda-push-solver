/**
 * EVM Network Manager
 * Coordinates batch checking and posting across multiple EVM networks
 */

import { getEnabledEvmNetworks } from '../../config';
import type { EvmNetworkConfig } from '../../config';
import type { LoggingServiceInterface } from '../services';
import type { SignedBatch, NetworkBatchStatus } from '../types';
import { getErrorMessage } from '../helpers/error-utils';
import { ProverDiscovery } from './prover-discovery';
import { BatchPoster } from './batch-poster';

/**
 * Manager for coordinating operations across multiple EVM networks
 */
export class EvmNetworkManager {
  private proverDiscovery: ProverDiscovery;
  private batchPoster: BatchPoster;

  constructor(private logger: LoggingServiceInterface) {
    this.proverDiscovery = new ProverDiscovery(logger);
    this.batchPoster = new BatchPoster(logger);
  }

  /**
   * Initialize EVM network prover addresses (optional optimization)
   * Pre-discovers all prover contract addresses to optimize batch checking
   */
  async initializeNetworkProvers(): Promise<void> {
    const enabledNetworks = getEnabledEvmNetworks();
    
    if (enabledNetworks.length === 0) {
      return;
    }
    
    this.logger.info(`🚀 Initializing prover contracts for ${enabledNetworks.length} EVM networks...`);
    
    // Discover all prover addresses in parallel
         const discoveries = await Promise.all(
       enabledNetworks.map(network => 
         this.proverDiscovery.discoverProverAddress(network)
       )
     );
     
     const successCount = discoveries.filter((addr: string | null) => addr !== null).length;
    this.logger.info(`✅ Successfully discovered ${successCount}/${enabledNetworks.length} prover contracts`);
  }

  /**
   * Check if a batch exists on a specific EVM network, and post it if missing
   */
  private async checkAndPostBatchOnNetwork(
    network: EvmNetworkConfig,
    batch: SignedBatch
  ): Promise<NetworkBatchStatus> {
    try {
      this.logger.debug(`🔍 Checking batch ${batch.batchNumber} on ${network.displayName}`);

      // First, discover the prover contract address
      const proverAddress = await this.proverDiscovery.discoverProverAddress(network);
      
      if (!proverAddress) {
        return {
          networkName: network.displayName,
          batchExists: false,
          lastBatchHeight: null,
          error: 'Failed to discover prover contract address'
        };
      }

      // Check the last batch height from the prover contract
      const lastBatchHeight = await this.proverDiscovery.getLastBatchHeight(network, proverAddress);
      
      if (lastBatchHeight === null) {
        return {
          networkName: network.displayName,
          batchExists: false,
          lastBatchHeight: null,
          error: 'Failed to query last batch height'
        };
      }
      
      const batchExists = lastBatchHeight >= batch.batchNumber;
      
      if (batchExists) {
        this.logger.info(`✅ ${network.displayName}: Batch ${batch.batchNumber} EXISTS (last height: ${lastBatchHeight})`);
        
        return {
          networkName: network.displayName,
          batchExists: true,
          lastBatchHeight,
        };
      } else {
        this.logger.info(`❌ ${network.displayName}: Batch ${batch.batchNumber} MISSING (last height: ${lastBatchHeight})`);

        // Attempt to post the missing batch
        this.logger.info(`🚀 Attempting to post missing batch ${batch.batchNumber} to ${network.displayName}...`);

        const postResult = await this.batchPoster.postBatch(network, batch, proverAddress);
        
        if (postResult.success && postResult.txHash) {
          this.logger.info(`🎉 Successfully posted batch ${batch.batchNumber} to ${network.displayName}`);
          this.logger.info(`📤 TX Hash: ${postResult.txHash}`);
        } else if (postResult.error) {
          this.logger.error(`❌ Failed to post batch ${batch.batchNumber} to ${network.displayName}: ${postResult.error}`);
        }
        
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

  /**
   * Check and post batch to all enabled EVM networks in parallel
   */
  async checkAndPostBatchOnAllNetworks(batch: SignedBatch): Promise<NetworkBatchStatus[]> {
    const enabledNetworks = getEnabledEvmNetworks();
    
    if (enabledNetworks.length === 0) {
      this.logger.info('📡 No EVM networks configured - skipping batch checking');
      return [];
    }
    
    this.logger.info(`🌐 Checking batch ${batch.batchNumber} on ${enabledNetworks.length} EVM networks`);

    // Check and post to all networks in parallel
    const results = await Promise.all(
      enabledNetworks.map(network => 
        this.checkAndPostBatchOnNetwork(network, batch)
      )
    );

    // Count results and generate summary
    const existsCount = results.filter(r => r.batchExists).length;
    const postedCount = results.filter(r => r.posted === true).length;
    const errorCount = results.filter(r => r.error).length;
    const successfulPosts = results.filter(r => r.posted === true && r.txHash);

    // Summary logging
    this.logger.info(`📊 Batch ${batch.batchNumber} status: ${existsCount}/${enabledNetworks.length} networks have batch`);
    if (postedCount > 0) {
      this.logger.info(`🚀 Posted to ${postedCount} networks`);
      
      // Log all successful transaction hashes
      if (successfulPosts.length > 0) {
        this.logger.info(`📋 Transaction Hashes:`);
        successfulPosts.forEach(result => {
          this.logger.info(`   ${result.networkName}: ${result.txHash}`);
        });
      }
    }
    if (errorCount > 0) {
      this.logger.info(`❌ Errors on ${errorCount} networks`);
    }

    return results;
  }

  /**
   * Get status of all enabled EVM networks
   */
  async getNetworkStatuses(): Promise<{ network: string; status: string; lastBatch?: bigint }[]> {
    const enabledNetworks = getEnabledEvmNetworks();
    
    const statuses = await Promise.all(
      enabledNetworks.map(async network => {
        try {
          const proverAddress = await this.proverDiscovery.discoverProverAddress(network);
          if (!proverAddress) {
            return { network: network.displayName, status: 'error: no prover address' };
          }
          
          const lastBatch = await this.proverDiscovery.getLastBatchHeight(network, proverAddress);
          if (lastBatch === null) {
            return { network: network.displayName, status: 'error: query failed' };
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
    
    return statuses;
  }
} 