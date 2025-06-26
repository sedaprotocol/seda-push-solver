import { EventEmitter } from "node:events";
import { Maybe } from "true-myth";
import type { SedaChain } from "./chains/seda/seda-chain";
import type { SolverConfigInternal } from "./config";
import type { Batch } from "./models/batch";
import { getBatch, getLatestBatch } from "./services/batch-service";
import { processingInterval } from "./services/processing-interval";
import { unwrap } from "./services/unwrap";

type EventMap = {
	"fetch-error": [Error];
	batch: [Batch];
};

export class BatchFetcher extends EventEmitter<EventMap> {
	private interval: Maybe<Timer> = Maybe.nothing();
	private currentBatch: Maybe<Batch> = Maybe.nothing();

	constructor(
		private config: SolverConfigInternal,
		private sedaChain: SedaChain,
	) {
		super();
	}

	async start() {
		this.stop();

		if (this.config.startingBatch === "latest") {
			const latestBatch = await getLatestBatch(this.sedaChain);
			if (latestBatch.isErr) {
				throw new Error(
					`Could not boot, latest batch is not available: ${latestBatch.error.message}`,
				);
			}

			this.currentBatch = Maybe.just(latestBatch.value);
			this.emit("batch", latestBatch.value);
		} else {
			const startingBatch = await getBatch(
				this.config.startingBatch,
				this.sedaChain,
			);

			if (startingBatch.isErr) {
				throw new Error(
					`Could not boot, starting batch is not available: ${startingBatch.error.message}`,
				);
			}

			if (startingBatch.value.isNothing) {
				throw new Error(
					`Could not boot, starting batch #${this.config.startingBatch} does not exist (yet)`,
				);
			}

			this.currentBatch = Maybe.just(startingBatch.value.value);
			this.emit("batch", startingBatch.value.value);
		}

		this.interval = Maybe.just(
			processingInterval(async () => {
				this.fetchNextBatch();
			}, this.config.batchPollingIntervalMs),
		);
	}

	stop() {
		clearInterval(this.interval.unwrapOr(undefined));
	}

	private async fetchNextBatch(): Promise<void> {
		const currentBatch = unwrap(this.currentBatch);

		const nextBatchNumber = currentBatch.batchNumber + 1n;
		const nextBatchResult = await getBatch(nextBatchNumber, this.sedaChain);

		if (nextBatchResult.isErr) {
			this.emit("fetch-error", nextBatchResult.error);
			return;
		}

		const nextBatch = nextBatchResult.value;
		if (nextBatch.isNothing) {
			return;
		}

		this.currentBatch = Maybe.just(nextBatch.value);
		this.emit("batch", nextBatch.value);
	}
}
