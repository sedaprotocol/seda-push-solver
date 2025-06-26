/**
 * Data Result Converter
 * Converts DataResult to EVM format for contract interaction
 */

import type { Hex, ContractFunctionArgs } from 'viem';
import { ABI_SEDA_CORE_V1 } from '../abi';

/**
 * EVM Result structure for posting (extracted from ABI like simple-solver)
 */
export type DataResultEvm = ContractFunctionArgs<
  typeof ABI_SEDA_CORE_V1,
  'nonpayable',
  'postResult'
>[0];

/**
 * Convert DataResult to EVM format
 * Using the exact same logic as simple-solver's convertDataResultToDataResultEvm()
 */
export function convertDataResultToDataResultEvm(input: any): DataResultEvm {
  // Follow the exact simple-solver pattern - no assumptions, use actual values
  return {
    blockHeight: BigInt(input.blockHeight),
    blockTimestamp: input.blockTimestamp,
    consensus: input.consensus,
    drId: convertDrIdToBytes32(input.drId), // Convert DR ID to proper bytes32 format
    exitCode: input.exitCode,
    gasUsed: input.gasUsed,
    paybackAddress: add0x(input.paybackAddress.toString("hex")),
    result: add0x(input.result.toString("hex")),
    sedaPayload: add0x(input.sedaPayload.toString("hex")),
    version: input.version,
  };
}

/**
 * Convert DR ID to bytes32 format for EVM contracts
 * DR IDs from SEDA are 64-character hex strings representing 32 bytes
 */
function convertDrIdToBytes32(drId: string): Hex {
  // Remove 0x prefix if present
  const cleanId = drId.startsWith('0x') ? drId.slice(2) : drId;
  
  // Ensure it's exactly 64 characters (32 bytes)
  if (cleanId.length !== 64) {
    throw new Error(`Invalid DR ID length: expected 64 hex characters, got ${cleanId.length}`);
  }
  
  // Add 0x prefix to make it a proper bytes32
  return `0x${cleanId}` as Hex;
}

/**
 * Add 0x prefix to hex string (simple-solver pattern)
 */
export function add0x(input: string): Hex {
  if (input.startsWith('0x')) return input as Hex;
  return `0x${input}` as Hex;
}

/**
 * Strip 0x prefix from hex string
 */
export function strip0x(input: string): string {
  if (input.startsWith('0x')) return input.slice(2);
  return input;
} 