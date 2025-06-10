/**
 * DataRequest Input Builder
 * Handles building PostDataRequestInput objects from configuration
 */

import type { PostDataRequestInput, GasOptions } from '@seda-protocol/dev-tools';
import type { SEDADataRequestConfig, DataRequestOptions } from '../../types';

/**
 * Build PostDataRequestInput from DataRequest configuration and options
 */
export function buildDataRequestInput(
  drConfig: SEDADataRequestConfig, 
  options: DataRequestOptions = {}
): PostDataRequestInput {
  // Convert memo to Uint8Array if provided
  const memoBytes = options.memo ? new TextEncoder().encode(options.memo) : new Uint8Array(0);

  return {
    // Oracle program configuration
    execProgramId: drConfig.oracleProgramId,
    
    // Empty inputs since the oracle program doesn't expect any input
    execInputs: new Uint8Array(0),
    tallyInputs: new Uint8Array(0),
    
    // Execution configuration
    replicationFactor: drConfig.replicationFactor,
    execGasLimit: Number(drConfig.execGasLimit),
    gasPrice: drConfig.gasPrice,
    
    // Consensus configuration
    consensusOptions: drConfig.consensusOptions,
    
    // Optional memo
    memo: memoBytes
  };
}

/**
 * Build gas options from DataRequest configuration
 */
export function buildGasOptions(drConfig: SEDADataRequestConfig): GasOptions {
  return {
    gasPrice: drConfig.gasPrice.toString()
  };
}

/**
 * Build await options from DataRequest configuration and custom options
 */
export function buildAwaitOptions(
  drConfig: SEDADataRequestConfig, 
  options: DataRequestOptions = {}
) {
  return {
    timeoutSeconds: options.customTimeout || drConfig.timeoutSeconds,
    pollingIntervalSeconds: drConfig.pollingIntervalSeconds
  };
} 