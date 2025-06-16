import {
	type Batch,
	type Solver,
	processingInterval,
	unwrap,
} from "@seda-protocol/solver-sdk";
import { Maybe, Result } from "true-myth";
import type { BatchesWatcherConfig } from "../../config-parser";
import {
	BatchAlreadyExists,
	BatchConsensusNotReached,
	ContractPaused,
	NonceAlreadyUsedError,
} from "../../errors";
import logger from "../../logger";
import type { EvmNetwork } from "../../networks/evm/evm-network";
import { FeeHandler } from "../../services/feeHandler";
import type {
	BatchNetworkAdapter,
	BatchNetworkAdapterConstructor,
} from "./batch-network-adapter";
import { SolverBatch } from "./models/solver-batch";

const registeredAdapters: Map<string, BatchNetworkAdapterConstructor> =
	new Map();

export class BatchesWatcher {
	public signatureScheme = "secp256k1" as const;
	private adapter: BatchNetworkAdapter;
	private feeHandler: FeeHandler;
	private lastBatchHeight: Maybe<bigint> = Maybe.nothing();
	private batchesToPost: SolverBatch[] = [];
	private isPaused = false;

	constructor(
		private watcherConfig: BatchesWatcherConfig,
		network: EvmNetwork,
		private solver: Solver,
	) {
		this.signatureScheme = watcherConfig.signatureScheme;

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

	async getProverIdentifier(): Promise<string> {
		return this.adapter.getProverIdentifier();
	}

	static registerNetworkAdapter(
		networkType: string,
		adapter: BatchNetworkAdapterConstructor,
	) {
		registeredAdapters.set(networkType, adapter);
	}

	async getLatestBatchHeight(
		forceFetch = false,
	): Promise<Result<bigint, Error>> {
		if (!forceFetch && this.lastBatchHeight.isJust) {
			return Result.ok(this.lastBatchHeight.value);
		}

		const response = await this.adapter.latestBatchHeight();

		if (response.isErr) {
			logger.error(`Could not get latestBatchHeight: ${response.error}`, {
				id: this.watcherConfig.id,
			});

			return Result.err(response.error);
		}

		this.lastBatchHeight = Maybe.just(response.value);

		return Result.ok(response.value);
	}

	private async addRecoveryBatch(failedBatchHeight: bigint) {
		const contractBatchHeight = unwrap(await this.getLatestBatchHeight());
		const batchHeightToTry =
			contractBatchHeight + (failedBatchHeight - contractBatchHeight) / 2n;
		const batchToTry = await this.solver.getBatch(batchHeightToTry);

		if (batchToTry.isErr) {
			logger.error(`Could not fetch recovery batch #${batchHeightToTry}`, {
				id: this.watcherConfig.id,
			});
			return;
		}

		if (batchToTry.value.isNothing) {
			logger.error(`Recovery batch #${batchHeightToTry} does not exist..`, {
				id: this.watcherConfig.id,
			});
			return;
		}

		logger.debug(
			`Added recovery batch #${batchHeightToTry} at the front of the queue`,
			{
				id: this.watcherConfig.id,
			},
		);

		this.batchesToPost.unshift(new SolverBatch(batchToTry.value.value));
	}

	async postBatch(batch: Batch, forceUpdate = false) {
		// Make sure we have no duplicates
		if (
			this.batchesToPost.some((v) => v.value.batchNumber === batch.batchNumber)
		) {
			return;
		}

		const latestBatchHeight = unwrap(await this.getLatestBatchHeight());
		if (batch.batchNumber <= latestBatchHeight) {
			return;
		}

		if (!forceUpdate) {
			const delta = batch.batchNumber - latestBatchHeight;

			// We only past batches that can be used to gap
			if (delta < this.watcherConfig.targetBatchGap) {
				logger.debug(
					`Batch #${batch.batchNumber} will not be posted due insufficient gap. Gap = ${delta} but required ${this.watcherConfig.targetBatchGap}`,
					{ id: this.watcherConfig.id },
				);
				return;
			}
		} else {
			logger.debug(
				`Batch #${batch.batchNumber} will be posted regardless of gap due a data result requiring this batch.`,
				{ id: this.watcherConfig.id },
			);
		}

		logger.debug(`Added batch #${batch.batchNumber} to the queue`, {
			id: this.watcherConfig.id,
		});

		this.batchesToPost.push(new SolverBatch(batch));
	}

	private async getLatestBatchOnContract(
		latestBatchHeight: bigint,
	): Promise<Result<Batch, string>> {
		const latestBatchOnContract = await this.solver.getBatch(latestBatchHeight);

		if (latestBatchOnContract.isErr) {
			return Result.err(
				`Could not fetch latest batch on contract: ${latestBatchOnContract.error}`,
			);
		}
		if (latestBatchOnContract.value.isNothing) {
			return Result.err(
				`Latest batch on contract does not exist: ${latestBatchHeight}`,
			);
		}

		return Result.ok(latestBatchOnContract.value.value);
	}

	private deleteBatchFromQueue(batchHeight: bigint) {
		const index = this.batchesToPost.findIndex(
			(v) => v.value.batchNumber === batchHeight,
		);
		this.batchesToPost.splice(index, 1);
	}

	async watch() {
		(await this.getLatestBatchHeight(true)).mapErr((error) => {
			throw error;
		});

		processingInterval(async () => {
			if (!this.isPaused) {
				// No need to check the contract when we are not in paused mode.
				// saves a couple RPC calls
				return;
			}

			const paused = await this.adapter.isContractPaused();

			if (paused.isErr) {
				logger.error(
					`Could not fetch latest pause status of contract: ${paused.error}`,
				);
				return;
			}

			this.isPaused = paused.value;

			if (!paused.value) {
				logger.info("Contract has been unpaused");
			}
		}, this.watcherConfig.pausedCheckIntervalMs);

		processingInterval(async () => {
			// It's possible someone else posted a batch
			// we update every so often to be synced with the contract
			await this.getLatestBatchHeight(true);
		}, this.watcherConfig.pollingIntervalMs);

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

			for (const batch of this.batchesToPost) {
				const latestBatchHeight = unwrap(await this.getLatestBatchHeight());
				const latestBatchOnContract =
					await this.getLatestBatchOnContract(latestBatchHeight);

				if (latestBatchOnContract.isErr) {
					logger.error(latestBatchOnContract.error);
					return;
				}

				if (batch.retryAmount > this.watcherConfig.maxTransactionRetries) {
					logger.error(
						`Retried posting batch #${batch.value.batchNumber} ${batch.retryAmount} times. Could not recover, will drop.`,
						{
							id: this.watcherConfig.id,
						},
					);

					this.deleteBatchFromQueue(batch.value.batchNumber);
					continue;
				}

				if (latestBatchHeight >= batch.value.batchNumber) {
					logger.debug(
						`Contract is already at batch #${latestBatchHeight} no need to update to #${batch.value.batchNumber}`,
						{
							id: this.watcherConfig.id,
						},
					);

					this.deleteBatchFromQueue(batch.value.batchNumber);
					continue;
				}

				logger.info(
					`Posting Batch #${batch.value.batchNumber} with contract Batch #${latestBatchHeight}`,
					{
						id: this.watcherConfig.id,
					},
				);

				const response = await this.adapter.postBatch(
					batch.value,
					latestBatchOnContract.value,
				);

				if (response.isErr) {
					if (response.error instanceof ContractPaused) {
						this.isPaused = true;
						logger.warn(
							"Could not submit data result, the contract is paused.",
						);
						break;
					}

					if (response.error instanceof NonceAlreadyUsedError) {
						logger.warn(
							`Could not submit batch #${batch.value.batchNumber} due a re-used nonce. Are you using the same private key for something else? Will retry`,
							{
								id: this.watcherConfig.id,
							},
						);
						continue;
					}

					if (response.error instanceof BatchConsensusNotReached) {
						logger.warn(
							`Could not submit batch #${batch.value.batchNumber} due voting power change. Will try to recover. Error: ${response.error.message}`,
							{
								id: this.watcherConfig.id,
								batchNumber: batch.value.batchNumber,
								latestBatchHeight,
							},
						);

						await this.addRecoveryBatch(batch.value.batchNumber);
						// Break so that in the next iteration we can handle the recovery batch first
						break;
					}

					if (response.error instanceof BatchAlreadyExists) {
						logger.warn(
							`Could not submit batch #${batch.value.batchNumber} because it already exists.`,
							{
								id: this.watcherConfig.id,
							},
						);

						this.deleteBatchFromQueue(batch.value.batchNumber);
						continue;
					}

					logger.warn(
						`Failed to submit batch #${batch.value.batchNumber} (${batch.retryAmount}/${this.watcherConfig.maxTransactionRetries}): ${response.error}`,
						{
							id: this.watcherConfig.id,
						},
					);
					batch.retryAmount += 1;
					continue;
				}

				this.lastBatchHeight = Maybe.just(BigInt(batch.value.batchNumber));

				logger.info(`Posted Batch #${batch.value.batchNumber}`, {
					id: this.watcherConfig.id,
				});

				this.feeHandler.handleFee();
				this.deleteBatchFromQueue(batch.value.batchNumber);
			}
		}, this.watcherConfig.queueProcessingIntervalMs);
	}
}
