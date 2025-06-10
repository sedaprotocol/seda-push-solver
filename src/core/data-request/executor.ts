/**
 * DataRequest Executor
 * Handles the execution and result processing of DataRequests on the SEDA network
 */

import { postAndAwaitDataRequest, Signer } from '@seda-protocol/dev-tools';
import type { PostDataRequestInput, GasOptions } from '@seda-protocol/dev-tools';
import type { DataRequestResult, NetworkConfig } from '../../types';
import { hexBEToNumber } from '../../helpers/hex-converter';

/**
 * Execute a DataRequest on the SEDA network and await its completion
 * @param signer The SEDA signer instance for transaction signing
 * @param postInput The PostDataRequestInput containing oracle program parameters
 * @param gasOptions Gas configuration for the transaction
 * @param awaitOptions Timeout and polling configuration for result monitoring
 * @param networkConfig Network configuration for logging and context
 * @returns Promise resolving to DataRequestResult with execution details
 * @throws Error if DataRequest execution fails or times out
 */
export async function executeDataRequest(
  signer: Signer, 
  postInput: PostDataRequestInput, 
  gasOptions: GasOptions, 
  awaitOptions: { timeoutSeconds: number; pollingIntervalSeconds: number },
  networkConfig: NetworkConfig
): Promise<DataRequestResult> {
  
  console.log('📋 DataRequest Configuration:');
  console.log(`   Oracle Program ID: ${postInput.execProgramId}`);
  console.log(`   Replication Factor: ${postInput.replicationFactor}`);
  console.log(`   Gas Limit: ${postInput.execGasLimit?.toLocaleString()}`);
  console.log(`   Gas Price: ${postInput.gasPrice}`);
  console.log(`   Timeout: ${awaitOptions.timeoutSeconds}s`);
  
  // Post the DataRequest and await result using the SEDA dev-tools API
  const result = await postAndAwaitDataRequest(signer, postInput, gasOptions, awaitOptions);
  
  console.log('✅ DataRequest completed successfully');
  console.log('📊 Result Details:');
  console.log(`   DR ID: ${result.drId}`);
  console.log(`   Exit Code: ${result.exitCode}`);
  console.log(`   DR block Height: ${result.drBlockHeight}`);
  console.log(`   Gas Used: ${result.gasUsed}`);
  console.log(`   Consensus: ${result.consensus}`);
  console.log(`   Result (as hex): ${result.result || 'No result data'}`);
  console.log(`   Explorer: ${networkConfig.explorerEndpoint}/data-requests/${result.drId}/${result.drBlockHeight}`);
  
  // Log BE conversions if result looks like hex for better readability
  if (result.result && typeof result.result === 'string' && /^(0x)?[0-9a-fA-F]+$/.test(result.result)) {
    console.log(`   Result (number): ${hexBEToNumber(result.result)}`);
  }
  
  return {
    drId: result.drId,
    exitCode: result.exitCode,
    result: result.result,
    blockHeight: Number(result.blockHeight),
    gasUsed: result.gasUsed.toString()
  };
} 