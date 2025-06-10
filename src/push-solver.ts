/**
 * SEDA DataRequest Builder and Pusher
 * Generic SEDA oracle DataRequest posting functionality for any Oracle Program
 * 
 * This module provides the main SEDADataRequestBuilder class that orchestrates
 * DataRequest creation and posting using the modular core components:
 * - core/data-request: Handles input building, execution, and signing
 * - core/network: Manages network configurations
 * - types: Centralized type definitions
 * 
 * The builder maintains backward compatibility while leveraging the new
 * modular architecture for better maintainability and testability.
 */

import { Signer } from '@seda-protocol/dev-tools';
import { getNetworkConfig } from './core/network';
import { 
  buildDataRequestInput, 
  buildGasOptions, 
  buildAwaitOptions,
  executeDataRequest,
  initializeSigner,
  loadSEDAConfig
} from './core/data-request';
import type { SEDAConfig, DataRequestResult, DataRequestOptions } from './types';

/**
 * SEDA DataRequest Builder
 * Handles configuration and posting of DataRequests to SEDA network
 */
export class SEDADataRequestBuilder {
  private config: SEDAConfig;
  private signer: Signer | null = null;
  private isInitialized: boolean = false;

  constructor(config: SEDAConfig) {
    this.config = config;
    
    if (!this.config.mnemonic) {
      throw new Error('Mnemonic is required in SEDA configuration');
    }
  }

  /**
   * Initialize the builder (create signing configuration)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.signer = await initializeSigner(this.config);
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize signing configuration:', error);
      throw error;
    }
  }

  /**
   * Post a DataRequest to the SEDA network
   */
  async postDataRequest(options: DataRequestOptions = {}): Promise<DataRequestResult> {
    if (!this.isInitialized || !this.signer) {
      await this.initialize();
    }

    console.log('📤 Posting DataRequest to SEDA network...');
    console.log(`🌐 Network: ${this.config.network}`);
    console.log(`🔗 RPC: ${this.config.rpcEndpoint}`);

    try {
      // Get network-specific DataRequest configuration
      const networkConfig = getNetworkConfig(this.config.network);
      const drConfig = networkConfig.dataRequest;

      // Build the PostDataRequestInput using the modular function
      const postInput = buildDataRequestInput(drConfig, options);

      // Build gas and await options using modular functions
      const gasOptions = buildGasOptions(drConfig);
      const awaitOptions = buildAwaitOptions(drConfig, options);

      console.log(`   Memo: ${options.memo || drConfig.memo}`);

      // Execute the DataRequest using the modular function
      return await executeDataRequest(
        this.signer!, 
        postInput, 
        gasOptions, 
        awaitOptions, 
        networkConfig
      );

    } catch (error) {
      console.error('❌ DataRequest failed:', error);
      throw error;
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): SEDAConfig {
    return { ...this.config };
  }

  /**
   * Check if the builder is initialized
   */
  isBuilderInitialized(): boolean {
    return this.isInitialized;
  }
}

// Re-export the loadSEDAConfig function for backward compatibility
export { loadSEDAConfig };

/**
 * Example usage function
 */
export async function exampleUsage(): Promise<void> {
  console.log('🚀 SEDA DataRequest Example Usage\n');

  try {
    // Load configuration
    const config = loadSEDAConfig();
    console.log('📋 Configuration loaded successfully');
    console.log(`🌐 Network: ${config.network}`);
    console.log(`🔗 RPC: ${config.rpcEndpoint}`);

    // Create builder
    const builder = new SEDADataRequestBuilder(config);
    await builder.initialize();

    // Post a DataRequest
    const result = await builder.postDataRequest({
      memo: 'Test DataRequest from example'
    });

    console.log('\n✅ Example completed successfully!');
    console.log(`📊 DataRequest ID: ${result.drId}`);
    console.log(`📊 Exit Code: ${result.exitCode}`);

  } catch (error) {
    console.error('❌ Example failed:', error);
    throw error;
  }
} 