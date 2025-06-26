/**
 * Result Existence Checker
 * Checks if a DataRequest result already exists on an EVM network
 */

import type { EvmNetworkConfig } from '../../types';
import type { LoggingServiceInterface } from '../../services';
import { readEvmContract } from '../../utils/transaction/evm-transaction-builder';
import { ABI_SEDA_CORE_V1 } from '../abi';
import { getErrorMessage } from '../../helpers/error-utils';

/**
 * Check if a result already exists on the network
 */
export async function checkResultExists(
  network: EvmNetworkConfig,
  sedaCoreAddress: string,
  drId: string,
  logger?: LoggingServiceInterface
): Promise<boolean> {
  try {
    // Convert DR ID to proper bytes32 format (same as in data-result-converter)
    const requestId = convertDrIdToBytes32(drId);

    logger?.info(`🔍 Checking hasResult('${requestId}') on ${network.displayName} at ${sedaCoreAddress}`);
    
    const hasResult = await readEvmContract<boolean>(
      network,
      sedaCoreAddress,
      ABI_SEDA_CORE_V1 as unknown as any[],
      'hasResult',
      [requestId]
    );

    logger?.info(`📋 hasResult result: ${hasResult} for DR ${drId} on ${network.displayName}`);
    
    // If hasResult returns true, let's also verify by trying to get the actual result
    if (hasResult) {
      try {
        logger?.info(`🔍 Double-checking by calling getResult('${requestId}') to verify result exists...`);
        const result = await readEvmContract<any>(
          network,
          sedaCoreAddress,
          ABI_SEDA_CORE_V1 as unknown as any[],
          'getResult',
          [requestId]
        );
        logger?.info(`📋 getResult verification: ${result ? 'Result confirmed exists' : 'Result not found despite hasResult=true'}`);
        return result !== null && result !== undefined;
      } catch (getResultError) {
        logger?.warn(`⚠️ getResult verification failed: ${getErrorMessage(getResultError)} - trusting hasResult=${hasResult}`);
        return hasResult;
      }
    }
    
    return hasResult;
  } catch (error) {
    logger?.warn(`❌ Failed to check result existence for DR ${drId}: ${getErrorMessage(error)}`);
    return false; // Assume doesn't exist if we can't check
  }
}

/**
 * Convert DR ID to bytes32 format for EVM contracts
 * DR IDs from SEDA are 64-character hex strings representing 32 bytes
 */
function convertDrIdToBytes32(drId: string): string {
  // Remove 0x prefix if present
  const cleanId = drId.startsWith('0x') ? drId.slice(2) : drId;
  
  // Ensure it's exactly 64 characters (32 bytes)
  if (cleanId.length !== 64) {
    throw new Error(`Invalid DR ID length: expected 64 hex characters, got ${cleanId.length}`);
  }
  
  // Add 0x prefix to make it a proper bytes32
  return `0x${cleanId}`;
} 