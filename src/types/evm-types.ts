/**
 * EVM Network Type Definitions
 */

import type { HexString } from '../utils/hex';

/**
 * Gas configuration for EVM transactions
 */
export interface EvmGasConfig {
  /** Gas limit for contract interactions */
  gasLimit: number;
  /** Gas price in wei (legacy transactions) */
  gasPrice?: string;
  /** Max fee per gas for EIP-1559 transactions */
  maxFeePerGas?: string;
  /** Max priority fee per gas for EIP-1559 transactions */
  maxPriorityFeePerGas?: string;
  /** Whether to use EIP-1559 gas pricing */
  useEIP1559: boolean;
}

/**
 * EVM Network Configuration Interface
 */
export interface EvmNetworkConfig {
  /** Network identifier (e.g., 'base', 'ethereum') */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** RPC endpoint URL */
  rpcUrl: string;
  /** Chain ID */
  chainId: number;
  /** Smart contract address for result posting */
  contractAddress: string;
  /** Gas configuration for this network */
  gas: EvmGasConfig;
  /** Whether this network is enabled */
  enabled: boolean;
}

export interface EvmBatch {
  batchHeight: bigint;
  blockHeight: bigint;
  validatorsRoot: HexString;
  resultsRoot: HexString;
  provingMetadata: HexString;
}

export interface ValidatorProof {
  signer: HexString;
  votingPower: number;
  merkleProof: HexString[];
}

export interface BatchPostingResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface NetworkBatchStatus {
  networkName: string;
  batchExists: boolean;
  lastBatchHeight: bigint | null;
  posted?: boolean;
  txHash?: string;
  error?: string;
} 