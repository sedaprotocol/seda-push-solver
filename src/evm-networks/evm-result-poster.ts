/**
 * EVM Result Poster
 * Main class for posting SEDA results to EVM networks
 */

import type { EvmNetworkConfig } from '../../config';
import { getEvmWallet, validateEvmConnection } from './evm-provider';
import { EvmContractInteractor } from './evm-contract-interactor';
import { executeEvmOperationWithRetry, DEFAULT_EVM_RETRY_OPTIONS } from './evm-retry-handler';
import type { SedaResultData, EvmPostingResult, EvmRetryOptions } from './types';

/**
 * EVM Result Poster
 * Handles posting SEDA results to EVM networks with retry logic
 */
export class EvmResultPoster {
  private network: EvmNetworkConfig;
  private contractInteractor: EvmContractInteractor;
  private retryOptions: EvmRetryOptions;

  constructor(
    network: EvmNetworkConfig, 
    retryOptions: Partial<EvmRetryOptions> = {}
  ) {
    this.network = network;
    this.retryOptions = { ...DEFAULT_EVM_RETRY_OPTIONS, ...retryOptions };
    
    // Initialize wallet and contract interactor
    const wallet = getEvmWallet(network);
    this.contractInteractor = new EvmContractInteractor(network, wallet);
  }

  /**
   * Test connection to the EVM network
   */
  async testConnection(): Promise<boolean> {
    return validateEvmConnection(this.network);
  }

  /**
   * Post SEDA result to the EVM network with retry logic
   */
  async postResult(resultData: SedaResultData): Promise<EvmPostingResult> {
    console.log(`📤 Posting SEDA result ${resultData.drId} to ${this.network.displayName}...`);
    
    const result = await executeEvmOperationWithRetry(
      () => this.contractInteractor.postResult(resultData),
      this.retryOptions,
      `Post to ${this.network.displayName}`
    );

    if (result.success && result.data) {
      const postingResult = result.data;
      
      if (postingResult.success) {
        console.log(`✅ Successfully posted ${resultData.drId} to ${this.network.displayName}`);
        console.log(`   TX Hash: ${postingResult.txHash}`);
        console.log(`   Block: ${postingResult.blockNumber}`);
        console.log(`   Gas Used: ${postingResult.gasUsed}`);
      } else {
        console.error(`❌ Failed to post ${resultData.drId} to ${this.network.displayName}: ${postingResult.error}`);
      }
      
      return postingResult;
    } else {
      // Handle retry failure
      const failedResult: EvmPostingResult = {
        success: false,
        error: result.error?.message || 'Unknown error during retry',
        network: this.network.name,
        attempt: result.attempt,
        duration: 0
      };
      
      console.error(`❌ All retry attempts failed for ${resultData.drId} on ${this.network.displayName}`);
      return failedResult;
    }
  }

  /**
   * Get network information
   */
  getNetworkInfo(): EvmNetworkConfig {
    return { ...this.network };
  }
} 