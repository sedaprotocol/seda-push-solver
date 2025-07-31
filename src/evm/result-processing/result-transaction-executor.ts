/**
 * Result Transaction Executor
 * Executes the result posting transaction on EVM networks
 */

import { getErrorMessage } from "../../helpers/error-utils";
import type { LoggingServiceInterface } from "../../services";
import type { EvmNetworkConfig } from "../../types";
import { executeEvmTransaction } from "../../utils/transaction/evm-transaction-builder";
import { ABI_SEDA_CORE_V1 } from "../abi";
import type { DataResultEvm } from "./data-result-converter";
import { add0x } from "./data-result-converter";

/**
 * Execute the result posting transaction
 * Based on simple-solver's network.call() pattern
 */
export async function executeResultTransaction(
	network: EvmNetworkConfig,
	privateKey: string,
	sedaCoreAddress: string,
	evmResult: DataResultEvm,
	targetBatch: bigint,
	proof: string[],
	logger?: LoggingServiceInterface,
): Promise<string> {
	logger?.info(`📡 EXECUTING result posting transaction to ${network.displayName}...`);
	logger?.info(`   🎯 Target: ${sedaCoreAddress}`);
	logger?.info(`   📦 Batch: ${targetBatch}`);
	logger?.info(`   🌳 Proof elements: ${proof.length}`);

	try {
		const result = await executeEvmTransaction(network, privateKey, {
			to: sedaCoreAddress,
			abi: ABI_SEDA_CORE_V1 as unknown as any[],
			functionName: "postResult",
			args: [evmResult, targetBatch, proof.map((p) => add0x(p))],
		});

		logger?.info(`✅ Result transaction successful! Block: ${result.blockNumber}, Gas: ${result.gasUsed}, TX: ${result.txHash}`);
		return result.txHash;
	} catch (error) {
		logger?.error(`❌ Result transaction failed: ${getErrorMessage(error)}`);
		throw new Error(`Transaction execution failed: ${getErrorMessage(error)}`);
	}
}
