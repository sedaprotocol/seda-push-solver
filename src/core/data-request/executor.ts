/**
 * DataRequest Executor
 * Handles the execution and result processing of DataRequests on the SEDA network
 */

import { postDataRequest, awaitDataResult, Signer } from '@seda-protocol/dev-tools';
import type { PostDataRequestInput, GasOptions, QueryConfig } from '@seda-protocol/dev-tools';
import type { DataRequestResult, NetworkConfig } from '../../types';
import type { ILoggingService } from '../../services';
import { hexBEToNumber } from '../../helpers/hex-converter';

// Import SEDA chain services for real batch handling
import { QueryClient, createProtobufRpcClient } from "@cosmjs/stargate";
import { Comet38Client } from "@cosmjs/tendermint-rpc";
import { sedachain } from "@seda-protocol/proto-messages";

/**
 * Post a DataRequest transaction to the SEDA network (just posting, no waiting)
 * This is the phase that should be coordinated by sequence to prevent conflicts
 */
export async function postDataRequestTransaction(
  signer: Signer, 
  postInput: PostDataRequestInput, 
  gasOptions: GasOptions, 
  networkConfig: NetworkConfig,
  logger: ILoggingService
): Promise<{ drId: string; blockHeight: bigint; txHash: string }> {
  
  // Clean, structured configuration display
  logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
  logger.info('│                        📤 Posting DataRequest                       │');
  logger.info('├─────────────────────────────────────────────────────────────────────┤');
  logger.info(`│ Oracle Program ID: ${postInput.execProgramId}`);
  logger.info(`│ Replication Factor: ${postInput.replicationFactor || 0}`);
  logger.info(`│ Gas Limit: ${postInput.execGasLimit?.toLocaleString() || 'N/A'}`);
  logger.info(`│ Gas Price: ${(postInput.gasPrice || 0).toString()}`);
  logger.info('└─────────────────────────────────────────────────────────────────────┘');
  
  logger.info('\n🚀 Posting DataRequest transaction to SEDA network...');
  
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
  logger: ILoggingService
): Promise<DataRequestResult> {
  
  logger.info(`\n⏳ Waiting for DataRequest ${drId} to complete...`);
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
  
  // NEW: Fetch batch assignment and batch information from actual SEDA chain
  logger.info('\n🔍 Fetching batch assignment and batch information from SEDA chain...');
  try {
    const batch = await fetchRealBatchFromSedaChain(drId, blockHeight, queryConfig, logger, awaitOptions.maxBatchRetries, awaitOptions.batchPollingIntervalMs);
    
    if (batch) {
      console.log('batch', batch);
      // Log the batch information
      logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
      logger.info('│                           📦 Real Batch Information                 │');
      logger.info('├─────────────────────────────────────────────────────────────────────┤');
      logger.info(`│ Batch Number: ${batch.batchNumber}`);
      logger.info(`│ Batch ID: ${batch.batchId}`);
      logger.info(`│ Block Height: ${batch.blockHeight}`);
      logger.info(`│ Current Data Result Root: ${batch.currentDataResultRoot}`);
      logger.info(`│ Data Result Root: ${batch.dataResultRoot}`);
      logger.info(`│ Validator Root: ${batch.validatorRoot}`);
      if (batch.dataResultEntries) {
        logger.info(`│ Data Result Entries: ${batch.dataResultEntries.length} entries`);
      }
      if (batch.batchSignatures) {
        logger.info(`│ Validator Signatures: ${batch.batchSignatures.length} signatures`);
      }
      if (batch.validatorEntries) {
        logger.info(`│ Validator Entries: ${batch.validatorEntries.length} validators`);
      }
      logger.info('└─────────────────────────────────────────────────────────────────────┘');
    }
  } catch (error) {
    logger.warn(`⚠️ Could not fetch batch information: ${error instanceof Error ? error.message : error}`);
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
 * Create protobuf RPC client for SEDA chain queries
 */
async function createSedaQueryClient(rpc: string) {
  const cometClient = await Comet38Client.connect(rpc);
  const queryClient = new QueryClient(cometClient);
  return createProtobufRpcClient(queryClient);
}

/**
 * Simple batch info structure for our needs
 */
interface SimpleBatch {
  batchNumber: bigint;
  batchId: string;
  blockHeight: bigint;
  currentDataResultRoot: string;
  dataResultRoot: string;
  validatorRoot: string;
  dataResultEntries?: any[];
  batchSignatures?: any[];
  validatorEntries?: any[];
}

/**
 * Get DataResult to find batch assignment
 */
async function getDataResult(
  drId: string,
  blockHeight: bigint,
  queryConfig: QueryConfig,
  logger: ILoggingService
): Promise<{ batchAssignment: bigint } | null> {
  try {
    const protoClient = await createSedaQueryClient(queryConfig.rpc);
    const client = new sedachain.batching.v1.QueryClientImpl(protoClient);
    
    logger.info(`📋 Querying DataResult for ${drId} at height ${blockHeight}...`);
    
    const response = await client.DataResult({ 
      dataRequestId: drId, 
      dataRequestHeight: blockHeight 
    });
    
    if (!response.batchAssignment || !response.dataResult) {
      logger.warn(`⚠️ DataResult not found for ${drId}`);
      return null;
    }
    
    logger.info(`✅ DataResult found - assigned to batch ${response.batchAssignment.batchNumber}`);
    
    return {
      batchAssignment: response.batchAssignment.batchNumber
    };
    
  } catch (error) {
    logger.error(`❌ Failed to get DataResult: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Get batch information directly from SEDA chain
 */
async function getBatch(
  batchNumber: bigint,
  queryConfig: QueryConfig,
  logger: ILoggingService
): Promise<SimpleBatch | null> {
  try {
    const protoClient = await createSedaQueryClient(queryConfig.rpc);
    const client = new sedachain.batching.v1.QueryClientImpl(protoClient);
    
    logger.info(`📦 Querying batch ${batchNumber} from SEDA chain...`);
    
    const response = await client.Batch({ 
      batchNumber, 
      latestSigned: false 
    });
    
    if (!response.batch) {
      logger.warn(`⚠️ Batch ${batchNumber} not found`);
      return null;
    }
    
    const { batch, batchSignatures, dataResultEntries, validatorEntries } = response;
    
    logger.info(`✅ Batch ${batchNumber} fetched successfully!`);
    
    return {
      batchNumber: batch.batchNumber,
      batchId: Buffer.from(batch.batchId).toString('hex'),
      blockHeight: batch.blockHeight,
      currentDataResultRoot: batch.currentDataResultRoot,
      dataResultRoot: batch.dataResultRoot,
      validatorRoot: batch.validatorRoot,
      dataResultEntries: dataResultEntries?.entries || [],
      batchSignatures: batchSignatures || [],
      validatorEntries: validatorEntries || []
    };
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      logger.warn(`⚠️ Batch ${batchNumber} not found on chain`);
      return null;
    }
    logger.error(`❌ Failed to get batch ${batchNumber}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Fetch real batch information from SEDA chain using existing QueryConfig connection
 */
async function fetchRealBatchFromSedaChain(
  drId: string,
  blockHeight: bigint,
  queryConfig: QueryConfig,
  logger: ILoggingService,
  maxRetries: number = 10,
  pollingIntervalMs: number = 3000
): Promise<SimpleBatch | null> {
  try {
    // Step 1: Get DataResult with batch assignment
    const dataResult = await getDataResult(drId, blockHeight, queryConfig, logger);
    
    if (!dataResult) {
      return null;
    }
    
    const { batchAssignment } = dataResult;
    
    // Step 2: Poll for batch completion and fetch batch details
    logger.info(`⏳ Polling for batch ${batchAssignment} completion...`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`🔄 Batch polling attempt ${attempt}/${maxRetries} for batch ${batchAssignment}...`);
      
      const batch = await getBatch(batchAssignment, queryConfig, logger);
      
      if (batch) {
        logger.info(`✅ Batch ${batchAssignment} fetched successfully from SEDA chain!`);
        return batch;
      }
      
      if (attempt < maxRetries) {
        logger.info(`⏱️ Batch ${batchAssignment} not ready yet, waiting ${pollingIntervalMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, pollingIntervalMs));
      }
    }
    
    logger.error(`❌ Failed to fetch batch ${batchAssignment} after ${maxRetries} attempts`);
    return null;

  } catch (error) {
    logger.error(`❌ Failed to fetch batch information: ${error instanceof Error ? error.message : error}`);
    return null;
  }
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
  logger: ILoggingService
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