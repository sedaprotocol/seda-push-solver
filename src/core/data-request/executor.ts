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
  
  // Debug logging to trace execution
  if (logger) {
    logger.info(`🚀 DEBUG: postDataRequestTransaction called!`);
    logger.info(`🚀 DEBUG: postInput:`, JSON.stringify({
      execProgramId: postInput.execProgramId,
      replicationFactor: postInput.replicationFactor,
      memoLength: postInput.memo?.length || 0
    }));
  }
  
  // Clean, structured configuration display
  if (logger) {
    logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
    logger.info('│                        📤 Posting DataRequest                       │');
    logger.info('├─────────────────────────────────────────────────────────────────────┤');
    logger.info(`│ Oracle Program ID: ${postInput.execProgramId}`);
    logger.info(`│ Replication Factor: ${postInput.replicationFactor || 0}`);
    logger.info(`│ Gas Limit: ${postInput.execGasLimit?.toLocaleString() || 'N/A'}`);
    logger.info(`│ Gas Price: ${(postInput.gasPrice || 0).toString()}`);
    logger.info('└─────────────────────────────────────────────────────────────────────┘');
    
    logger.info('\n🚀 Posting DataRequest transaction to SEDA network...');
  } else {
    console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
    console.log('│                        📤 Posting DataRequest                       │');
    console.log('├─────────────────────────────────────────────────────────────────────┤');
    console.log(`│ Oracle Program ID: ${postInput.execProgramId}`);
    console.log(`│ Replication Factor: ${postInput.replicationFactor || 0}`);
    console.log(`│ Gas Limit: ${postInput.execGasLimit?.toLocaleString() || 'N/A'}`);
    console.log(`│ Gas Price: ${(postInput.gasPrice || 0).toString()}`);
    console.log('└─────────────────────────────────────────────────────────────────────┘');
    
    console.log('\n🚀 Posting DataRequest transaction to SEDA network...');
  }
  
  // Post the DataRequest transaction (this waits for inclusion in block)
  console.debug('\n\n posting data request');
  const postResult = await postDataRequest(signer, postInput, gasOptions);
  console.debug('\n\n data request posted');

  
  // Log successful posting
  if (logger) {
    logger.info(`✅ DataRequest posted successfully!`);
    logger.info(`   📋 Request ID: ${postResult.dr.id}`);
    logger.info(`   📦 Block Height: ${postResult.dr.height}`);
    logger.info(`   🔗 Transaction: ${postResult.tx}`);
  } else {
    console.log(`✅ DataRequest posted successfully!`);
    console.log(`   📋 Request ID: ${postResult.dr.id}`);
    console.log(`   📦 Block Height: ${postResult.dr.height}`);
    console.log(`   🔗 Transaction: ${postResult.tx}`);
  }
  
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
  
  if (logger) {
    logger.info(`\n⏳ Waiting for DataRequest ${drId} to complete...`);
    logger.info(`   📦 Block Height: ${blockHeight}`);
    logger.info(`   ⏱️ Timeout: ${awaitOptions.timeoutSeconds}s`);
    logger.info(`   🔄 Polling: every ${awaitOptions.pollingIntervalSeconds}s`);
  } else {
    console.log(`\n⏳ Waiting for DataRequest ${drId} to complete...`);
    console.log(`   📦 Block Height: ${blockHeight}`);
    console.log(`   ⏱️ Timeout: ${awaitOptions.timeoutSeconds}s`);
    console.log(`   🔄 Polling: every ${awaitOptions.pollingIntervalSeconds}s`);
  }

  // Create DataRequest object for awaiting
  const dataRequest = { id: drId, height: blockHeight };
  
  // Wait for DataRequest execution to complete
  const result = await awaitDataResult(queryConfig, dataRequest, {
    timeoutSeconds: awaitOptions.timeoutSeconds,
    pollingIntervalSeconds: awaitOptions.pollingIntervalSeconds
  });
  
  // Clean, structured results display
  if (logger) {
    logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
    logger.info('│                         ✅ DataRequest Results                      │');
    logger.info('├─────────────────────────────────────────────────────────────────────┤');
    logger.info(`│ Request ID: ${result.drId}`);
    logger.info(`│ Exit Code: ${result.exitCode}`);
    logger.info(`│ Block Height: ${result.drBlockHeight}`);
    logger.info(`│ Gas Used: ${result.gasUsed}`);
    logger.info(`│ Consensus: ${result.consensus || 'N/A'}`);
    
    // Handle result data display
    if (result.result) {
      logger.info(`│ Result (hex): ${result.result}`);
      
      // Show numeric conversion if it looks like hex
      if (typeof result.result === 'string' && /^(0x)?[0-9a-fA-F]+$/.test(result.result)) {
        try {
          const numericResult = hexBEToNumber(result.result);
          logger.info(`│ Result (number): ${numericResult}`);
        } catch (error) {
          // Silent fail for conversion errors
        }
      }
    } else {
      logger.info(`│ Result: No result data`);
    }
    
    logger.info('├─────────────────────────────────────────────────────────────────────┤');
    if (networkConfig.explorerEndpoint) {
      logger.info(`│ Explorer: ${networkConfig.explorerEndpoint}/data-requests/${result.drId}/${result.drBlockHeight}`);
    } else {
      logger.info(`│ Explorer: N/A`);
    }
    logger.info('└─────────────────────────────────────────────────────────────────────┘');
  } else {
    console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
    console.log('│                         ✅ DataRequest Results                      │');
    console.log('├─────────────────────────────────────────────────────────────────────┤');
    console.log(`│ Request ID: ${result.drId}`);
    console.log(`│ Exit Code: ${result.exitCode}`);
    console.log(`│ Block Height: ${result.drBlockHeight}`);
    console.log(`│ Gas Used: ${result.gasUsed}`);
    console.log(`│ Consensus: ${result.consensus || 'N/A'}`);
    
    // Handle result data display
    if (result.result) {
      console.log(`│ Result (hex): ${result.result}`);
      
      // Show numeric conversion if it looks like hex
      if (typeof result.result === 'string' && /^(0x)?[0-9a-fA-F]+$/.test(result.result)) {
        try {
          const numericResult = hexBEToNumber(result.result);
          console.log(`│ Result (number): ${numericResult}`);
        } catch (error) {
          // Silent fail for conversion errors
        }
      }
    } else {
      console.log(`│ Result: No result data`);
    }
    
    console.log('├─────────────────────────────────────────────────────────────────────┤');
    if (networkConfig.explorerEndpoint) {
      console.log(`│ Explorer: ${networkConfig.explorerEndpoint}/data-requests/${result.drId}/${result.drBlockHeight}`);
    } else {
      console.log(`│ Explorer: N/A`);
    }
    console.log('└─────────────────────────────────────────────────────────────────────┘');
  }
  
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