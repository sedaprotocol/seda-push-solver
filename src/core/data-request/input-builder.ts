/**
 * DataRequest Input Builder
 * Handles building PostDataRequestInput objects from configuration
 */

import type { PostDataRequestInput, GasOptions } from '@seda-protocol/dev-tools';
import type { SEDADataRequestConfig, DataRequestOptions } from '../../types';

/**
 * Build PostDataRequestInput from DataRequest configuration and options
 * 
 * IMPORTANT: This function includes unique timestamp and nonce data in execInputs to ensure
 * that each DataRequest gets a unique ID, even when posting the same programs repeatedly.
 * Without this, the same programs would generate identical DataRequest IDs, causing
 * "Result already exists" errors in the EVM posting logic.
 * 
 * @param drConfig The SEDA DataRequest configuration containing oracle program settings
 * @param options Optional DataRequest parameters to override defaults
 * @returns PostDataRequestInput object ready for SEDA network submission
 */
export function buildDataRequestInput(
  drConfig: SEDADataRequestConfig, 
  options: DataRequestOptions = {}
): PostDataRequestInput {
  // Convert memo to Uint8Array if provided
  const memoBytes = options.memo ? new TextEncoder().encode(options.memo) : new Uint8Array(0);

  // Use programId from options if provided, otherwise use config default
  const programId = options.programId || drConfig.oracleProgramId;

  // Create unique inputs by including timestamp and program ID to ensure unique DataRequest IDs
  // This prevents duplicate DataRequest IDs when posting the same programs repeatedly
  const uniqueInputData = {
    timestamp: Date.now(),
    programId: programId,
    nonce: Math.floor(Math.random() * 1000000) // Additional randomness
  };
  
  const uniqueInputsBytes = new TextEncoder().encode(JSON.stringify(uniqueInputData));
  
  // Debug log to verify unique inputs are being generated
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔧 Generated unique inputs for ${programId.substring(0, 8)}...: ${JSON.stringify(uniqueInputData)}`);
  }

  return {
    // Oracle program configuration
    execProgramId: programId,
    
    // Include unique inputs to ensure each DataRequest gets a unique ID
    execInputs: uniqueInputsBytes,
    tallyInputs: new Uint8Array(0),
    
    // Execution configuration
    replicationFactor: drConfig.replicationFactor,
    execGasLimit: Number(drConfig.execGasLimit),
    gasPrice: drConfig.gasPrice,
    
    // Consensus configuration
    consensusOptions: { method: 'none' },
    
    // Optional memo
    memo: memoBytes
  };
}

/**
 * Build gas options from network transaction configuration
 * @param networkConfig The network configuration containing transaction gas settings
 * @returns GasOptions object for transaction gas configuration
 */
export function buildGasOptions(networkConfig: any): GasOptions {
  return {
    gasPrice: networkConfig.transaction.gasPrice.toString()
  };
}

/**
 * Build await options from DataRequest configuration and custom options
 * @param drConfig The SEDA DataRequest configuration containing timeout settings
 * @param options Optional parameters to override default timeout values
 * @returns Await options for DataRequest execution monitoring
 */
export function buildAwaitOptions(
  drConfig: SEDADataRequestConfig, 
  options: DataRequestOptions = {}
) {
  return {
    timeoutSeconds: options.customTimeout || drConfig.timeoutSeconds,
    pollingIntervalSeconds: drConfig.pollingIntervalSeconds,
    maxBatchRetries: drConfig.maxBatchRetries || 10,
    batchPollingIntervalMs: drConfig.batchPollingIntervalMs || 3000
  };
} 