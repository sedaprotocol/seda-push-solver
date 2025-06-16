import type { sedachain } from "@seda-protocol/proto-messages";
import type { Secp256k1Signature } from "./batch-signature";

export interface BatchParams
	extends Omit<sedachain.batching.v1.Batch, "batchId"> {
	batchId: string;
}

export interface Secp256k1BatchSignature {
	validatorAddr: string;
	votingPowerPercentage: number;
	signature: Secp256k1Signature;
	publicKey: Buffer;
	ethAddress: Buffer;
	proof: Buffer[];
}

export interface ValidatorEntry {
	validatorAddress: string;
	votingPowerPercent: number;
	ethAddress: string;
}

export class UnsignedBatch {
	batchNumber: bigint;
	blockHeight: bigint;
	batchId: string;

	/**
	 * current_data_result_root is the hex-encoded root of the data result
	 * merkle tree.
	 */
	currentDataResultRoot: string;

	/**
	 * data_result_root is the hex-encoded "super root" of the previous
	 * data result and current data result roots.
	 */
	dataResultRoot: string;
	validatorRoot: string;

	constructor(params: BatchParams) {
		this.batchNumber = params.batchNumber;
		this.batchId = params.batchId;
		this.blockHeight = params.blockHeight;
		this.currentDataResultRoot = params.currentDataResultRoot;
		this.dataResultRoot = params.dataResultRoot;
		this.validatorRoot = params.validatorRoot;
	}
}

export function convertSedaChainBatchToUnsignedBatch(
	batch: sedachain.batching.v1.Batch,
): UnsignedBatch {
	return new UnsignedBatch({
		...batch,
		batchId: Buffer.from(batch.batchId).toString("hex"),
	});
}

export class Batch extends UnsignedBatch {
	constructor(
		params: BatchParams,
		public secp256k1Signatures: Secp256k1BatchSignature[],
		public dataResultEntries: Buffer[],
		public validatorEntries: ValidatorEntry[],
	) {
		super(params);
	}
}

export function convertSedaChainBatchToBatch(
	batch: sedachain.batching.v1.Batch,
	secp256k1Signatures: Secp256k1BatchSignature[],
	dataResultEntries: sedachain.batching.v1.DataResultTreeEntries,
	validatorEntries: sedachain.batching.v1.ValidatorTreeEntry[],
): Batch {
	return new Batch(
		{
			...batch,
			batchId: Buffer.from(batch.batchId).toString("hex"),
		},
		secp256k1Signatures,
		dataResultEntries.entries.map((entry) => Buffer.from(entry)),
		validatorEntries.map((entry) => ({
			ethAddress: Buffer.from(entry.ethAddress).toString("hex"),
			validatorAddress: Buffer.from(entry.validatorAddress).toString("hex"),
			votingPowerPercent: entry.votingPowerPercent,
		})),
	);
}
