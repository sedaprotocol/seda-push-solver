import { processingInterval } from "@seda-protocol/solver-sdk";
import { tryAsync } from "@seda-protocol/utils";
import { JSONPath } from "jsonpath-plus";
import { Maybe, Result } from "true-myth";
import type { TokenConfig } from "./config-parser";
import logger from "./logger";

export class TokenPriceFetcher {
	// The price will be updated on boot and fail if it could not set an initial price.
	private price: Maybe<number> = Maybe.nothing();
	private interval: Maybe<Timer> = Maybe.nothing();
	private readonly config: TokenConfig;
	public decimals: number;
	private retries = 0;

	constructor(config: TokenConfig) {
		this.config = config;
		this.decimals = config.decimals;
	}

	private increaseRetries() {
		this.retries += 1;

		if (this.retries >= this.config.maxPriceFetchRetries) {
			logger.error(
				"Could not fetch token price. Will halt operation for chains using this token",
				{
					id: this.config.token,
				},
			);

			this.price = Maybe.nothing();
		}
	}

	private async fetchPrice(): Promise<Result<number, Error>> {
		const response = await tryAsync(async () =>
			fetch(this.config.url, {
				...(this.config.headers && {
					headers: Object.fromEntries(this.config.headers),
				}),
			}),
		);

		if (response.isErr) {
			this.increaseRetries();
			return Result.err(response.error);
		}

		if (!response.value.ok) {
			this.increaseRetries();
			const error = new Error(
				`HTTP error, status: ${response.value.status}. body: ${await response.value.text()}`,
			);
			return Result.err(error);
		}

		const jsonResult = await tryAsync(() => response.value.json());

		if (jsonResult.isErr) {
			return jsonResult;
		}

		const [result] = JSONPath({
			path: this.config.jsonPath,
			json: jsonResult.value,
		});

		const price = Number(result);

		if (Number.isNaN(price)) {
			this.increaseRetries();
			const error = new Error(
				`Invalid price format received, received: ${result} but is ${price}`,
			);
			return Result.err(error);
		}

		logger.info(`Price updated to: $${result}`, {
			id: this.config.token,
		});

		this.price = Maybe.just(price);
		this.retries = 0;
		return Result.ok(result);
	}

	public async startPolling(): Promise<void> {
		// Fetch immediately
		(await this.fetchPrice()).mapErr((error) => {
			throw error;
		});

		// Then start the interval
		this.interval = Maybe.just(
			processingInterval(async () => {
				const result = await this.fetchPrice();
				result.mapErr((error) => {
					logger.error(`Error during price polling: ${error}`, {
						id: this.config.token,
					});
				});
			}, this.config.pollingIntervalMs),
		);
	}

	public getCurrentPrice(): Maybe<number> {
		return this.price;
	}

	public stop(): void {
		this.interval.match({
			Just: (interval) => {
				clearInterval(interval);
				this.interval = Maybe.nothing();
				logger.debug(`Stopped price polling for ${this.config.token}`);
			},
			Nothing: () => {
				// No interval to clear
			},
		});
	}
}
