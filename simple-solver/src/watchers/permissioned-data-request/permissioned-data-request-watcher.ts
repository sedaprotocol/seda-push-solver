import { iSedaCore } from "@seda-protocol/solver-evm-abi";
import type { DataResult } from "@seda-protocol/solver-sdk";
import type { PermissionedDataRequestWatcherConfig } from "../../config-parser";
import logger from "../../logger";
import type { EvmNetwork } from "../../networks/evm/evm-network";
import { BaseDataRequestWatcher } from "../base-data-request/base-data-request-watcher";
import { convertDataResultToDataResultEvm } from "../base-data-request/types";

/**
 * This class is responsible for monitoring and processing DataRequests from a specified network.
 *
 * @remarks
 * This class assumes that the given contract address corresponds to a permissionless contract
 * that adheres to the SedaCorePermissioned interface.
 */
export class PermissionedDataRequestWatcher extends BaseDataRequestWatcher {
	constructor(
		private watcherConfig: PermissionedDataRequestWatcherConfig,
		network: EvmNetwork,
	) {
		super(watcherConfig, network);
	}

	async postDataResult(dataResult: DataResult) {
		logger.info(`Submitting Data Result to ${this.watcherConfig.id}`, {
			id: dataResult.drId,
		});

		if (this.network.type === "evm") {
			const response = await this.network.call(
				iSedaCore,
				this.watcherConfig.contractAddress,
				"postResult",
				[convertDataResultToDataResultEvm(dataResult), 0n, []],
			);

			if (response.isErr) {
				logger.error(
					`Could not submit Data Result to ${this.watcherConfig.id}: ${response.error.message}`,
					{
						id: dataResult.drId,
					},
				);
				return;
			}
		} else {
			logger.error(
				`Network type ${this.network.type} is not supported to post data results`,
			);
			return;
		}

		logger.info(`Submitted Data Result to ${this.watcherConfig.id}`, {
			id: dataResult.drId,
		});
	}
}
