import type { Batch } from "@seda-protocol/solver-sdk";
import type { Result, Unit } from "true-myth";
import type { BatchesWatcherConfig } from "../../config-parser";
import type {
	BatchAlreadyExists,
	BatchConsensusNotReached,
	ContractPaused,
	NonceAlreadyUsedError,
} from "../../errors";
import type { Network } from "../../models/network";

export interface BatchNetworkAdapterConstructor {
	create(network: Network, config: BatchesWatcherConfig): BatchNetworkAdapter;
}

export interface BatchNetworkAdapter {
	/**
	 * Prover identifier. This is usually a combination of network id + contract address
	 * This is used to signal the batch watcher that a batch is required to be posted
	 */
	getProverIdentifier(): Promise<string>;
	latestBatchHeight(): Promise<Result<bigint, Error>>;
	isContractPaused(): Promise<Result<boolean, Error>>;

	/**
	 * A proof can only be constructed with the validator entries as they are in the contract,
	 * not just the batch we're trying to post.
	 *
	 * @param batch - The batch to post.
	 * @param latestBatchOnContract - The latest batch on the contract.
	 */
	postBatch(
		batch: Batch,
		latestBatchOnContract: Batch,
	): Promise<
		Result<
			Unit,
			| ContractPaused
			| BatchConsensusNotReached
			| NonceAlreadyUsedError
			| BatchAlreadyExists
			| Error
		>
	>;
}
