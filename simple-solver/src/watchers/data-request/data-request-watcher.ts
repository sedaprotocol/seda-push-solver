import { EventEmitter } from "node:events";
import {
	type DataRequest,
	type DataResult,
	type Solver,
	createDataRequestId,
	processingInterval,
} from "@seda-protocol/solver-sdk";
import { Result, type Unit } from "true-myth";
import type { DataRequestWatcherConfig } from "../../config-parser";
import {
	ContractPaused,
	InvalidResultTimestamp,
	NonceAlreadyUsedError,
	ResultAlreadyExists,
} from "../../errors";
import logger from "../../logger";
import type { Network } from "../../models/network";
import { SolverDataResult } from "../../models/solver-data-result";
import { FeeHandler } from "../../services/feeHandler";
import type {
	DataRequestNetworkAdapter,
	DataRequestNetworkAdapterConstructor,
} from "./data-request-network-adapter";

const registeredAdapters: Map<string, DataRequestNetworkAdapterConstructor> =
	new Map();

type EventMap = {
	"data-requests": [DataRequest[]];
	"batch-required": [bigint, string];
};

/**
 * This class is responsible for monitoring and processing DataRequests from a specified network.
 *
 * @remarks
 * This class assumes that the given contract address corresponds to a permissionless contract
 * that adheres to the SedaCoreV1 interface.
 */
export class DataRequestWatcher extends EventEmitter<EventMap> {
	dataResultsToPost: Set<SolverDataResult> = new Set();
	currentBatchOnNetwork = 0n;
	private feeHandler: FeeHandler;
	private adapter: DataRequestNetworkAdapter;
	private position = 0;
	// Ids of data requests we already returned. No need to give them again.
	private processedRequests: Set<string> = new Set();
	private isPaused = false;

	constructor(
		private watcherConfig: DataRequestWatcherConfig,
		network: Network,
		private solver: Solver,
		private shouldPostDataRequest: (dr: DataRequest) => Promise<boolean>,
	) {
		super();

		const adapter = registeredAdapters.get(network.type);

		if (!adapter) {
			const adapterTypes = Array.from(registeredAdapters.keys()).join(",");
			throw new Error(
				`Adapter ${network.type} does not exist. Registered types are: ${adapterTypes}`,
			);
		}

		this.adapter = adapter.create(network, watcherConfig);
		this.feeHandler = new FeeHandler(network, watcherConfig);
	}

	static registerNetworkAdapter(
		networkType: string,
		adapter: DataRequestNetworkAdapterConstructor,
	) {
		registeredAdapters.set(networkType, adapter);
	}

	async postDataResult(dataResult: DataResult) {
		this.dataResultsToPost.add(new SolverDataResult(dataResult));
	}

	async fetchLatestBatchHeight(): Promise<Result<Unit, Error>> {
		const latestBatchNumber = await this.adapter.latestBatchHeight();

		if (latestBatchNumber.isErr) {
			logger.error(
				`Could not fetch latest batch on network: ${latestBatchNumber.error}`,
				{
					id: this.watcherConfig.id,
				},
			);

			return Result.err(latestBatchNumber.error);
		}

		if (this.currentBatchOnNetwork < latestBatchNumber.value) {
			logger.debug(
				`Network updated batch from #${this.currentBatchOnNetwork} to #${latestBatchNumber.value}`,
				{
					id: this.watcherConfig.id,
				},
			);
		}

		this.currentBatchOnNetwork = latestBatchNumber.value;

		return Result.ok();
	}

	/**
	 * Fetches new Data Requests from the connected network
	 */
	private async fetchDataRequests() {
		logger.info(
			`Fetching Data Requests range: ${this.position}-${this.position + this.watcherConfig.pageLimit}`,
			{ id: this.watcherConfig.id },
		);

		const dataRequests = await this.adapter.getPendingRequests(
			this.position,
			this.watcherConfig.pageLimit,
		);

		if (dataRequests.isErr) {
			if (dataRequests.error instanceof ContractPaused) {
				logger.error("Contract is paused");
				this.isPaused = true;
				return;
			}

			logger.error(
				`Could not fetch new requests at position ${this.position} \n: ${dataRequests.error}`,
				{ id: this.watcherConfig.id },
			);
			return;
		}

		// Since we can fetch data requests from the contract we for sure know that the contract is not paused.
		this.isPaused = false;

		if (dataRequests.value.length < this.watcherConfig.pageLimit) {
			// Once we reached less than the limit we know we have reached the end of the pool
			// in that case we can reset the position back to 0, to start over again
			this.position = 0;
		} else {
			// Continue going through the pool
			this.position = this.position + this.watcherConfig.pageLimit;
		}

		const result: DataRequest[] = [];

		for (const dr of dataRequests.value) {
			const drId = createDataRequestId(dr);

			if (this.processedRequests.has(drId)) {
				continue;
			}

			const shouldPost = await this.shouldPostDataRequest(dr);

			if (shouldPost) {
				result.push(dr);
				this.processedRequests.add(drId);
			}
		}

		if (result.length > 0) {
			logger.info(`Found ${result.length} new data request(s)`, {
				id: this.watcherConfig.id,
			});
		} else {
			logger.info("No new data requests found", {
				id: this.watcherConfig.id,
			});
		}

		this.emit("data-requests", result);
	}

	async watch() {
		(await this.fetchLatestBatchHeight()).mapErr((error) => {
			throw error;
		});

		this.feeHandler.handleFee();

		processingInterval(async () => {
			await this.fetchDataRequests();
		}, this.watcherConfig.pollingIntervalMs);

		// Ticker for syncing with the contract on batch height
		processingInterval(async () => {
			await this.fetchLatestBatchHeight();
		}, this.watcherConfig.pollingIntervalMs);

		// Ticker for posting data results
		processingInterval(async () => {
			if (this.isPaused) {
				logger.warn(
					"Contract is paused, will wait for an unpause to continue operation..",
					{
						id: this.watcherConfig.id,
					},
				);
				return;
			}

			for (const dataResult of this.dataResultsToPost) {
				if (dataResult.retryAmount > this.watcherConfig.maxTransactionRetries) {
					logger.error(
						`Retried ${dataResult.retryAmount}/${this.watcherConfig.maxTransactionRetries} times, could not recover. Will drop data result`,
						{
							id: dataResult.value.drId,
						},
					);

					// Later on we should put this in a database
					this.dataResultsToPost.delete(dataResult);
					continue;
				}

				// We need to wait on the network to post the batch
				if (dataResult.value.batchAssignment > this.currentBatchOnNetwork) {
					// Asks one of the running batch watchers to post this batch regardless of gap configuration
					this.emit(
						"batch-required",
						dataResult.value.batchAssignment,
						await this.adapter.getProverIdentifier(),
					);
					continue;
				}

				const proof = await this.solver.getDataResultProof(
					dataResult.value.drId,
					this.currentBatchOnNetwork,
				);

				if (proof.isErr) {
					logger.error(`Could not fetch data result proof: ${proof.error}`, {
						id: dataResult.value.drId,
					});

					dataResult.retryAmount += 1;
					continue;
				}

				logger.info(`Posting result on ${this.watcherConfig.id}..`, {
					id: dataResult.value.drId,
				});

				const postResult = await this.adapter.postResult(
					dataResult.value,
					proof.value,
					this.currentBatchOnNetwork,
				);

				if (postResult.isErr) {
					if (postResult.error instanceof NonceAlreadyUsedError) {
						logger.warn(
							`Could not submit result due a re-used nonce on ${this.watcherConfig.id}. Are you using the same private key for something else? Will retry`,
							{
								id: dataResult.value.drId,
							},
						);
						continue;
					}

					if (postResult.error instanceof InvalidResultTimestamp) {
						logger.warn(
							`Could not submit data result, because the timestamp exceeded (InvalidResultTimestamp) on ${this.watcherConfig.id}`,
							{
								id: dataResult.value.drId,
							},
						);

						this.dataResultsToPost.delete(dataResult);
						continue;
					}

					if (postResult.error instanceof ResultAlreadyExists) {
						logger.warn(
							`Could not submit data result, because the result already exists on ${this.watcherConfig.id}`,
							{
								id: dataResult.value.drId,
							},
						);

						this.dataResultsToPost.delete(dataResult);
						continue;
					}

					if (postResult.error instanceof ContractPaused) {
						logger.warn(
							"Could not submit data result, the contract is paused.",
						);
						this.isPaused = true;

						// No use to continue the next result since all transactions will fail after this.
						break;
					}

					logger.warn(
						`Could not post on network ${this.watcherConfig.id}. Will retry (${dataResult.retryAmount}/${this.watcherConfig.maxTransactionRetries}): ${postResult.error}`,
						{
							id: dataResult.value.drId,
						},
					);

					dataResult.retryAmount += 1;
					continue;
				}

				this.dataResultsToPost.delete(dataResult);
				logger.info(`Posted result on ${this.watcherConfig.id}`, {
					id: dataResult.value.drId,
				});
				this.feeHandler.handleFee();
			}
		}, this.watcherConfig.queueProcessingIntervalMs);
	}
}
