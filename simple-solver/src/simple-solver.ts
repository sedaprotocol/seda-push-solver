import {
	type Batch,
	type DataRequest,
	type Solver,
	createDataRequestId,
	formatTokenUnits,
} from "@seda-protocol/solver-sdk";
import Big from "big.js";
import { Maybe } from "true-myth";
import type { Config } from "./config-parser";
import { SEDA_TOKEN_DECIMALS, SEDA_TOKEN_KEY } from "./constants";
import logger from "./logger";
import type { Network } from "./models/network";
import { EvmNetwork } from "./networks/evm/evm-network";
import { TokenPriceFetcher } from "./tokens";

import { convertDataResultToDataResultEvm } from "./watchers/base-data-request/types";
import { iSedaCore, iProver } from "@seda-protocol/solver-evm-abi";
import {
	ContractPaused,
	InvalidResultTimestamp,
	ResultAlreadyExists,
	NonceAlreadyUsedError,
} from "./errors";

interface NetworkResultState {
	networkId: string;
	network: Network;
	retryCount: number;
	lastError?: Error;
}

export class SimpleSolver {
	// Simplified data request tracking for interval-based operation
	dataRequests: Map<string, DataRequest> = new Map();
	dataRequestsPostRetries: Map<string, number> = new Map();
	networks: Map<string, Network> = new Map();
	batches: Map<bigint, Batch> = new Map();
	tokens: Map<string, TokenPriceFetcher> = new Map();
	
	// Destination networks for 1-to-many result posting
	private destinationNetworks: Map<string, Network> = new Map();
	private intervalTimer: Timer | null = null;

	private networkBatchHeights: Map<string, bigint> = new Map();
	private networkContractAddresses: Map<string, string> = new Map();
	private networkProverAddresses: Map<string, string> = new Map();


	constructor(
		private solver: Solver,
		private config: Config,
	) {
		logger.info("Initializing SimpleSolver in interval mode");
		
		// Initialize all networks
		for (const networkConfig of config.networks) {
			this.networks.set(networkConfig.id, new EvmNetwork(networkConfig));
		}

		// Set up destination networks based on interval config
		for (const networkId of config.interval.destinationNetworkIds) {
			const network = Maybe.of(this.networks.get(networkId)).unwrapOrElse(() => {
				throw new Error(
					`Destination network ${networkId} not found in networks configuration`,
				);
			});
			this.destinationNetworks.set(networkId, network);
		}

		// Initialize token price fetchers
		for (const tokenConfig of config.tokens) {
			this.tokens.set(tokenConfig.token, new TokenPriceFetcher(tokenConfig));
		}

		// Log configuration summary
		logger.info(`Configured ${this.destinationNetworks.size} destination networks: ${config.interval.destinationNetworkIds.join(", ")}`);
		logger.info(`Interval: ${config.interval.intervalMs}ms`);
		if (config.interval.token) {
			logger.info(`Profitability token: ${config.interval.token}`);
		}
	}

	/**
	 * Creates a DataRequest object that exactly matches the DataRequest interface
	 */
	private createDataRequestFromConfig(): DataRequest {
		const drConfig = this.config.interval.dataRequest;
		
		const dataRequest: DataRequest = {
			version: drConfig.version,
			execProgramId: drConfig.execProgramId,
			execInputs: Buffer.from(drConfig.execInputs || "", "hex"),
			tallyProgramId: drConfig.tallyProgramId,
			tallyInputs: Buffer.from(drConfig.tallyInputs || "", "hex"),
			replicationFactor: drConfig.replicationFactor,
			consensusFilter: Buffer.from(drConfig.consensusFilter || "", "hex"),
			gasPrice: drConfig.gasPrice,
			execGasLimit: drConfig.execGasLimit,
			tallyGasLimit: drConfig.tallyGasLimit,
			memo: Buffer.from(drConfig.memo || "", "hex"),
			paybackAddress: Buffer.from(drConfig.paybackAddress, "hex"),
			fees: {
				requestFee: drConfig.fees.requestFee,
				resultFee: drConfig.fees.resultFee,
				batchFee: drConfig.fees.batchFee,
			},
		};

		return dataRequest;
	}

	/**
	 * Posts a data request at the configured interval
	 */
	private async postIntervalDataRequest(): Promise<void> {
		try {
			logger.info("Interval triggered - checking if data request should be posted");

			const shouldPost = await this.shouldPostDataRequest();
			if (!shouldPost) {
				logger.info("Profitability check failed, skipping this interval");
				return;
			}

			const dataRequest = this.createDataRequestFromConfig();
			const drId = createDataRequestId(dataRequest);

			// Check if we're already processing this request
			if (this.dataRequests.has(drId)) {
				logger.info("Data request already in progress, skipping", { id: drId });
				return;
			}

			logger.info("Posting data request to SEDA", { id: drId });
			
			// Track the request
			this.dataRequests.set(drId, dataRequest);
			this.dataRequestsPostRetries.set(drId, 0);

			// Queue the data request
			this.solver.queueDataRequest([dataRequest]);

		} catch (error) {
			logger.error("Failed to post interval data request", { error });
		}
	}

	/**
	 * This method evaluates whether a data request is profitable enough to process by:
	 * 1. Verifying the request fee covers execution cost plus required profit margin
	 * 2. Ensuring the result fee meets the minimum configured threshold
	 */
	private async shouldPostDataRequest(): Promise<boolean> {
		const intervalConfig = this.config.interval;
		
		if (!intervalConfig.token) {
			logger.debug("No token configured for profitability check, proceeding");
			return true;
		}

		// Create a data request from our interval config to check profitability
		const dr: DataRequest = this.createDataRequestFromConfig();
		
		const tokenDecimals = Maybe.of(this.tokens.get(intervalConfig.token))
			.map((t) => t.decimals)
			.unwrapOr(0);

		const tokenPriceUsd: Maybe<number> = Maybe.of(this.tokens.get(intervalConfig.token))
			.map((t) => t.getCurrentPrice())
			.unwrapOr(Maybe.nothing());

		const sedaPriceUsd: Maybe<number> = Maybe.of(
			this.tokens.get(SEDA_TOKEN_KEY),
		)
			.map((t) => t.getCurrentPrice())
			.unwrapOr(Maybe.nothing());

		if (tokenPriceUsd.isNothing) {
			logger.error(
				`${intervalConfig.token} token price was not updated in a while. Skipping data request posting`,
			);
			return false;
		}

		if (sedaPriceUsd.isNothing) {
			logger.error(
				"SEDA price was not updated in a while. Skipping data request posting",
			);
			return false;
		}

		const executionFeeInSedaUsd = new Big(
			formatTokenUnits(
				dr.gasPrice * dr.execGasLimit,
				SEDA_TOKEN_DECIMALS,
				SEDA_TOKEN_DECIMALS,
			),
		).mul(sedaPriceUsd.value);

		const requestFeeInTokenUsd = new Big(
			formatTokenUnits(dr.fees.requestFee, tokenDecimals, tokenDecimals),
		).mul(tokenPriceUsd.value);

		// Calculate minimum required fee including profit percentage
		const minRequiredFeeUsd = executionFeeInSedaUsd.mul(
			1 + intervalConfig.minimumProfitPercentageToPostRequest / 100,
		);

		// Check if request fee covers execution cost plus required profit margin
		if (requestFeeInTokenUsd.lt(minRequiredFeeUsd)) {
			logger.debug(
				`Request fee $${requestFeeInTokenUsd} is less than minimum required $${minRequiredFeeUsd}. Skipping interval posting.`,
			);
			return false;
		}

		// Check if result fee meets minimum threshold
		const resultFeeInToken = new Big(
			formatTokenUnits(
				dr.fees.resultFee.toString(),
				tokenDecimals,
				tokenDecimals,
			),
		);

		if (resultFeeInToken.lt(intervalConfig.minimumFeeToPostResult)) {
			logger.debug(
				`Result fee ${resultFeeInToken} ${intervalConfig.token} tokens is less than minimum required ${intervalConfig.minimumFeeToPostResult.toString()}. Skipping interval posting.`,
			);
			return false;
		}

		const resultFeeInUsd = resultFeeInToken.mul(tokenPriceUsd.value);

		logger.info(
			`Profitability check passed. Data Request has a fee value of ~$${requestFeeInTokenUsd.add(resultFeeInUsd).toString()} and posting would cost ~$${executionFeeInSedaUsd.add(resultFeeInUsd)}`,
		);

		return true;
	}

	/**
	 * Handle data results and post to all destination networks (1-to-many)
	 */
	private async onDataResult(result: any): Promise<void> {
		logger.info("Data Result available", {
			id: result.drId,
		});

		const dataRequest = Maybe.of(this.dataRequests.get(result.drId));

		if (dataRequest.isNothing) {
			logger.error("No tracked data request found for result", {
				id: result.drId,
			});
			return;
		}

		// Post result to all destination networks (1-to-many)
		const promises: Promise<void>[] = [];
		
		for (const [networkId, network] of this.destinationNetworks) {
			logger.info(`Posting result to destination network: ${networkId}`, {
				id: result.drId,
			});
			
			promises.push(this.postResultToNetwork(result, network, networkId));
		}

		// Clean up tracking
		this.dataRequests.delete(result.drId);
		
		// Wait for all destinations to complete
		try {
			await Promise.all(promises);
			logger.info(`Successfully posted result to ${this.destinationNetworks.size} destination networks`, {
				id: result.drId,
			});
		} catch (error) {
			logger.error(`Failed to post result to some destination networks`, {
				id: result.drId,
				error,
			});
		}
	}

		/**
	 * NEW: Get or discover SEDA Core contract address for a network
	 */
	private async getNetworkContractAddress(networkId: string): Promise<string> {
		const cached = this.networkContractAddresses.get(networkId);
		if (cached) {
			return cached;
		}

		// TODO: This should come from network config
		// For now, using placeholder - in real implementation this would be in config
		const contractAddress = "0x1234567890123456789012345678901234567890";
		
		this.networkContractAddresses.set(networkId, contractAddress);
		logger.warn(`Using placeholder contract address for ${networkId}: ${contractAddress}`);
		
		return contractAddress;
	}
	
	private async getNetworkProverAddress(networkId: string): Promise<string> {
		const cached = this.networkProverAddresses.get(networkId);
		if (cached) {
			return cached;
		}

		const network = this.destinationNetworks.get(networkId);
		if (!network) {
			throw new Error(`Network ${networkId} not found`);
		}

		const contractAddress = await this.getNetworkContractAddress(networkId);

		// Get prover address from SEDA Core contract
		const result = await network.view(
			iSedaCore,
			contractAddress,
			"getSedaProver",
			[],
		);

		if (result.isErr) {
			throw new Error(`Failed to get prover address for ${networkId}: ${result.error}`);
		}

		const proverAddress = result.value as string;
		this.networkProverAddresses.set(networkId, proverAddress);
		
		logger.info(`Discovered prover address for ${networkId}: ${proverAddress}`);
		return proverAddress;
	}


	/**
	 * Post result to a specific network (placeholder implementation)
	 */
	private async postResultToNetwork(result: any, network: Network, networkId: string): Promise<void> {
		try {
			logger.info(`Posting result to ${networkId}`, { id: result.drId });
			
			// TODO: This needs to be implemented based on the actual network interface
			// For now, we'll simulate the posting with a delay
			await new Promise(resolve => setTimeout(resolve, 100));
			
			logger.info(`Successfully posted result to ${networkId}`, { 
				networkId, 
				resultId: result.drId 
			});
			
		} catch (error) {
			logger.error(`Failed to post result to ${networkId}`, { 
				error, 
				resultId: result.drId 
			});
			throw error;
		}
	}

	/**
	 * Main listen method - starts interval timer instead of watchers
	 */
	async listen() {
		logger.info("Starting SimpleSolver in interval mode");
		logger.info(`Interval: ${this.config.interval.intervalMs}ms`);
		logger.info(`Destination networks: ${this.config.interval.destinationNetworkIds.join(", ")}`);

		// Start token price polling
		for (const tokenPriceFetcher of this.tokens.values()) {
			await tokenPriceFetcher.startPolling();
		}

		// Set up solver event handlers
		this.solver.on("dr-posted", (dr) => {
			const id = createDataRequestId(dr);
			this.dataRequestsPostRetries.delete(id);

			logger.info("Data Request posted successfully", { id });
		});

		this.solver.on("dr-result", async (result) => {
			await this.onDataResult(result);
		});

		this.solver.on("dr-error", (error, dr) => {
			const id = createDataRequestId(dr);

			if (error.type === "AlreadyExists") {
				this.solver.watchDataRequestForResult(dr);
				logger.warn("Data Request was already posted, will still watch for results", { id });
				return;
			}

			// Try the DR again
			const amountOfRetries = this.dataRequestsPostRetries.get(id) ?? 0;

			if (amountOfRetries > this.config.seda.dataRequestPostingRetries) {
				logger.error(
					`Could not recover after ${amountOfRetries} retries, will drop data request: ${error}`,
					{ id }
				);

				this.dataRequests.delete(id);
				this.dataRequestsPostRetries.delete(id);
				return;
			}

			logger.warn(
				`Failed to post data request, will try again (${amountOfRetries}/${this.config.seda.dataRequestPostingRetries}): ${error.msg}`,
				{ id }
			);

			this.dataRequestsPostRetries.set(id, amountOfRetries + 1);
			this.solver.queueDataRequest([dr]);
		});

		this.solver.on("solver-error", (error) => {
			logger.error(`Solver threw error: ${error}`);
		});

		// Start the interval timer for periodic data request posting
		logger.info("Starting interval timer for data request posting");
		this.intervalTimer = setInterval(
			() => this.postIntervalDataRequest(),
			this.config.interval.intervalMs
		);

		// Post the first data request immediately
		logger.info("Posting initial data request");
		await this.postIntervalDataRequest();

		// Start the solver
		await this.solver.listen();
	}

	/**
	 * Cleanup method to stop the interval timer
	 */
	async stop(): Promise<void> {
		if (this.intervalTimer) {
			clearInterval(this.intervalTimer);
			this.intervalTimer = null;
			logger.info("Interval timer stopped");
		}
		
		logger.info("SimpleSolver stopped");
	}
}