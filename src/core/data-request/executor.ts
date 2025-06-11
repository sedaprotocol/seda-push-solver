/**
 * DataRequest Executor
 * Handles the execution and result processing of DataRequests on the SEDA network
 */

import { postDataRequest, awaitDataResult, Signer } from '@seda-protocol/dev-tools';
import type { PostDataRequestInput, GasOptions, QueryConfig } from '@seda-protocol/dev-tools';
import type { DataRequestResult, NetworkConfig } from '../../types';
import type { ILoggingService } from '../../services';
import { hexBEToNumber } from '../../helpers/hex-converter';

/**
 * Simple logging utility to avoid code duplication
 */
function log(logger: ILoggingService | undefined, message: string, ...args: any[]): void {
  if (logger) {
    logger.info(message, ...args);
  } else {
    console.log(message, ...args);
  }
}

/**
 * Post a DataRequest transaction to the SEDA network (just posting, no waiting)
 * This is the phase that should be coordinated by sequence to prevent conflicts
 * @param signer The SEDA signer instance for transaction signing
 * @param postInput The PostDataRequestInput containing oracle program parameters
 * @param gasOptions Gas configuration for the transaction
 * @param networkConfig Network configuration for logging and context
 * @param logger Optional logging service for structured output
 * @returns Promise resolving to posted DataRequest info with ID and block height
 * @throws Error if DataRequest posting fails
 */
export async function postDataRequestTransaction(
  signer: Signer, 
  postInput: PostDataRequestInput, 
  gasOptions: GasOptions, 
  networkConfig: NetworkConfig,
  logger?: ILoggingService
): Promise<{ drId: string; blockHeight: bigint; txHash: string }> {
  
  // Clean, structured configuration display
  log(logger, '\n┌─────────────────────────────────────────────────────────────────────┐');
  log(logger, '│                        📤 Posting DataRequest                       │');
  log(logger, '├─────────────────────────────────────────────────────────────────────┤');
  log(logger, `│ Oracle Program ID: ${postInput.execProgramId}`);
  log(logger, `│ Replication Factor: ${postInput.replicationFactor || 0}`);
  log(logger, `│ Gas Limit: ${postInput.execGasLimit?.toLocaleString() || 'N/A'}`);
  log(logger, `│ Gas Price: ${(postInput.gasPrice || 0).toString()}`);
  log(logger, '└─────────────────────────────────────────────────────────────────────┘');
  
  log(logger, '\n🚀 Posting DataRequest transaction to SEDA network...');
  
  // Post the DataRequest transaction (this waits for inclusion in block)
  const postResult = await postDataRequest(signer, postInput, gasOptions);
  
  // Log successful posting
  log(logger, `✅ DataRequest posted successfully!`);
  log(logger, `   📋 Request ID: ${postResult.dr.id}`);
  log(logger, `   📦 Block Height: ${postResult.dr.height}`);
  log(logger, `   🔗 Transaction: ${postResult.tx}`);
  
  return {
    drId: postResult.dr.id,
    blockHeight: postResult.dr.height,
    txHash: postResult.tx
  };
}

/**
 * Wait for a DataRequest to be executed and return results
 * This phase happens in parallel and doesn't need sequence coordination
 * @param queryConfig RPC configuration for querying results
 * @param drId The DataRequest ID to wait for
 * @param blockHeight The block height where the DataRequest was included
 * @param awaitOptions Timeout and polling configuration for result monitoring
 * @param networkConfig Network configuration for logging and context
 * @param logger Optional logging service for structured output
 * @returns Promise resolving to DataRequestResult with execution details
 * @throws Error if DataRequest execution fails or times out
 */
export async function awaitDataRequestResult(
  queryConfig: QueryConfig,
  drId: string,
  blockHeight: bigint,
  awaitOptions: { timeoutSeconds: number; pollingIntervalSeconds: number },
  networkConfig: NetworkConfig,
  logger?: ILoggingService
): Promise<DataRequestResult> {
  
  log(logger, `\n⏳ Waiting for DataRequest ${drId} to complete...`);
  log(logger, `   📦 Block Height: ${blockHeight}`);
  log(logger, `   ⏱️ Timeout: ${awaitOptions.timeoutSeconds}s`);
  log(logger, `   🔄 Polling: every ${awaitOptions.pollingIntervalSeconds}s`);

  // Create DataRequest object for awaiting
  const dataRequest = { id: drId, height: blockHeight };
  
  // Wait for DataRequest execution to complete
  const result = await awaitDataResult(queryConfig, dataRequest, {
    timeoutSeconds: awaitOptions.timeoutSeconds,
    pollingIntervalSeconds: awaitOptions.pollingIntervalSeconds
  });
  
  // Clean, structured results display
  log(logger, '\n┌─────────────────────────────────────────────────────────────────────┐');
  log(logger, '│                         ✅ DataRequest Results                      │');
  log(logger, '├─────────────────────────────────────────────────────────────────────┤');
  log(logger, `│ Request ID: ${result.drId}`);
  log(logger, `│ Exit Code: ${result.exitCode}`);
  log(logger, `│ Block Height: ${result.drBlockHeight}`);
  log(logger, `│ Gas Used: ${result.gasUsed}`);
  log(logger, `│ Consensus: ${result.consensus || 'N/A'}`);
  
  // Handle result data display
  if (result.result) {
    log(logger, `│ Result (hex): ${result.result}`);
    
    // Show numeric conversion if it looks like hex
    if (typeof result.result === 'string' && /^(0x)?[0-9a-fA-F]+$/.test(result.result)) {
      try {
        const numericResult = hexBEToNumber(result.result);
        log(logger, `│ Result (number): ${numericResult}`);
      } catch (error) {
        // Silent fail for conversion errors
      }
    }
  } else {
    log(logger, `│ Result: No result data`);
  }
  
  log(logger, '├─────────────────────────────────────────────────────────────────────┤');
  if (networkConfig.explorerEndpoint) {
    log(logger, `│ Explorer: ${networkConfig.explorerEndpoint}/data-requests/${result.drId}/${result.drBlockHeight}`);
  } else {
    log(logger, `│ Explorer: N/A`);
  }
  log(logger, '└─────────────────────────────────────────────────────────────────────┘');
  
  return {
    drId: result.drId,
    exitCode: result.exitCode,
    result: result.result,
    blockHeight: Number(result.blockHeight),
    gasUsed: result.gasUsed.toString()
  };
}

/**
 * Execute a DataRequest on the SEDA network and await its completion
 * Legacy function that combines posting and awaiting for backward compatibility
 * @param signer The SEDA signer instance for transaction signing
 * @param postInput The PostDataRequestInput containing oracle program parameters
 * @param gasOptions Gas configuration for the transaction
 * @param awaitOptions Timeout and polling configuration for result monitoring
 * @param networkConfig Network configuration for logging and context
 * @param logger Optional logging service for structured output
 * @returns Promise resolving to DataRequestResult with execution details
 * @throws Error if DataRequest execution fails or times out
 */
export async function executeDataRequest(
  signer: Signer, 
  postInput: PostDataRequestInput, 
  gasOptions: GasOptions, 
  awaitOptions: { timeoutSeconds: number; pollingIntervalSeconds: number },
  networkConfig: NetworkConfig,
  logger?: ILoggingService
): Promise<DataRequestResult> {
  
  // Post the transaction first
  const postResult = await postDataRequestTransaction(signer, postInput, gasOptions, networkConfig, logger);
  
  // Then wait for results
  const queryConfig: QueryConfig = { rpc: signer.getEndpoint() };
  return await awaitDataRequestResult(
    queryConfig,
    postResult.drId,
    postResult.blockHeight,
    awaitOptions,
    networkConfig,
    logger
  );
} 