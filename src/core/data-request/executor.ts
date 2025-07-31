/**
 * DataRequest Executor
 * Handles the execution and result processing of DataRequests on the SEDA network
 */

import { type Signer, awaitDataResult, postDataRequest } from "@seda-protocol/dev-tools";
import type { GasOptions, PostDataRequestInput, QueryConfig } from "@seda-protocol/dev-tools";
import { getEnabledEvmNetworks } from "../../config/evm";
import { EvmOrchestrator } from "../../evm/orchestrator";
import { getErrorMessage } from "../../helpers/error-utils";
import { SedaBatchService } from "../../seda/batch-service";
import type { LoggingServiceInterface } from "../../services";
import type { DataRequestResult, NetworkConfig } from "../../types";
import { HexUtils } from "../../utils/hex";

/**
 * Post a DataRequest transaction to the SEDA network (just posting, no waiting)
 * This is the phase that should be coordinated by sequence to prevent conflicts
 */
export async function postDataRequestTransaction(
	signer: Signer,
	postInput: PostDataRequestInput,
	gasOptions: GasOptions,
	networkConfig: NetworkConfig,
	logger: LoggingServiceInterface,
): Promise<{ drId: string; blockHeight: bigint; txHash: string }> {
	// Clean, structured configuration display
	logger.info("┌─────────────────────────────────────────────────────────────────────┐");
	logger.info("│                        📤 Posting DataRequest                       │");
	logger.info("├─────────────────────────────────────────────────────────────────────┤");
	logger.info(`│ Oracle Program ID: ${postInput.execProgramId}`);
	logger.info(`│ Replication Factor: ${postInput.replicationFactor || 0}`);
	logger.info(`│ Gas Limit: ${postInput.execGasLimit?.toLocaleString() || "N/A"}`);
	logger.info(`│ Gas Price: ${(postInput.gasPrice || 0).toString()}`);
	logger.info("└─────────────────────────────────────────────────────────────────────┘");

	logger.info("🚀 Posting DataRequest transaction to SEDA network...");

	// Post the DataRequest transaction (this waits for inclusion in block)
	const postResult = await postDataRequest(signer, postInput, gasOptions);

	// Log successful posting
	logger.info(`✅ DataRequest posted successfully!`);
	logger.info(`   📋 Request ID: ${postResult.dr.id}`);
	logger.info(`   📦 Block Height: ${postResult.dr.height}`);
	logger.info(`   🔗 Transaction: ${postResult.tx}`);

	return {
		drId: postResult.dr.id,
		blockHeight: postResult.dr.height,
		txHash: postResult.tx,
	};
}

/**
 * Wait for a DataRequest to be executed and return results
 * This phase happens in parallel and doesn't need sequence coordination
 */
export async function awaitDataRequestResult(
	queryConfig: QueryConfig,
	drId: string,
	blockHeight: bigint,
	awaitOptions: { timeoutSeconds: number; pollingIntervalSeconds: number; maxBatchRetries: number; batchPollingIntervalMs: number },
	networkConfig: NetworkConfig,
	logger: LoggingServiceInterface,
	performanceTracker?: any,
	taskId?: string,
): Promise<DataRequestResult> {
	logger.info(`⏳ Waiting for DataRequest ${drId} to complete...`);
	logger.info(`   📦 Block Height: ${blockHeight}`);
	logger.info(`   ⏱️ Timeout: ${awaitOptions.timeoutSeconds}s`);
	logger.info(`   🔄 Polling: every ${awaitOptions.pollingIntervalSeconds}s`);

	// Create DataRequest object for awaiting
	const dataRequest = { id: drId, height: blockHeight };

	// Start timing oracle result phase
	if (performanceTracker && taskId) {
		performanceTracker.startStep(taskId, "awaitingOracleResult");
	}

	// Wait for DataRequest execution to complete
	const rawResult = await awaitDataResult(queryConfig, dataRequest, {
		timeoutSeconds: awaitOptions.timeoutSeconds,
		pollingIntervalSeconds: awaitOptions.pollingIntervalSeconds,
	});

	// Oracle result received - END timing for oracle phase
	if (performanceTracker && taskId) {
		performanceTracker.endStep(taskId, "awaitingOracleResult");
		logger.info(`⏱️  Oracle result retrieved - now proceeding to fetch signatures`);
		logger.info(`📊 ═══════════ ORACLE PHASE COMPLETE ═══════════`);
	}

	// Clean, structured results display
	logger.info("✅ DataRequest completed");
	logger.info(`   📋 Request ID: ${rawResult.drId}`);
	logger.info(`   📊 Exit Code: ${rawResult.exitCode} | Gas: ${rawResult.gasUsed} | Block: ${rawResult.drBlockHeight}`);

	// Handle result data display
	if (rawResult.result) {
		logger.info(`   📦 Result: ${rawResult.result}`);

		// Show hex validation if it looks like hex
		if (typeof rawResult.result === "string" && /^(0x)?[0-9a-fA-F]+$/.test(rawResult.result)) {
			if (HexUtils.validate(rawResult.result)) {
				logger.info(`   🔢 Valid hex format`);
			}
		}
	} else {
		logger.info(`   📦 Result: No data`);
	}

	if (networkConfig.explorerEndpoint) {
		logger.info(`   🔗 Explorer: ${networkConfig.explorerEndpoint}/data-requests/${rawResult.drId}/${rawResult.drBlockHeight}`);
	}

	// Fetch batch assignment and batch information from SEDA chain
	logger.info("🔍 Fetching batch assignment and batch information from SEDA chain...");

	try {
		// NOW start timing signatures phase - only AFTER oracle result is complete
		if (performanceTracker && taskId) {
			performanceTracker.startStep(taskId, "awaitingSignatures");
			logger.info(`⏱️  Starting signature retrieval timing...`);
		}

		const batchService = new SedaBatchService(queryConfig, logger);
		const batch = await batchService.fetchBatch(drId, blockHeight, awaitOptions.maxBatchRetries, awaitOptions.batchPollingIntervalMs);

		// Signatures received - END timing for signatures phase
		if (performanceTracker && taskId) {
			performanceTracker.endStep(taskId, "awaitingSignatures");
			logger.info(`⏱️  Signatures retrieved - signature timing complete`);
		}

		if (batch) {
			// Log the batch information
			logger.info("📦 Batch assignment completed");
			logger.info(`   🔢 Batch: ${batch.batchNumber} | Block: ${batch.blockHeight}`);
			logger.info(`   📊 Entries: ${batch.dataResultEntries?.length || 0} | Signatures: ${batch.batchSignatures?.length || 0} | Validators: ${batch.validatorEntries?.length || 0}`);

			// Start timing EVM processing phase (batch + result posting)
			if (performanceTracker && taskId) {
				performanceTracker.startStep(taskId, "postingBatch");
			}

			// Handle EVM batch posting and result posting using the SHARED orchestrator
			// This ensures all DataRequest results use the same nonce coordinator to prevent conflicts
			const evmOrchestrator = EvmOrchestrator.getSharedInstance(logger, getEnabledEvmNetworks());
			const evmBatchResults = await evmOrchestrator.processBatch(batch, {
				drId: rawResult.drId,
				exitCode: rawResult.exitCode,
				result: rawResult.result,
				drBlockHeight: rawResult.drBlockHeight,
				gasUsed: rawResult.gasUsed,
				paybackAddress: rawResult.paybackAddress,
				sedaPayload: rawResult.sedaPayload,
				version: rawResult.version,
				blockTimestamp: BigInt(rawResult.blockTimestamp instanceof Date ? rawResult.blockTimestamp.getTime() : Number(rawResult.blockTimestamp)),
			});

			// EVM processing complete, end timing
			if (performanceTracker && taskId) {
				performanceTracker.endStep(taskId, "postingBatch");
			}

			// Log detailed results for each network
			if (evmBatchResults.length > 0) {
				logger.info("🌐 EVM Processing Results:");
				for (const networkResult of evmBatchResults) {
					// Batch status
					const batchStatus = networkResult.batchExists ? "✅ EXISTS" : "❌ MISSING";
					const lastHeight = networkResult.lastBatchHeight !== null ? networkResult.lastBatchHeight.toString() : "N/A";
					const batchPostInfo = networkResult.posted !== undefined ? (networkResult.posted ? " | 🚀 POSTED" : " | ⚠️ POST FAILED") : "";
					const batchTxInfo = networkResult.txHash ? ` | TX: ${networkResult.txHash}` : "";
					const batchErrorInfo = networkResult.error ? ` | Error: ${networkResult.error}` : "";

					logger.info(`   📦 ${networkResult.networkName} Batch: ${batchStatus} | Height: ${lastHeight}${batchPostInfo}${batchTxInfo}${batchErrorInfo}`);

					// Result status (if attempted)
					if (networkResult.resultPosted !== undefined) {
						const resultStatus = networkResult.resultPosted ? "✅ POSTED" : "❌ FAILED";
						const resultTxInfo = networkResult.resultTxHash ? ` | TX: ${networkResult.resultTxHash}` : "";
						const resultIdInfo = networkResult.resultId ? ` | ID: ${networkResult.resultId}` : "";
						const resultErrorInfo = networkResult.resultError ? ` | Error: ${networkResult.resultError}` : "";

						logger.info(`   📋 ${networkResult.networkName} Result: ${resultStatus}${resultTxInfo}${resultIdInfo}${resultErrorInfo}`);
					}
				}
			}
		}
	} catch (error) {
		// If batch fetching failed, end the signatures timing with error
		if (performanceTracker && taskId) {
			performanceTracker.failStep(taskId, "awaitingSignatures", getErrorMessage(error));
			logger.warn(`⏱️  Signature retrieval failed - timing ended with error`);
		}
		logger.warn(`⚠️ Could not fetch batch information: ${getErrorMessage(error)}`);
	}

	return {
		drId: rawResult.drId,
		exitCode: rawResult.exitCode,
		result: rawResult.result,
		drBlockHeight: rawResult.drBlockHeight,
		gasUsed: rawResult.gasUsed,
		paybackAddress: rawResult.paybackAddress,
		sedaPayload: rawResult.sedaPayload,
		version: rawResult.version,
		blockTimestamp: BigInt(rawResult.blockTimestamp instanceof Date ? rawResult.blockTimestamp.getTime() : Number(rawResult.blockTimestamp)),
	};
}

// Legacy executeDataRequest function removed
// Use postDataRequestTransaction and awaitDataRequestResult separately for better control
