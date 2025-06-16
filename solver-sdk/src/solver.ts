import { EventEmitter } from "node:events";
import { BatchFetcher } from "./batch-fetcher";
import { SedaChain, type TransactionMessage } from "./chains/seda/seda-chain";
import {
	type SolverConfig,
	type SolverConfigInternal,
	createConfig,
} from "./config";
import type { Batch } from "./models/batch";
import {
	type DataRequest,
	createDataRequestId,
	createPostDataRequestArgs,
} from "./models/data-request";
import type { DataResult } from "./models/data-result";
import { getBatch } from "./services/batch-service";
import {
	getDataResult,
	getDataResultProof,
} from "./services/data-result-service";
import { processingInterval } from "./services/processing-interval";

type DrError = {
	msg: string;
	type: "AlreadyExists" | "unknown";
};

type EventMap = {
	"solver-error": [Error];
	batch: [Batch];
	"dr-error": [DrError, DataRequest];
	"dr-posted": [DataRequest];
	"dr-result": [DataResult];
	"batch-error": [string];
};

export class Solver extends EventEmitter<EventMap> {
	private dataResultInterval?: Timer;
	private batchFetcher: BatchFetcher;
	public sedaAddress: string;

	// Data Requests that are queued/in-flight, they are not yet being watched
	private processingDataRequests: Map<string, DataRequest> = new Map();

	// Keep track of which Data Requests we need watch for results
	public watchingDataRequests: Map<string, DataRequest> = new Map();

	private constructor(
		private sedaChain: SedaChain,
		private config: SolverConfigInternal,
	) {
		super();

		this.batchFetcher = new BatchFetcher(config, sedaChain);
		this.sedaAddress = sedaChain.signer.getAddress();

		this.batchFetcher.on("fetch-error", (error) =>
			this.emit(
				"solver-error",
				new Error(`Batch could not be fetched: ${error}`),
			),
		);
		this.batchFetcher.on("batch", (batch) => this.emit("batch", batch));
	}

	static async fromConfig(config: SolverConfig): Promise<Solver> {
		const internalConfig = createConfig(config);
		const sedaChain = await SedaChain.fromConfig(internalConfig);

		if (sedaChain.isErr) {
			throw sedaChain.error;
		}

		const balance = await sedaChain.value.checkSignerBalance(
			internalConfig.minimumBalance,
		);
		if (balance.isErr) {
			throw balance.error;
		}

		return new Solver(sedaChain.value, internalConfig);
	}

	/**
	 * Includes a data request to be watched for a result. This can be usefull if you want to just watch a Data Request but not post it.
	 *
	 * @param dataRequest
	 */
	watchDataRequestForResult(dataRequest: DataRequest) {
		this.watchingDataRequests.set(
			createDataRequestId(dataRequest),
			dataRequest,
		);
	}

	/**
	 * Gets the data result proof for a specific batch. If no targetBatch is provided, it will generate a proof for the batch to which the data result was assigned.
	 *
	 * @param dataRequestId - The ID of the data request to get the proof for
	 * @param targetBatch - Optional target batch number to generate proof for
	 * @param dataRequestHeight - Optional height to query data request at. Defaults to 0 which means latest height
	 * @returns A Result containing either an array of hex strings representing the merkle proof, or an Error
	 */
	getDataResultProof(
		dataRequestId: string,
		targetBatch?: bigint,
		dataRequestHeight = 0n,
	) {
		return getDataResultProof(
			dataRequestId,
			dataRequestHeight,
			this.sedaChain,
			targetBatch,
		);
	}

	/**
	 * Gets the data result for a specific data request.
	 *
	 * @param dataRequestId - The ID of the data request to get the result for
	 * @param dataRequestHeight - Optional height to query data request at. Defaults to 0 which means latest height
	 */

	getDataResult(dataRequestId: string, dataRequestHeight = 0n) {
		return getDataResult(dataRequestId, dataRequestHeight, this.sedaChain);
	}

	getBatch(batchNumber: bigint) {
		return getBatch(batchNumber, this.sedaChain);
	}

	async listen() {
		// Make sure any dangling processes are stopped
		clearInterval(this.dataResultInterval);

		this.batchFetcher.stop();
		this.batchFetcher.start();

		// Listen for Data Results
		// Listen for new Batches
		this.sedaChain.on("tx-error", (error, transaction) => {
			if (transaction?.type === "dr") {
				const dataRequest = this.processingDataRequests.get(transaction.id);
				if (!dataRequest) return;

				this.processingDataRequests.delete(transaction.id);

				if (error.includes("DataRequestAlreadyExists")) {
					this.emit(
						"dr-error",
						{ msg: error, type: "AlreadyExists" },
						dataRequest,
					);
				} else {
					this.emit("dr-error", { msg: error, type: "unknown" }, dataRequest);
				}

				return;
			}

			this.emit(
				"solver-error",
				new Error(
					`Transaction on SEDA chain could not be posted (${transaction}): ${error}`,
				),
			);
		});

		this.sedaChain.on("tx-success", (transaction) => {
			if (transaction.type === "dr") {
				const dataRequest = this.processingDataRequests.get(transaction.id);

				if (dataRequest) {
					this.processingDataRequests.delete(transaction.id);
					this.watchingDataRequests.set(transaction.id, dataRequest);

					this.emit("dr-posted", dataRequest);
					return;
				}
			}
		});

		this.dataResultInterval = processingInterval(async () => {
			for (const drId of this.watchingDataRequests.keys()) {
				const dataResult = await this.getDataResult(drId);

				if (dataResult.isErr) {
					this.emit(
						"solver-error",
						new Error(
							`Could not get data result for ${drId}: ${dataResult.error}`,
						),
					);
					continue;
				}

				// Result is not yet available
				if (dataResult.value.isNothing) {
					continue;
				}

				this.watchingDataRequests.delete(drId);
				this.emit("dr-result", dataResult.value.value);
			}
		}, this.config.dataResultPollingIntervalMs);

		this.sedaChain.start();
	}

	/**
	 * Submits a Data Request to the SEDA chain async and then watches the data request for a result. (By emitting the event "dr-result")
	 * The event "dr-posted", "dr-result" will be emitted when completed.
	 *
	 * @param dataRequests The Data Requests to be queued.
	 */
	queueDataRequest(dataRequests: DataRequest[]) {
		const messages: TransactionMessage[] = [];

		for (const dr of dataRequests) {
			const drId = createDataRequestId(dr);

			// This data request was already submitted
			if (
				this.processingDataRequests.has(drId) ||
				this.watchingDataRequests.has(drId)
			) {
				continue;
			}

			const funds = (dr.execGasLimit + dr.tallyGasLimit) * dr.gasPrice;
			const message = {
				typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
				value: {
					sender: this.sedaChain.getSignerAddress(),
					contract: this.sedaChain.getCoreContractAddress(),
					funds: [{ denom: "aseda", amount: funds.toString() }],
					msg: Buffer.from(
						JSON.stringify({
							post_data_request: {
								seda_payload: Buffer.from([]).toString("base64"),
								payback_address: dr.paybackAddress.toString("base64"),
								posted_dr: createPostDataRequestArgs(dr),
							},
						}),
					),
				},
			};

			this.processingDataRequests.set(drId, dr);

			messages.push({
				id: drId,
				message,
				type: "dr",
			});
		}

		this.sedaChain.queueMessages(messages);
	}
}
