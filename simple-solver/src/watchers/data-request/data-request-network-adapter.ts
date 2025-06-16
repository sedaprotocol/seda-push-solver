import type { DataRequest, DataResult } from "@seda-protocol/solver-sdk";
import type { Result, Unit } from "true-myth";
import type { DataRequestWatcherConfig } from "../../config-parser";
import type {
	ContractPaused,
	InvalidResultTimestamp,
	NonceAlreadyUsedError,
	ResultAlreadyExists,
} from "../../errors";
import type { Network } from "../../models/network";

export interface DataRequestNetworkAdapterConstructor {
	create(
		network: Network,
		config: DataRequestWatcherConfig,
	): DataRequestNetworkAdapter;
}

export interface DataRequestNetworkAdapter {
	/**
	 * Prover identifier. This is usually a combination of network id + contract address
	 * This is used to signal the batch watcher that a batch is required to be posted
	 */
	getProverIdentifier(): Promise<string>;
	getPaybackAddress(): Buffer;
	latestBatchHeight(): Promise<Result<bigint, Error>>;
	postResult(
		dataResult: DataResult,
		proof: string[],
		targetBatch: bigint,
	): Promise<
		Result<
			Unit,
			| ContractPaused
			| NonceAlreadyUsedError
			| InvalidResultTimestamp
			| ResultAlreadyExists
			| Error
		>
	>;
	getPendingRequests(
		position: number,
		limit: number,
	): Promise<Result<DataRequest[], ContractPaused | Error>>;
}
