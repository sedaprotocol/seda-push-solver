/**
 * SEDA DataRequest Builder
 * Handles configuration and posting of DataRequests to SEDA network
 */

import { Signer } from '@seda-protocol/dev-tools';
import { getSedaNetworkConfig } from '../../config';
import { 
  buildDataRequestInput, 
  buildGasOptions, 
  buildAwaitOptions
} from './input-builder';
import { postDataRequestTransaction, awaitDataRequestResult } from './executor';
import { initializeSigner } from './signer';
import type { SedaConfig, DataRequestResult, DataRequestOptions } from '../../types';
import type { LoggingServiceInterface } from '../../services';

/**
 * SEDA DataRequest Builder
 * Handles configuration and posting of DataRequests to SEDA network
 */
export class SEDADataRequestBuilder {
  private config: SedaConfig;
  private signer: Signer | null = null;
  private isInitialized: boolean = false;
  private logger: LoggingServiceInterface;

  constructor(
    config: SedaConfig, 
    logger: LoggingServiceInterface
  ) {
    this.config = config;
    this.logger = logger;
    
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
      this.logger.error('Failed to initialize signing configuration:', error instanceof Error ? error : String(error));
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

    this.logger.info('📤 Posting DataRequest');
    this.logger.info(`   🌐 Network: ${this.config.network.toUpperCase()} | RPC: ${this.config.rpcEndpoint}`);
    this.logger.info(`   📝 Memo: ${options.memo || 'Default memo'}`);

    try {
      // Get network-specific DataRequest configuration
      const networkConfig = getSedaNetworkConfig(this.config.network);
      const drConfig = networkConfig.dataRequest;

      // Build the PostDataRequestInput using the modular function
      const postInput = buildDataRequestInput(drConfig, options);

      // Build gas and await options using modular functions
      const gasOptions = buildGasOptions(networkConfig);
      const awaitOptions = buildAwaitOptions(drConfig, options);

      // Post the DataRequest transaction first
      const postResult = await postDataRequestTransaction(
        this.signer!, 
        postInput, 
        gasOptions, 
        networkConfig,
        this.logger
      );

      // Then wait for results
      const queryConfig = { rpc: this.signer!.getEndpoint() };
      return await awaitDataRequestResult(
        queryConfig,
        postResult.drId,
        postResult.blockHeight,
        awaitOptions,
        networkConfig,
        this.logger
      );

    } catch (error) {
      this.logger.error('DataRequest Failed:', error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Post DataRequests for multiple programs in parallel
   */
  async postDataRequestsForAllPrograms(options: DataRequestOptions = {}): Promise<DataRequestResult[]> {
    if (!this.isInitialized || !this.signer) {
      await this.initialize();
    }

    // Get network-specific configuration
    const networkConfig = getSedaNetworkConfig(this.config.network);
    const programIds = networkConfig.dataRequest.oracleProgramIds || [networkConfig.dataRequest.oracleProgramId];

    this.logger.info('📤 Posting Multiple DataRequests in Parallel');
    this.logger.info(`   🌐 Network: ${this.config.network.toUpperCase()} | RPC: ${this.config.rpcEndpoint}`);
    this.logger.info(`   🎯 Programs: ${programIds.length} programs`);
    programIds.forEach((programId, index) => {
      this.logger.info(`   ${index + 1}. ${programId}`);
    });

    try {
      // Create promises for all program requests
      const requestPromises = programIds.map(programId => 
        this.postDataRequestForProgram(programId, options)
      );

      // Execute all requests in parallel
      this.logger.info(`🚀 Launching ${programIds.length} DataRequests in parallel...`);
      const results = await Promise.all(requestPromises);

      this.logger.info(`✅ All ${results.length} DataRequests completed successfully`);
      return results;

    } catch (error) {
      this.logger.error('Multiple DataRequests Failed:', error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Post a DataRequest for a specific program
   */
  private async postDataRequestForProgram(programId: string, options: DataRequestOptions = {}): Promise<DataRequestResult> {
    // Get network-specific DataRequest configuration
    const networkConfig = getSedaNetworkConfig(this.config.network);
    const drConfig = networkConfig.dataRequest;

    // Create program-specific options
    const programOptions = {
      ...options,
      programId,
      memo: options.memo || `DX Feed Oracle DataRequest - ${programId}`
    };

    this.logger.info(`📤 Posting DataRequest for Program: ${programId}`);

    try {
      // Build the PostDataRequestInput using the modular function with program override
      const postInput = buildDataRequestInput(drConfig, programOptions);

      // Build gas and await options using modular functions
      const gasOptions = buildGasOptions(networkConfig);
      const awaitOptions = buildAwaitOptions(drConfig, programOptions);

      // Post the DataRequest transaction first
      const postResult = await postDataRequestTransaction(
        this.signer!, 
        postInput, 
        gasOptions, 
        networkConfig,
        this.logger
      );

      // Then wait for results
      const queryConfig = { rpc: this.signer!.getEndpoint() };
      const result = await awaitDataRequestResult(
        queryConfig,
        postResult.drId,
        postResult.blockHeight,
        awaitOptions,
        networkConfig,
        this.logger
      );

      this.logger.info(`✅ DataRequest completed for Program: ${programId} (DR: ${result.drId})`);
      return result;

    } catch (error) {
      this.logger.error(`❌ DataRequest failed for Program: ${programId}:`, error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): SedaConfig {
    return { ...this.config };
  }

  /**
   * Check if the builder is initialized
   */
  isBuilderInitialized(): boolean {
    return this.isInitialized;
  }
} 