/**
 * DataRequest Executor
 * Handles the execution and result processing of DataRequests on the SEDA network
 */

import { postAndAwaitDataRequest, Signer } from '@seda-protocol/dev-tools';
import type { PostDataRequestInput, GasOptions } from '@seda-protocol/dev-tools';
import type { DataRequestResult, NetworkConfig } from '../../types';
import type { ILoggingService } from '../../services';
import { hexBEToNumber } from '../../helpers/hex-converter';

/**
 * Execute a DataRequest on the SEDA network and await its completion
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
  
  // Clean, structured configuration display
  if (logger) {
    logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
    logger.info('│                        📋 DataRequest Configuration                 │');
    logger.info('├─────────────────────────────────────────────────────────────────────┤');
    logger.info(`│ Oracle Program ID: ${postInput.execProgramId}`);
    logger.info(`│ Replication Factor: ${postInput.replicationFactor || 0}`);
    logger.info(`│ Gas Limit: ${postInput.execGasLimit?.toLocaleString() || 'N/A'}`);
    logger.info(`│ Gas Price: ${(postInput.gasPrice || 0).toString()}`);
    logger.info(`│ Timeout: ${awaitOptions.timeoutSeconds}s`);
    logger.info('└─────────────────────────────────────────────────────────────────────┘');
    
    logger.info('\n🚀 Submitting DataRequest to SEDA network...');
  } else {
    console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
    console.log('│                        📋 DataRequest Configuration                 │');
    console.log('├─────────────────────────────────────────────────────────────────────┤');
    console.log(`│ Oracle Program ID: ${postInput.execProgramId}`);
    console.log(`│ Replication Factor: ${postInput.replicationFactor || 0}`);
    console.log(`│ Gas Limit: ${postInput.execGasLimit?.toLocaleString() || 'N/A'}`);
    console.log(`│ Gas Price: ${(postInput.gasPrice || 0).toString()}`);
    console.log(`│ Timeout: ${awaitOptions.timeoutSeconds}s`);
    console.log('└─────────────────────────────────────────────────────────────────────┘');
    
    console.log('\n🚀 Submitting DataRequest to SEDA network...');
  }
  
  // Post the DataRequest and await result using the SEDA dev-tools API
  const result = await postAndAwaitDataRequest(signer, postInput, gasOptions, awaitOptions);
  
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