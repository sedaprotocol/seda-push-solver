/**
 * SEDA DataRequest Builder
 * Handles configuration and posting of DataRequests to SEDA network
 */

import { Signer } from '@seda-protocol/dev-tools';
import { getNetworkConfig } from '../../network';
import { 
  buildDataRequestInput, 
  buildGasOptions, 
  buildAwaitOptions
} from '../input-builder';
import { executeDataRequest } from '../executor';
import { initializeSigner } from '../signer';
import type { SEDAConfig, DataRequestResult, DataRequestOptions } from '../../../types';
import type { ILoggingService } from '../../../services';

/**
 * SEDA DataRequest Builder
 * Handles configuration and posting of DataRequests to SEDA network
 */
export class SEDADataRequestBuilder {
  private config: SEDAConfig;
  private signer: Signer | null = null;
  private isInitialized: boolean = false;
  private logger: ILoggingService;

  constructor(
    config: SEDAConfig, 
    logger?: ILoggingService
  ) {
    this.config = config;
    
    // Use provided logger or create a simple fallback
    if (logger) {
      this.logger = logger;
    } else {
      // Simple fallback logger for backward compatibility
      this.logger = {
        info: (msg: string, ...args: any[]) => console.log(msg, ...args),
        error: (msg: string, ...args: any[]) => console.error(msg, ...args),
        warn: (msg: string, ...args: any[]) => console.warn(msg, ...args),
        debug: (msg: string, ...args: any[]) => console.debug(msg, ...args),
        setLogLevel: () => {},
        getLogLevel: () => 2 // INFO level
      };
    }
    
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
      this.logger.error('Failed to initialize signing configuration:', error);
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

    this.logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
    this.logger.info('│                     📤 Posting DataRequest                         │');
    this.logger.info('├─────────────────────────────────────────────────────────────────────┤');
    this.logger.info(`│ Network: ${this.config.network.toUpperCase()}`);
    this.logger.info(`│ RPC Endpoint: ${this.config.rpcEndpoint}`);
    this.logger.info(`│ Memo: ${options.memo || 'Default memo'}`);
    this.logger.info('└─────────────────────────────────────────────────────────────────────┘');

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
      this.logger.error('DataRequest Failed:', error);
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