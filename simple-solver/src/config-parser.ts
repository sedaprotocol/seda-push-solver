import { tryParseSync } from "@seda-protocol/utils";
import Big from "big.js";
import { Maybe, Result } from "true-myth";
import * as v from "valibot";
import {
	DEFAULT_BATCH_QUEUE_PROCESSING_INTERVAL,
	DEFAULT_DATA_REQUEST_POST_RETRIES,
	DEFAULT_DATA_REQUEST_WATCHER_PAGE_LIMIT,
	DEFAULT_DR_QUEUE_PROCESSING_INTERVAL,
	DEFAULT_INTERVAL_MS,
	DEFAULT_MINIMUM_FEE_TO_POST_RESULT,
	DEFAULT_MINIMUM_PROFIT_PERCENTAGE_TO_POST_REQUEST,
	DEFAULT_NETWORK_CURRENT_BATCH_POLLING_INTERVAL,
	DEFAULT_NETWORK_POLLING_INTERVAL,
	DEFAULT_NETWORK_TRANSACTION_RETRIES,
	DEFAULT_PAUSED_CHECK_INTERVAL,
	DEFAULT_TOKEN_POLLING_INTERVAL,
	DEFAULT_TOKEN_PRICE_FETCH_RETRIES,
} from "./constants";

export const NetworkSchema = v.object({
	id: v.string(),
	rpc: v.union([v.string(), v.array(v.string())]),
});

export const EvmNetworkSchema = v.object({
	...NetworkSchema.entries,
	chainId: v.number(),
	privateKeyEnvVar: v.string(),
	pollingIntervalMs: v.optional(v.number(), DEFAULT_NETWORK_POLLING_INTERVAL),
	type: v.literal("evm"),
	feeClaimThreshold: v.pipe(
		v.string(),
		v.transform((fee) => BigInt(fee)),
	),
});

export const WatchersSchema = v.object({
	networkId: v.string(),
	contractAddress: v.string(),
});

export const BaseDataRequestWatcherSchema = v.object({
	...WatchersSchema.entries,
	maxTransactionRetries: v.optional(
		v.number(),
		DEFAULT_NETWORK_TRANSACTION_RETRIES,
	),
	queueProcessingIntervalMs: v.optional(
		v.number(),
		DEFAULT_DR_QUEUE_PROCESSING_INTERVAL,
	),
	pollingIntervalMs: v.number(),
	pageLimit: v.optional(v.number(), DEFAULT_DATA_REQUEST_WATCHER_PAGE_LIMIT),
	minimumFeeToPostResult: v.pipe(
		v.optional(v.string(), DEFAULT_MINIMUM_FEE_TO_POST_RESULT),
		v.transform((fee) => new Big(fee)),
	),
	minimumProfitPercentageToPostRequest: v.optional(
		v.number(),
		DEFAULT_MINIMUM_PROFIT_PERCENTAGE_TO_POST_REQUEST,
	),
	token: v.optional(v.string()),
});

export const DataRequestWatcherSchema = v.object({
	...BaseDataRequestWatcherSchema.entries,
	gasLimit: v.optional(v.string()),
	gasPrice: v.optional(v.string()),
	type: v.literal("data-requests"),
});

export const PermissionedDataRequestWatcherSchema = v.object({
	...BaseDataRequestWatcherSchema.entries,
	type: v.literal("permissioned-data-requests"),
});

export const BatchesWatcherSchema = v.object({
	...WatchersSchema.entries,
	targetBatchGap: v.optional(v.number(), 0),
	pollingIntervalMs: v.optional(
		v.number(),
		DEFAULT_NETWORK_CURRENT_BATCH_POLLING_INTERVAL,
	),
	queueProcessingIntervalMs: v.optional(
		v.number(),
		DEFAULT_BATCH_QUEUE_PROCESSING_INTERVAL,
	),
	pausedCheckIntervalMs: v.optional(v.number(), DEFAULT_PAUSED_CHECK_INTERVAL),
	maxTransactionRetries: v.optional(
		v.number(),
		DEFAULT_NETWORK_TRANSACTION_RETRIES,
	),
	gasLimit: v.optional(v.string()),
	gasPrice: v.optional(v.string()),
	signatureScheme: v.literal("secp256k1"),
	type: v.literal("batches"),
});

export const TokensSchema = v.object({
	token: v.string(),
	url: v.string(),
	headers: v.optional(v.map(v.string(), v.string())),
	jsonPath: v.pipe(v.string(), v.startsWith("$")),
	pollingIntervalMs: v.optional(v.number(), DEFAULT_TOKEN_POLLING_INTERVAL),
	maxPriceFetchRetries: v.optional(
		v.number(),
		DEFAULT_TOKEN_PRICE_FETCH_RETRIES,
	),
	decimals: v.number(),
});


export const IntervalDataRequestSchema = v.object({
	// Exact field names from DataRequest interface
	version: v.string(),
	execProgramId: v.string(), // hex string (will be used as-is in DataRequest)
	execInputs: v.optional(v.string(), ""), // hex string (will be converted to Buffer)
	tallyProgramId: v.string(), // hex string (will be used as-is in DataRequest)
	tallyInputs: v.optional(v.string(), ""), // hex string (will be converted to Buffer)
	replicationFactor: v.number(),
	consensusFilter: v.optional(v.string(), ""), // hex string (will be converted to Buffer)
	gasPrice: v.pipe(v.string(), v.transform((price) => BigInt(price))),
	execGasLimit: v.pipe(v.string(), v.transform((gas) => BigInt(gas))),
	tallyGasLimit: v.pipe(v.string(), v.transform((gas) => BigInt(gas))),
	memo: v.optional(v.string(), ""), // hex string (will be converted to Buffer)
	paybackAddress: v.string(), // hex string (will be converted to Buffer)
	fees: v.object({
		requestFee: v.pipe(v.string(), v.transform((fee) => BigInt(fee))),
		resultFee: v.pipe(v.string(), v.transform((fee) => BigInt(fee))),
		batchFee: v.pipe(v.string(), v.transform((fee) => BigInt(fee))),
	}),
});

// NEW: Schema for interval-based operation configuration
export const IntervalConfigSchema = v.object({
	// How often to post the data request to SEDA (milliseconds)
	intervalMs: v.optional(v.number(), DEFAULT_INTERVAL_MS),
	// List of network IDs where results should be pushed (1-to-many)
	destinationNetworkIds: v.array(v.string()),
	// The data request configuration to post periodically
	dataRequest: IntervalDataRequestSchema,
	// Profitability settings (moved from individual watchers to global)
	minimumProfitPercentageToPostRequest: v.optional(
		v.number(),
		DEFAULT_MINIMUM_PROFIT_PERCENTAGE_TO_POST_REQUEST,
	),
	minimumFeeToPostResult: v.pipe(
		v.optional(v.string(), DEFAULT_MINIMUM_FEE_TO_POST_RESULT),
		v.transform((fee) => new Big(fee)),
	),
	token: v.optional(v.string()), // token symbol for fee calculations
	// Transaction settings for result posting
	maxTransactionRetries: v.optional(
		v.number(),
		DEFAULT_NETWORK_TRANSACTION_RETRIES,
	),
});


export const ConfigSchema = v.object({
	seda: v.object({
		rpc: v.string(),
		mnemonic: v.optional(v.string()),
		minimumBalance: v.pipe(
			v.optional(v.string()),
			v.transform((amount) => (amount ? BigInt(amount) : undefined)),
		),
		coreContractAddress: v.optional(v.string()),
		batchPollingIntervalMs: v.optional(v.number()),
		dataResultPollingIntervalMs: v.optional(v.number()),
		startingBatch: v.optional(v.union([v.string(), v.number(), v.bigint()])),
		dataRequestPostingRetries: v.optional(
			v.number(),
			() => DEFAULT_DATA_REQUEST_POST_RETRIES,
		),
	}),
	tokens: v.array(TokensSchema),
	networks: v.array(EvmNetworkSchema),
	interval: IntervalConfigSchema,
});

export type WatcherConfig = v.InferOutput<typeof WatchersSchema>;

export interface DataRequestWatcherConfig
	extends v.InferOutput<typeof DataRequestWatcherSchema> {
	id: string;
}

export interface BaseDataRequestWatcherConfig
	extends v.InferOutput<typeof BaseDataRequestWatcherSchema> {
	id: string;
}

export interface BatchesWatcherConfig
	extends v.InferOutput<typeof BatchesWatcherSchema> {
	id: string;
}

export interface PermissionedDataRequestWatcherConfig
	extends v.InferOutput<typeof PermissionedDataRequestWatcherSchema> {
	id: string;
}

export interface EvmNetworkConfig
	extends v.InferOutput<typeof EvmNetworkSchema> {
	privateKey: string;
}

export interface IntervalConfig extends v.InferOutput<typeof IntervalConfigSchema> {}
export interface IntervalDataRequestConfig extends v.InferOutput<typeof IntervalDataRequestSchema> {}

export interface Config extends v.InferOutput<typeof ConfigSchema> {
	networks: EvmNetworkConfig[];
	interval: IntervalConfig;
}

export type TokenConfig = v.InferOutput<typeof TokensSchema>;

export function parseConfig(input: unknown): Result<Config, string[]> {
	const config = tryParseSync(ConfigSchema, input, {
		abortEarly: false,
	});

	if (config.isErr) {
		const messages = config.error.map((error) => {
			const path = error.path?.map((p) => p.key).join(".") || "";
			const issues = error.issues?.map((issue) => issue.message) ?? [];
			return `Failed to parse config: ${error.message} at $.${path} ${issues.map((issue) => `\n${issue}`)}`;
		});

		return Result.err(messages);
	}

	if (config.value.networks.length === 0) {
		return Result.err([
			"Atleast one network should be configured in 'networks'",
		]);
	}

	const availableNetworkIds = config.value.networks.map((n) => n.id);
	const mergedWatchers: (
		| DataRequestWatcherConfig
		| PermissionedDataRequestWatcherConfig
		| BatchesWatcherConfig
	)[] = [];
	const errors: string[] = [];

	for (const networkId of config.value.interval.destinationNetworkIds) {
		if (!availableNetworkIds.includes(networkId)) {
			errors.push(
				`Unknown networkId "${networkId}" in interval.destinationNetworkIds. Configured networks: (${availableNetworkIds.join(" | ")})`,
			);
		}
	}

	if (config.value.interval.destinationNetworkIds.length === 0) {
		errors.push(
			"At least one destination network must be specified in interval.destinationNetworkIds",
		);
	}


	const mergedNetworks: EvmNetworkConfig[] = [];

	// Check if all environment variables are available
	for (const [index, network] of config.value.networks.entries()) {
		const privateKey = Maybe.of(process.env[network.privateKeyEnvVar]);

		if (privateKey.isNothing) {
			errors.push(
				`Expected ${network.privateKeyEnvVar} to be available in environment at $.networks.${index}.privateKeyEnvVar`,
			);
			continue;
		}

		mergedNetworks.push({
			...network,
			privateKey: privateKey.value,
		});
	}

	// Validate token configuration for interval
	if (config.value.interval.token) {
		const tokenExists = config.value.tokens.some(
			(t) => t.token === config.value.interval.token,
		);
		if (!tokenExists) {
			errors.push(
				`Unknown token "${config.value.interval.token}" in interval.token. Token must be configured in the tokens section.`,
			);
		}

		if (
			config.value.interval.minimumProfitPercentageToPostRequest.toString().includes(".")
		) {
			errors.push(
				`Invalid minimumProfitPercentageToPostRequest "${config.value.interval.minimumProfitPercentageToPostRequest}" in interval config. Only whole percentages are supported.`,
			);
		}
	}


	// We always need the token seda, otherwise we cannot determine the price between the native token and SEDA
	if (config.value.tokens.length > 0) {
		const hasSedaToken = config.value.tokens.some(
			(token) => token.token === "seda",
		);

		if (!hasSedaToken) {
			errors.push('Token "seda" is required when configuring tokens');
		}
	}

	if (errors.length) {
		return Result.err(errors);
	}

	return Result.ok({
		...config.value,
		networks: mergedNetworks,
		watchers: mergedWatchers,
	});
}
