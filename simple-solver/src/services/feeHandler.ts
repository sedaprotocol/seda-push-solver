import { abiSedaFeeManager, iProver } from "@seda-protocol/solver-evm-abi";
import { add0x } from "@seda-protocol/solver-sdk/src/services/hex";
import { Maybe, type Result, Unit } from "true-myth";
import type {
	BatchesWatcherConfig,
	DataRequestWatcherConfig,
} from "../config-parser";
import logger from "../logger";
import type { EvmNetwork } from "../networks/evm/evm-network";

export class FeeHandler {
	private feeManagerAddress: Maybe<string> = Maybe.nothing();

	constructor(
		private network: EvmNetwork,
		private config: BatchesWatcherConfig | DataRequestWatcherConfig,
	) {}

	private getFeeClaimThreshold(): bigint {
		return this.network.feeClaimThreshold;
	}

	private async claimFee(): Promise<Result<Unit, Error>> {
		const feeManagerAddress = await this.getFeeManagerAddress();

		const response = await this.network.call(
			abiSedaFeeManager,
			feeManagerAddress,
			"withdrawFees",
			[],
			this.config.gasLimit ? BigInt(this.config.gasLimit) : undefined,
			this.config.gasPrice ? BigInt(this.config.gasPrice) : undefined,
		);

		return response
			.map(() => Unit)
			.mapErr((error) => {
				logger.error(error);
				return error;
			});
	}

	private async getFeeManagerAddress(): Promise<string> {
		if (this.feeManagerAddress.isJust) {
			return this.feeManagerAddress.value;
		}

		const address = await this.network.view(
			iProver,
			this.config.contractAddress,
			"getFeeManager",
			[],
		);

		if (address.isErr) {
			throw address.error;
		}

		this.feeManagerAddress = Maybe.just(address.value);
		return address.value;
	}

	private async getFeesEarned(): Promise<Result<bigint, Error>> {
		const feeManagerAddress = await this.getFeeManagerAddress();
		// Implementation to return a big number representing cumulative fees earned
		const cumulativeFees = await this.network.view(
			abiSedaFeeManager,
			feeManagerAddress,
			"getPendingFees",
			[add0x(this.network.address)],
		);
		return cumulativeFees;
	}

	async handleFee() {
		const fees = await this.getFeesEarned();

		fees.match({
			Ok: async (value) => {
				if (value < this.getFeeClaimThreshold()) {
					logger.info(
						`Fees earned (${value.toString()}) are below the claim threshold (${this.getFeeClaimThreshold()})`,
						{
							id: this.config.id,
						},
					);
				} else {
					logger.info(
						`Fees earned (${value.toString()}) meet or exceed the claim threshold (${this.getFeeClaimThreshold()})`,
						{
							id: this.config.id,
						},
					);

					await this.claimFee();
				}
			},
			Err: async (error) => {
				logger.error(`Failed to retrieve cumulative fees: ${error.message}`, {
					id: this.config.id,
				});
			},
		});
	}
}
