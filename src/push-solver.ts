/**
 * SEDA DataRequest Builder and Configuration
 * Generic SEDA oracle DataRequest posting functionality
 */

import { buildSigningConfig, postAndAwaitDataRequest, Signer } from '@seda-protocol/dev-tools';
import type { PostDataRequestInput, GasOptions } from '@seda-protocol/dev-tools';
import { getNetworkConfig, type SEDADataRequestConfig } from './seda-dr-config';
import { hexBEToNumber, hexBEToString } from './helpers/hex-converter';

// Main SEDA configuration interface
export interface SEDAConfig {
  rpcEndpoint: string;
  network: 'testnet' | 'mainnet' | 'local';
  mnemonic?: string;
}

// DataRequest result interface
export interface DataRequestResult {
  drId: string;
  exitCode: number;
  result?: any;
  blockHeight?: number;
  gasUsed?: string;
}

// DataRequest posting options
export interface DataRequestOptions {
  memo?: string;
  customTimeout?: number;
}

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

    console.log('🔐 Initializing SEDA signing configuration...');
    
    try {
      const signingConfig = buildSigningConfig({
        mnemonic: this.config.mnemonic!,
        rpc: this.config.rpcEndpoint
        // contract field omitted - will auto-detect or use SEDA_CORE_CONTRACT env var
      });
      
      this.signer = await Signer.fromPartial(signingConfig);
      this.isInitialized = true;
      console.log('✅ SEDA signing configuration initialized');
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

      // Convert memo to Uint8Array if provided
      const memoBytes = options.memo ? new TextEncoder().encode(options.memo) : new Uint8Array(0);

      // Build the PostDataRequestInput
      const postInput: PostDataRequestInput = {
        // Oracle program configuration
        execProgramId: drConfig.oracleProgramId,
        
        // Empty inputs since the oracle program doesn't expect any input
        execInputs: new Uint8Array(0),
        tallyInputs: new Uint8Array(0),
        
        // Execution configuration
        replicationFactor: drConfig.replicationFactor,
        execGasLimit: drConfig.execGasLimit,
        gasPrice: drConfig.gasPrice,
        
        // Consensus configuration
        consensusOptions: drConfig.consensusOptions,
        
        // Optional memo
        memo: memoBytes
      };

      // Gas options
      const gasOptions: GasOptions = {
        gasPrice: drConfig.gasPrice.toString()
      };

      // Await options
      const awaitOptions = {
        timeoutSeconds: options.customTimeout || drConfig.timeoutSeconds,
        pollingIntervalSeconds: drConfig.pollingIntervalSeconds
      };

      console.log('📋 DataRequest Configuration:');
      console.log(`   Oracle Program ID: ${postInput.execProgramId}`);
      console.log(`   Replication Factor: ${postInput.replicationFactor}`);
      console.log(`   Gas Limit: ${postInput.execGasLimit?.toLocaleString()}`);
      console.log(`   Gas Price: ${postInput.gasPrice}`);
      console.log(`   Timeout: ${awaitOptions.timeoutSeconds}s`);
      console.log(`   Memo: ${options.memo || drConfig.memo}`);

      // Post the DataRequest and await result
      const result = await postAndAwaitDataRequest(this.signer!, postInput, gasOptions, awaitOptions);

      console.log('✅ DataRequest completed successfully');
      console.log('📊 Result Details:');
      console.log(`   DR ID: ${result.drId}`);
      console.log(`   Exit Code: ${result.exitCode}`);
      console.log(`   Block Height: ${result.blockHeight}`);
      console.log(`   Gas Used: ${result.gasUsed}`);
      console.log(`   Consensus: ${result.consensus}`);
      console.log(`   Result: ${result.result || 'No result data'}`);
      
      // Log BE conversions if result looks like hex
      if (result.result && typeof result.result === 'string' && /^(0x)?[0-9a-fA-F]+$/.test(result.result)) {
        console.log(`   Result (BE Number): ${hexBEToNumber(result.result)}`);
        console.log(`   Result (BE String): "${hexBEToString(result.result)}"`);
      }

      return {
        drId: result.drId,
        exitCode: result.exitCode,
        result: result.result,
        blockHeight: Number(result.blockHeight),
        gasUsed: result.gasUsed.toString()
      };

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

/**
 * Load SEDA configuration from environment variables
 */
export function loadSEDAConfig(): SEDAConfig {
  const network = (process.env.SEDA_NETWORK || 'testnet') as 'testnet' | 'mainnet' | 'local';
  const mnemonic = process.env.SEDA_MNEMONIC;
  
  if (!mnemonic) {
    throw new Error('SEDA_MNEMONIC environment variable is required');
  }

  // Get network configuration
  const networkConfig = getNetworkConfig(network);

  return {
    rpcEndpoint: process.env.SEDA_RPC_ENDPOINT || networkConfig.rpcEndpoint,
    network,
    mnemonic
  };
}

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

// Re-export key types and functions for convenience
export type { SEDADataRequestConfig } from './seda-dr-config';
export {
  getNetworkConfig,
  getDataRequestConfig,
  getRpcEndpoint,
  createDataRequestConfig,
  validateDataRequestConfig,
  SEDA_NETWORK_CONFIGS,
  SEDA_DR_CONFIGS,
  SEDA_NETWORKS
} from './seda-dr-config'; 