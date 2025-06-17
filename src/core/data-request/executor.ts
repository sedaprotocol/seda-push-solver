/**
 * DataRequest Executor
 * Handles the execution and result processing of DataRequests on the SEDA network
 */

import { postDataRequest, awaitDataResult, Signer } from '@seda-protocol/dev-tools';
import type { PostDataRequestInput, GasOptions, QueryConfig } from '@seda-protocol/dev-tools';
import type { DataRequestResult, NetworkConfig } from '../../types';
import type { LoggingServiceInterface } from '../../services';
import { getErrorMessage } from '../../helpers/error-utils';
import { HexUtils } from '../../utils/hex';
import { SedaBatchService } from '../../seda/batch-service';
import { EvmBatchManager } from '../../evm/batch-manager';

/**
 * Post a DataRequest transaction to the SEDA network (just posting, no waiting)
 * This is the phase that should be coordinated by sequence to prevent conflicts
 */
export async function postDataRequestTransaction(
  signer: Signer, 
  postInput: PostDataRequestInput, 
  gasOptions: GasOptions, 
  networkConfig: NetworkConfig,
  logger: LoggingServiceInterface
): Promise<{ drId: string; blockHeight: bigint; txHash: string }> {
  
  // Clean, structured configuration display
  logger.info('┌─────────────────────────────────────────────────────────────────────┐');
  logger.info('│                        📤 Posting DataRequest                       │');
  logger.info('├─────────────────────────────────────────────────────────────────────┤');
  logger.info(`│ Oracle Program ID: ${postInput.execProgramId}`);
  logger.info(`│ Replication Factor: ${postInput.replicationFactor || 0}`);
  logger.info(`│ Gas Limit: ${postInput.execGasLimit?.toLocaleString() || 'N/A'}`);
  logger.info(`│ Gas Price: ${(postInput.gasPrice || 0).toString()}`);
  logger.info('└─────────────────────────────────────────────────────────────────────┘');
  
  logger.info('🚀 Posting DataRequest transaction to SEDA network...');
  
  // Post the DataRequest transaction (this waits for inclusion in block)
  const postResult = await postDataRequest(signer, postInput, gasOptions);
  
  // Log successful posting
  logger.info(`✅ DataRequest posted successfully!`);
  logger.info(`   📋 Request ID: ${postResult.dr.id}`);
  logger.info(`   📦 Block Height: ${postResult.dr.height}`);
  logger.info(`   🔗 Transaction: ${postResult.tx}`);
  
  return {
    drId: postResult.dr.id,
    blockHeight: postResult.dr.height,
    txHash: postResult.tx
  };
}

/**
 * Wait for a DataRequest to be executed and return results
 * This phase happens in parallel and doesn't need sequence coordination
 */
export async function awaitDataRequestResult(
  queryConfig: QueryConfig,
  drId: string,
  blockHeight: bigint,
  awaitOptions: { timeoutSeconds: number; pollingIntervalSeconds: number, maxBatchRetries: number, batchPollingIntervalMs: number },
  networkConfig: NetworkConfig,
  logger: LoggingServiceInterface
): Promise<DataRequestResult> {
  
  logger.info(`⏳ Waiting for DataRequest ${drId} to complete...`);
  logger.info(`   📦 Block Height: ${blockHeight}`);
  logger.info(`   ⏱️ Timeout: ${awaitOptions.timeoutSeconds}s`);
  logger.info(`   🔄 Polling: every ${awaitOptions.pollingIntervalSeconds}s`);

  // Create DataRequest object for awaiting
  const dataRequest = { id: drId, height: blockHeight };
  
  // Wait for DataRequest execution to complete
  const result = await awaitDataResult(queryConfig, dataRequest, {
    timeoutSeconds: awaitOptions.timeoutSeconds,
    pollingIntervalSeconds: awaitOptions.pollingIntervalSeconds
  });
  
  // Clean, structured results display
  logger.info('✅ DataRequest completed');
  logger.info(`   📋 Request ID: ${result.drId}`);
  logger.info(`   📊 Exit Code: ${result.exitCode} | Gas: ${result.gasUsed} | Block: ${result.drBlockHeight}`);
  
  // Handle result data display
  if (result.result) {
    logger.info(`   📦 Result: ${result.result}`);
    
    // Show numeric conversion if it looks like hex
    if (typeof result.result === 'string' && /^(0x)?[0-9a-fA-F]+$/.test(result.result)) {
      try {
        const numericResult = HexUtils.toBigEndianNumber(result.result);
        logger.info(`   🔢 Numeric: ${numericResult}`);
      } catch (error) {
        // Silent fail for conversion errors
      }
    }
  } else {
    logger.info(`   📦 Result: No data`);
  }
  
  if (networkConfig.explorerEndpoint) {
    logger.info(`   🔗 Explorer: ${networkConfig.explorerEndpoint}/data-requests/${result.drId}/${result.drBlockHeight}`);
  }
  
  // Fetch batch assignment and batch information from SEDA chain
  logger.info('🔍 Fetching batch assignment and batch information from SEDA chain...');
  try {
    const batchService = new SedaBatchService(queryConfig, logger);
    const batch = await batchService.fetchBatch(drId, blockHeight, awaitOptions.maxBatchRetries, awaitOptions.batchPollingIntervalMs);
    
    if (batch) {
      // Log the batch information
      logger.info('📦 Batch assignment completed');
      logger.info(`   🔢 Batch: ${batch.batchNumber} | Block: ${batch.blockHeight}`);
      logger.info(`   📊 Entries: ${batch.dataResultEntries?.length || 0} | Signatures: ${batch.batchSignatures?.length || 0} | Validators: ${batch.validatorEntries?.length || 0}`);
      
      // Handle EVM batch posting using the batch manager
      const evmBatchManager = new EvmBatchManager(logger);
      const evmBatchResults = await evmBatchManager.handleBatch(batch);
      
      // Log detailed results for each network
      if (evmBatchResults.length > 0) {
        logger.info('🌐 EVM batch status:');
        for (const result of evmBatchResults) {
          const status = result.batchExists ? '✅ EXISTS' : '❌ MISSING';
          const lastHeight = result.lastBatchHeight !== null ? result.lastBatchHeight.toString() : 'N/A';
          const postInfo = result.posted !== undefined ? (result.posted ? ' | 🚀 POSTED' : ' | ⚠️ POST FAILED') : '';
          const txInfo = result.txHash ? ` | TX: ${result.txHash}` : '';
          const errorInfo = result.error ? ` | Error: ${result.error}` : '';
          logger.info(`   ${result.networkName}: ${status} | Last Height: ${lastHeight}${postInfo}${txInfo}${errorInfo}`);
        }
      }
    }
  } catch (error) {
    logger.warn(`⚠️ Could not fetch batch information: ${getErrorMessage(error)}`);
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
 */
export async function executeDataRequest(
  signer: Signer, 
  postInput: PostDataRequestInput, 
  gasOptions: GasOptions, 
  awaitOptions: { timeoutSeconds: number; pollingIntervalSeconds: number, maxBatchRetries: number, batchPollingIntervalMs: number },
  networkConfig: NetworkConfig,
  logger: LoggingServiceInterface
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