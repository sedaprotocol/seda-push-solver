/**
 * EVM Orchestrator
 * Consolidated EVM operations - replaces both EvmNetworkManager and EvmBatchManager
 * Handles all EVM network interactions including batch checking and posting
 */

import type { LoggingServiceInterface } from '../services';
import type { SignedBatch, NetworkBatchStatus, EvmNetworkConfig } from '../types';
import { getErrorMessage } from '../helpers/error-utils';
import { ProverDiscovery } from './prover-discovery';
import { BatchPoster } from './batch-poster';

/**
 * Unified orchestrator for all EVM network operations
 */
export class EvmOrchestrator {
  private proverDiscovery: ProverDiscovery;
  private batchPoster: BatchPoster;

  constructor(private logger: LoggingServiceInterface, private networks: EvmNetworkConfig[]) {
    this.proverDiscovery = new ProverDiscovery(logger);
    this.batchPoster = new BatchPoster(logger);
  }

  /**
   * Initialize prover contracts for all enabled networks
   */
  async initialize(): Promise<void> {
    if (this.networks.length === 0) {
      return;
    }
    
    this.logger.info(`Initializing ${this.networks.length} EVM networks`);
    
    const discoveries = await Promise.all(
      this.networks.map(network => 
        this.proverDiscovery.discoverProverAddress(network)
      )
    );
     
    const successCount = discoveries.filter((addr: string | null) => addr !== null).length;
    this.logger.info(`Discovered ${successCount}/${this.networks.length} prover contracts`);
  }

  /**
   * Process batch across all networks - main entry point
   */
  async processBatch(batch: SignedBatch): Promise<NetworkBatchStatus[]> {
    if (this.networks.length === 0) {
      this.logger.info('No EVM networks configured');
      return [];
    }
    
    this.logger.info(`Processing batch ${batch.batchNumber} on ${this.networks.length} EVM networks`);

    const results = await Promise.all(
      this.networks.map(network => 
        this.processNetworkBatch(network, batch)
      )
    );

    this.logBatchSummary(Number(batch.batchNumber), results);
    return results;
  }

  /**
   * Process batch on a specific network
   */
  private async processNetworkBatch(
    network: EvmNetworkConfig,
    batch: SignedBatch
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
      
      if (batchExists) {
        this.logger.info(`${network.displayName}: Batch ${batch.batchNumber} exists (height: ${lastBatchHeight})`);
        return {
          networkName: network.displayName,
          batchExists: true,
          lastBatchHeight,
        };
      }

      // Batch missing - attempt to post
      this.logger.info(`${network.displayName}: Posting missing batch ${batch.batchNumber}`);
      const postResult = await this.batchPoster.postBatch(network, batch, proverAddress);
      
      if (postResult.success) {
        this.logger.info(`${network.displayName}: Posted batch ${batch.batchNumber} - ${postResult.txHash}`);
      } else {
        this.logger.error(`${network.displayName}: Failed to post batch - ${postResult.error}`);
      }
      
      return {
        networkName: network.displayName,
        batchExists: false,
        lastBatchHeight,
        posted: postResult.success,
        txHash: postResult.txHash,
        error: postResult.error
      };

    } catch (error) {
      const errorMsg = getErrorMessage(error);
      this.logger.warn(`${network.displayName}: Batch processing failed - ${errorMsg}`);
      return this.createErrorResult(network, errorMsg);
    }
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
    const errorCount = results.filter(r => r.error).length;
    const successfulPosts = results.filter(r => r.posted === true && r.txHash);

    this.logger.info(`Batch ${batchNumber}: ${existsCount}/${this.networks.length} networks have batch`);
    
    if (postedCount > 0) {
      this.logger.info(`Posted to ${postedCount} networks`);
      successfulPosts.forEach(result => {
        this.logger.info(`  ${result.networkName}: ${result.txHash}`);
      });
    }
    
    if (errorCount > 0) {
      this.logger.info(`${errorCount} networks had errors`);
    }
  }
} 