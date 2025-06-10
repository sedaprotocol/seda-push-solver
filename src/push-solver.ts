/**
 * SEDA DataRequest Builder and Pusher
 * Generic SEDA oracle DataRequest posting functionality for any Oracle Program
 * 
 * This module provides the main SEDADataRequestBuilder class that orchestrates
 * DataRequest creation and posting using the modular core components:
 * - core/data-request: Handles input building, execution, and signing
 * - core/network: Manages network configurations
 * - types: Centralized type definitions
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
import type { ILoggingService } from './services';

/**
 * SEDA DataRequest Builder
 * Handles configuration and posting of DataRequests to SEDA network
 */
export class SEDADataRequestBuilder {
  private config: SEDAConfig;
  private signer: Signer | null = null;
  private isInitialized: boolean = false;

  constructor(config: SEDAConfig, private logger?: ILoggingService) {
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
      this.signer = await initializeSigner(this.config, this.logger);
      this.isInitialized = true;
    } catch (error) {
      const message = '❌ Failed to initialize signing configuration:';
      if (this.logger) {
        this.logger.error(message, error);
      } else {
        console.error(message, error);
      }
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

    if (this.logger) {
      this.logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
      this.logger.info('│                     📤 Posting DataRequest                         │');
      this.logger.info('├─────────────────────────────────────────────────────────────────────┤');
      this.logger.info(`│ Network: ${this.config.network.toUpperCase()}`);
      this.logger.info(`│ RPC Endpoint: ${this.config.rpcEndpoint}`);
      this.logger.info(`│ Memo: ${options.memo || 'Default memo'}`);
      this.logger.info('└─────────────────────────────────────────────────────────────────────┘');
    } else {
      console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
      console.log('│                     📤 Posting DataRequest                         │');
      console.log('├─────────────────────────────────────────────────────────────────────┤');
      console.log(`│ Network: ${this.config.network.toUpperCase()}`);
      console.log(`│ RPC Endpoint: ${this.config.rpcEndpoint}`);
      console.log(`│ Memo: ${options.memo || 'Default memo'}`);
      console.log('└─────────────────────────────────────────────────────────────────────┘');
    }

    try {
      // Get network-specific DataRequest configuration
      const networkConfig = getNetworkConfig(this.config.network);
      const drConfig = networkConfig.dataRequest;

      // Build the PostDataRequestInput using the modular function
      const postInput = buildDataRequestInput(drConfig, options);

      // Build gas and await options using modular functions
      const gasOptions = buildGasOptions(drConfig);
      const awaitOptions = buildAwaitOptions(drConfig, options);

      // Execute the DataRequest using the modular function
      return await executeDataRequest(
        this.signer!, 
        postInput, 
        gasOptions, 
        awaitOptions, 
        networkConfig,
        this.logger
      );

    } catch (error) {
      if (this.logger) {
        this.logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
        this.logger.info('│                        ❌ DataRequest Failed                        │');
        this.logger.info('├─────────────────────────────────────────────────────────────────────┤');
        this.logger.info(`│ Error: ${(error as Error).message}`);
        this.logger.info('└─────────────────────────────────────────────────────────────────────┘');
      } else {
        console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
        console.log('│                        ❌ DataRequest Failed                        │');
        console.log('├─────────────────────────────────────────────────────────────────────┤');
        console.log(`│ Error: ${(error as Error).message}`);
        console.log('└─────────────────────────────────────────────────────────────────────┘');
      }
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
  console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
  console.log('│                   🚀 SEDA DataRequest Example                       │');
  console.log('└─────────────────────────────────────────────────────────────────────┘');

  try {
    // Load configuration
    const config = loadSEDAConfig();
    console.log('\n📋 Configuration loaded successfully');
    console.log(`   Network: ${config.network}`);
    console.log(`   RPC: ${config.rpcEndpoint}`);

    // Create builder
    const builder = new SEDADataRequestBuilder(config);
    await builder.initialize();

    // Post a DataRequest
    const result = await builder.postDataRequest({
      memo: 'Test DataRequest from example'
    });

    console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
    console.log('│                      ✅ Example Completed                           │');
    console.log('├─────────────────────────────────────────────────────────────────────┤');
    console.log(`│ Request ID: ${result.drId}`);
    console.log(`│ Exit Code: ${result.exitCode}`);
    console.log('└─────────────────────────────────────────────────────────────────────┘');

  } catch (error) {
    console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
    console.log('│                        ❌ Example Failed                            │');
    console.log('├─────────────────────────────────────────────────────────────────────┤');
    console.log(`│ Error: ${(error as Error).message}`);
    console.log('└─────────────────────────────────────────────────────────────────────┘');
    throw error;
  }
} 