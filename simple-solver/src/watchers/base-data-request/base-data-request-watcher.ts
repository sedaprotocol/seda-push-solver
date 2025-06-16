import { EventEmitter } from "node:events";
import { iSedaCore } from "@seda-protocol/solver-evm-abi";
import {
	type DataRequest,
	createDataRequestId,
} from "@seda-protocol/solver-sdk";
import { processingInterval } from "@seda-protocol/solver-sdk";
import { Result } from "true-myth";
import type { BaseDataRequestWatcherConfig } from "../../config-parser";
import logger from "../../logger";
import type { EvmNetwork } from "../../networks/evm/evm-network";
import { strip0x } from "../../services/hex";
import {
	type DataRequestEvm,
	convertDataRequestEvmToDataRequest,
} from "./types";

type EventMap = {
	"data-requests": [DataRequest[]];
};

/**
 * This class serves as a base for watching and processing data requests from a blockchain network.
 *
 * Key features:
 * - Fetches pending data requests from a specified contract
 * - Keeps track of processed requests to avoid duplicates
 *
 * Assumes the function `getPendingRequests` is available
 */
export class BaseDataRequestWatcher extends EventEmitter<EventMap> {
	protected position = 0;
	// Ids of data requests we already returned. No need to give them again.
	protected processedDataRequests: Set<string> = new Set();

	constructor(
		protected readonly baseConfig: BaseDataRequestWatcherConfig,
		protected readonly network: EvmNetwork,
	) {
		super();
	}

	protected async fetchDataRequests(): Promise<Result<DataRequest[], Error>> {
		logger.info(
			`Fetching Data Requests range: ${this.position}-${this.baseConfig.pageLimit}`,
			{ id: this.baseConfig.id },
		);

		if (this.network.type === "evm") {
			const dataRequests = (await this.network.view(
				iSedaCore,
				this.baseConfig.contractAddress,
				"getPendingRequests",
				[BigInt(this.position), BigInt(this.baseConfig.pageLimit)],
			)) as unknown as Result<DataRequestEvm[], Error>;

			if (dataRequests.isErr) {
				return Result.err(dataRequests.error);
			}

			if (dataRequests.value.length < this.baseConfig.pageLimit) {
				// Once we reached less than the limit we know we have reached the end of the pool
				// in that case we can reset the position back to 0, to start over again
				this.position = 0;
			} else {
				// Continue going through the pool
				this.position = this.position + this.baseConfig.pageLimit;
			}

			const result: DataRequest[] = [];

			for (const evmDr of dataRequests.value) {
				const dr = convertDataRequestEvmToDataRequest(
					evmDr,
					Buffer.from(strip0x(this.network.address), "hex"),
				);
				const drId = createDataRequestId(dr);

				if (this.processedDataRequests.has(drId)) {
					continue;
				}

				result.push(dr);
				this.processedDataRequests.add(drId);
			}

			if (result.length > 0) {
				logger.info(`Found ${result.length} new data request(s)`, {
					id: this.baseConfig.id,
				});
			} else {
				logger.info("No new data requests found", {
					id: this.baseConfig.id,
				});
			}

			return Result.ok(result);
		}

		return Result.err(new Error("Unsupported chain type"));
	}

	async watch() {
		processingInterval(async () => {
			const dataRequests = await this.fetchDataRequests();

			if (dataRequests.isErr) {
				logger.error(
					`Could not fetch new requests at position ${this.position} \n: ${dataRequests.error}`,
					{ id: this.baseConfig.id },
				);
				return;
			}

			this.emit("data-requests", dataRequests.value);
		}, this.baseConfig.pollingIntervalMs);
	}
}
