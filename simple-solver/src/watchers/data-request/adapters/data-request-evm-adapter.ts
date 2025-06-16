import {
	abiSedaCoreV1,
	iProver,
	iSedaCore,
} from "@seda-protocol/solver-evm-abi";
import type { DataRequest, DataResult } from "@seda-protocol/solver-sdk";
import { strip0x } from "@seda-protocol/solver-sdk/src/services/hex";
import { Maybe, type Result, Unit } from "true-myth";
import { getAbiItem } from "viem";
import type { DataRequestWatcherConfig } from "../../../config-parser";
import {
	ContractPaused,
	InvalidResultTimestamp,
	ResultAlreadyExists,
} from "../../../errors";
import type { Network } from "../../../models/network";
import { EvmNetwork } from "../../../networks/evm/evm-network";
import { add0x } from "../../../services/hex";
import {
	convertDataRequestEvmToDataRequest,
	convertDataResultToDataResultEvm,
} from "../../base-data-request/types";
import type { DataRequestNetworkAdapter } from "../data-request-network-adapter";
import { DataRequestWatcher } from "../data-request-watcher";

// Allows us to know for sure when the ABI changes the solver will not compile
const AbiEnforcedPause = getAbiItem({
	abi: abiSedaCoreV1,
	name: "EnforcedPause",
});

const AbiInvalidResultTimestamp = getAbiItem({
	abi: abiSedaCoreV1,
	name: "InvalidResultTimestamp",
});

const AbiResultAlreadyExists = getAbiItem({
	abi: abiSedaCoreV1,
	name: "ResultAlreadyExists",
});

export class DataRequestEvmAdapter implements DataRequestNetworkAdapter {
	private proverAddress: Maybe<string> = Maybe.nothing();

	constructor(
		private network: EvmNetwork,
		private config: DataRequestWatcherConfig,
	) {}

	static create(
		network: Network,
		config: DataRequestWatcherConfig,
	): DataRequestEvmAdapter {
		const adapter = new DataRequestEvmAdapter(network, config);
		adapter.getProverAddress();
		return adapter;
	}

	getPaybackAddress(): Buffer {
		return Buffer.from(strip0x(this.network.address), "hex");
	}

	async getPendingRequests(
		position: number,
		limit: number,
	): Promise<Result<DataRequest[], ContractPaused | Error>> {
		const dataRequests = await this.network.view(
			iSedaCore,
			this.config.contractAddress,
			"getPendingRequests",
			[BigInt(position), BigInt(limit)],
		);

		return dataRequests
			.map((drs) => {
				return drs.map((dr) => {
					return convertDataRequestEvmToDataRequest(
						dr,
						this.getPaybackAddress(),
					);
				});
			})
			.mapErr((error) => {
				if (error.message.includes(AbiEnforcedPause.name)) {
					return new ContractPaused(error.message, {
						cause: error.cause,
					});
				}

				return error;
			});
	}

	async getProverIdentifier(): Promise<string> {
		const proverAddress = await this.getProverAddress();

		return `${this.config.networkId}-${proverAddress}`;
	}

	private async getProverAddress(): Promise<string> {
		if (this.proverAddress.isJust) {
			return this.proverAddress.value;
		}

		const response = await this.network.view(
			iSedaCore,
			this.config.contractAddress,
			"getSedaProver",
			[],
		);

		if (response.isErr) {
			throw new Error(
				`Could not get prover address for ${this.config.id}: ${response.error}`,
			);
		}

		this.proverAddress = Maybe.just(response.value as string);
		return response.value as string;
	}

	async latestBatchHeight(): Promise<Result<bigint, Error>> {
		const response = await this.network.view(
			iProver,
			await this.getProverAddress(),
			"getLastBatchHeight",
			[],
		);

		return response;
	}

	async postResult(
		dataResult: DataResult,
		proof: string[],
		targetBatch: bigint,
	) {
		const response = await this.network.call(
			iSedaCore,
			this.config.contractAddress,
			"postResult",
			[
				convertDataResultToDataResultEvm(dataResult),
				targetBatch,
				proof.map((entry) => add0x(entry)),
			],
			this.config.gasLimit ? BigInt(this.config.gasLimit) : undefined,
			this.config.gasPrice ? BigInt(this.config.gasPrice) : undefined,
		);

		return response
			.map(() => Unit)
			.mapErr((error) => {
				if (error.message.includes(AbiInvalidResultTimestamp.name)) {
					return new InvalidResultTimestamp(error.message, {
						cause: error.cause,
					});
				}

				if (error.message.includes(AbiEnforcedPause.name)) {
					return new ContractPaused(error.message, {
						cause: error.cause,
					});
				}

				if (error.message.includes(AbiResultAlreadyExists.name)) {
					return new ResultAlreadyExists(error.message, {
						cause: error.cause,
					});
				}

				return error;
			});
	}
}

DataRequestWatcher.registerNetworkAdapter(
	EvmNetwork.type,
	DataRequestEvmAdapter,
);
