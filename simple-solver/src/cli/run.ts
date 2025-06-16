import { readFile } from "node:fs/promises";
import { Command } from "@commander-js/extra-typings";
import { Solver } from "@seda-protocol/solver-sdk";
import { tryAsync, trySync } from "@seda-protocol/utils";
import { parseConfig } from "../config-parser";
import { startHttpServer } from "../http-server";
import logger from "../logger";
import { SimpleSolver } from "../simple-solver";

export const runCommand = new Command("run")
	.description("Run the Solver node")
	.option("-c, --config <string>", "Path to config.json", "./config.json")
	.action(async (options) => {
		logger.info("Running Solver..");

		const configFile = await tryAsync(readFile(options.config));
		if (configFile.isErr) {
			logger.error(
				`Failed to read config at ${options.config}: ${configFile.error}`,
			);
			process.exit(1);
		}

		const parsedConfig = trySync(() => JSON.parse(configFile.value.toString()));

		if (parsedConfig.isErr) {
			logger.error(`Parsing config failed: ${parsedConfig.error}`);
			process.exit(1);
		}

		const config = parseConfig(parsedConfig.value);
		if (config.isErr) {
			for (const err of config.error) {
				logger.error(err);
			}

			process.exit(1);
		}

		const solver = await Solver.fromConfig({
			mnemonic: config.value.seda.mnemonic ?? process.env.MNEMONIC ?? "",
			rpc: config.value.seda.rpc ?? process.env.RPC ?? "",
			minimumBalance: config.value.seda.minimumBalance,
			batchPollingIntervalMs: config.value.seda.batchPollingIntervalMs,
			dataResultPollingIntervalMs:
				config.value.seda.dataResultPollingIntervalMs,
			coreContractAddress: config.value.seda.coreContractAddress,
			startingBatch: config.value.seda.startingBatch
				? BigInt(config.value.seda.startingBatch)
				: undefined,
		});

		const simpleSolver = new SimpleSolver(solver, config.value);
		logger.info(`Using SEDA address ${solver.sedaAddress}`);

		await simpleSolver.listen();
		startHttpServer();
	});
