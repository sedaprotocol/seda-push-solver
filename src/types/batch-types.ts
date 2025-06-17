/**
 * Batch Type Definitions
 */

export interface SignedBatch {
  batchNumber: bigint;
  batchId: string;
  blockHeight: bigint;
  currentDataResultRoot: string;
  dataResultRoot: string;
  validatorRoot: string;
  dataResultEntries?: any[];
  batchSignatures?: BatchSignature[];
  validatorEntries?: ValidatorEntry[];
}

export interface BatchSignature {
  validatorAddress: Uint8Array;
  secp256k1Signature: Uint8Array;
}

export interface ValidatorEntry {
  validatorAddress: Uint8Array;
  ethAddress: Uint8Array;
  votingPowerPercent: number;
}

export interface ProcessedSignature {
  validatorAddr: string;
  ethAddress: Buffer;
  votingPowerPercentage: number;
  signature: Buffer;
  proof: Buffer[];
} 