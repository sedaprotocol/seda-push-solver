/**
 * EVM Contract Interaction
 * Handles smart contract interactions for result posting
 */

import { Contract, type Wallet } from 'ethers';
import { tryAsync } from '@seda-protocol/utils';
import { Result } from 'true-myth';
import type { EvmNetworkConfig } from '../../config';
import type { SedaResultData, EvmPostingResult } from './types';

/**
 * Convert a hex string DataRequest ID to bytes32 format
 */
function drIdToBytes32(drId: string): string {
  // Remove '0x' prefix if present
  const cleanHex = drId.startsWith('0x') ? drId.slice(2) : drId;
  
  // Validate that it's a valid hex string
  if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
    throw new Error(`Invalid DataRequest ID: not a valid hex string. Got: ${drId}`);
  }
  
  // Ensure it's 64 characters (32 bytes)
  if (cleanHex.length !== 64) {
    throw new Error(`Invalid DataRequest ID length: expected 64 hex characters, got ${cleanHex.length}. Value: ${drId}`);
  }
  
  // Return with '0x' prefix
  return '0x' + cleanHex;
}

/**
 * Convert result data to proper bytes format
 */
function resultToBytes(result: string): string {
  // If it's already a hex string, return as is
  if (result.startsWith('0x') && /^0x[0-9a-fA-F]*$/.test(result)) {
    return result;
  }
  
  // If it's a plain hex string, add 0x prefix
  if (/^[0-9a-fA-F]+$/.test(result)) {
    return '0x' + result;
  }
  
  // Otherwise, convert string to hex bytes
  const bytes = Buffer.from(result, 'utf8').toString('hex');
  return '0x' + bytes;
}

/**
 * Convert transaction hash to bytes32 format
 */
function txHashToBytes32(txHash: string): string {
  // Remove '0x' prefix if present
  const cleanHex = txHash.startsWith('0x') ? txHash.slice(2) : txHash;
  
  // Validate that it's a valid hex string
  if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
    throw new Error(`Invalid transaction hash: not a valid hex string. Got: ${txHash}`);
  }
  
  // Ensure it's 64 characters (32 bytes)
  if (cleanHex.length !== 64) {
    throw new Error(`Invalid transaction hash length: expected 64 hex characters, got ${cleanHex.length}. Value: ${txHash}`);
  }
  
  // Return with '0x' prefix
  return '0x' + cleanHex;
}

/**
 * ABI for the result posting contract
 * Updated to use bytes32 for drId as expected by the contract
 */
const RESULT_POSTING_ABI = [
  // Function to post SEDA result with bytes32 drId
  'function postSedaResult(bytes32 drId, bytes result, uint256 blockHeight, bytes32 txHash, uint256 timestamp) external',
  
  // Event emitted when result is posted
  'event SedaResultPosted(bytes32 indexed drId, bytes result, uint256 blockHeight, bytes32 txHash, uint256 timestamp, address indexed poster)',
  
  // Function to check if result already exists
  'function hasResult(bytes32 drId) external view returns (bool)'
];

/**
 * EVM Contract Interactor
 * Manages contract interactions for posting SEDA results
 */
export class EvmContractInteractor {
  private contract: Contract;
  private network: EvmNetworkConfig;

  constructor(network: EvmNetworkConfig, wallet: Wallet) {
    this.network = network;
    this.contract = new Contract(network.contractAddress, RESULT_POSTING_ABI, wallet);
  }

  /**
   * Check if a result already exists for the given DataRequest ID
   * Returns false if the function doesn't exist (graceful fallback)
   */
  async hasResult(drId: string): Promise<boolean> {
    try {
      const drIdBytes32 = drIdToBytes32(drId);
      // Contract methods are dynamically added at runtime based on ABI
      return await (this.contract as any).hasResult(drIdBytes32);
    } catch (error) {
      // If the function doesn't exist or fails, assume result doesn't exist
      // This allows posting to contracts that don't have duplicate checking
      console.warn(`⚠️ Could not check result existence for ${drId} on ${this.network.displayName}: ${error}`);
      console.warn(`⚠️ Proceeding with posting (assuming result doesn't exist)`);
      return false;
    }
  }

  /**
   * Post SEDA result to the EVM contract
   */
  async postResult(resultData: SedaResultData): Promise<EvmPostingResult> {
    const startTime = Date.now();
    
    try {
      // Log raw input data
      console.log(`🔍 Raw input data for ${this.network.displayName}:`);
      console.log(`  drId: "${resultData.drId}" (type: ${typeof resultData.drId})`);
      console.log(`  result: "${resultData.result}" (type: ${typeof resultData.result})`);
      console.log(`  txHash: "${resultData.txHash}" (type: ${typeof resultData.txHash})`);
      console.log(`  blockHeight: ${resultData.blockHeight} (type: ${typeof resultData.blockHeight})`);
      console.log(`  timestamp: ${resultData.timestamp} (type: ${typeof resultData.timestamp})`);

      // Check if result already exists
      const exists = await this.hasResult(resultData.drId);
      if (exists) {
        return {
          success: false,
          error: `Result for ${resultData.drId} already exists on ${this.network.displayName}`,
          network: this.network.name,
          attempt: 1,
          duration: Date.now() - startTime
        };
      }

      // Convert parameters to proper format with validation
      console.log(`🔧 Converting parameters...`);
      
      const drIdBytes32 = drIdToBytes32(resultData.drId);
      console.log(`  ✅ drIdBytes32: ${drIdBytes32}`);
      
      const resultBytes = resultToBytes(resultData.result);
      console.log(`  ✅ resultBytes: ${resultBytes}`);
      
      const txHashBytes32 = txHashToBytes32(resultData.txHash);
      console.log(`  ✅ txHashBytes32: ${txHashBytes32}`);
      
      const blockHeightStr = resultData.blockHeight.toString();
      console.log(`  ✅ blockHeight: ${blockHeightStr}`);
      
      console.log(`  ✅ timestamp: ${resultData.timestamp}`);

      // Prepare gas options
      const gasOptions = {
        gasLimit: this.network.gas.gasLimit,
        ...(this.network.gas.useEIP1559 ? {
          maxFeePerGas: this.network.gas.maxFeePerGas,
          maxPriorityFeePerGas: this.network.gas.maxPriorityFeePerGas
        } : {
          gasPrice: this.network.gas.gasPrice
        })
      };
      console.log(`⛽ Gas options:`, gasOptions);

      // Log final transaction parameters
      console.log(`📤 Calling postSedaResult with parameters:`);
      console.log(`  [0] drId (bytes32): ${drIdBytes32}`);
      console.log(`  [1] result (bytes): ${resultBytes}`);
      console.log(`  [2] blockHeight (uint256): ${blockHeightStr}`);
      console.log(`  [3] txHash (bytes32): ${txHashBytes32}`);
      console.log(`  [4] timestamp (uint256): ${resultData.timestamp}`);

      // Prepare transaction
      // Contract methods are dynamically added at runtime based on ABI
      const tx = await (this.contract as any).postSedaResult(
        drIdBytes32,
        resultBytes,
        blockHeightStr,
        txHashBytes32,
        resultData.timestamp,
        gasOptions
      );

      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      if (!receipt) {
        throw new Error('Transaction receipt is null');
      }

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString() || '0',
        network: this.network.name,
        attempt: 1,
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        network: this.network.name,
        attempt: 1,
        duration: Date.now() - startTime
      };
    }
  }
} 