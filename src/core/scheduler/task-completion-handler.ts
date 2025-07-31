/**
 * Task Completion Handler for SEDA DataRequest Scheduler
 * Handles the logging and statistics tracking for completed async tasks
 */

import type { TimerServiceInterface } from "../../infrastructure";
import type { LoggingServiceInterface } from "../../services";
import type { SchedulerConfig } from "../../types";
import type { SchedulerStatistics } from "./statistics";
import type { AsyncTaskResult, TaskCompletionHandler } from "./types";

/**
 * Implementation of task completion handling
 */
export class SchedulerTaskCompletionHandler implements TaskCompletionHandler {
	constructor(
		private logger: LoggingServiceInterface,
		private statistics: SchedulerStatistics,
		private config: SchedulerConfig,
		private isRunning: () => boolean,
		private getActiveTaskCount: () => number,
		private timerService?: TimerServiceInterface,
	) {}

	/**
	 * Handle successful task completion
	 */
	onSuccess(result: AsyncTaskResult): void {
		this.logger.info(`\n┌─────────────────────────────────────────────────────────────────────┐`);
		this.logger.info(`│                    ✅ Task ${result.taskId} Successful                    │`);
		this.logger.info(`├─────────────────────────────────────────────────────────────────────┤`);

		if (result.drId) {
			this.logger.info(`│ Request ID: ${result.drId}`);
		}
		if (result.result?.exitCode !== undefined) {
			this.logger.info(`│ Exit Code: ${result.result.exitCode === 0 ? "Success (0)" : result.result.exitCode}`);
		}
		if (result.blockHeight) {
			this.logger.info(`│ Block Height: ${result.blockHeight}`);
		}
		if (result.result?.gasUsed) {
			this.logger.info(`│ Gas Used: ${result.result.gasUsed}`);
		}
		if (result.sequenceNumber) {
			this.logger.info(`│ Sequence Number: ${result.sequenceNumber}`);
		}

		this.logger.info(`│ Duration: ${(result.duration / 1000).toFixed(1)}s`);

		// Add explorer link
		if (result.drId && result.blockHeight) {
			const explorerUrl = this.getExplorerUrl(result.drId, result.blockHeight);
			this.logger.info(`├─────────────────────────────────────────────────────────────────────┤`);
			this.logger.info(`│ 🔗 Explorer: ${explorerUrl}`);
		}

		this.logger.info(`└─────────────────────────────────────────────────────────────────────┘`);

		// Only increment success counter for oracle completions, not for posting successes
		if (result.result && result.result.type === "oracle_completed") {
			this.statistics.recordSuccess();
		}
		// Note: Posted counter is handled in task-manager based on result type

		this.logCurrentStatus();
	}

	/**
	 * Get explorer URL for a DataRequest
	 */
	private getExplorerUrl(drId: string, blockHeight: number): string {
		// Determine network based on RPC endpoint or use testnet as default
		const isTestnet = true; // For now, assuming testnet - could be made configurable
		const baseUrl = isTestnet ? "https://testnet.explorer.seda.xyz/data-requests" : "https://explorer.seda.xyz/data-requests";

		return `${baseUrl}/${drId}/${blockHeight}`;
	}

	/**
	 * Handle failed task completion
	 */
	onFailure(result: AsyncTaskResult): void {
		this.logger.info("\n┌─────────────────────────────────────────────────────────────────────┐");
		this.logger.info(`│                     💥 Task ${result.taskId} Failed                       │`);
		this.logger.info("├─────────────────────────────────────────────────────────────────────┤");
		this.logger.info(`│ Task ID: ${result.taskId}`);

		if (result.drId) {
			this.logger.info(`│ Data Request ID: ${result.drId}`);
		}
		if (result.blockHeight) {
			this.logger.info(`│ Block Height: ${result.blockHeight}`);
		}

		this.logger.info(`│ Error: ${result.error?.message || "Unknown error"}`);
		this.logger.info(`│ Duration: ${(result.duration / 1000).toFixed(1)}s`);
		this.logger.info("└─────────────────────────────────────────────────────────────────────┘");

		// Only count oracle failures (when result has drId), not posting failures
		if (result.drId) {
			this.statistics.recordFailure();
		}

		this.logCurrentStatus();
	}

	/**
	 * Log current scheduler status
	 */
	private logCurrentStatus(): void {
		this.logger.info(`📊 Active async tasks: ${this.getActiveTaskCount()}`);

		if (this.config.continuous && this.isRunning()) {
			const nextRequest = new Date((this.timerService?.now() || Date.now()) + this.config.intervalMs);
			this.logger.info(`⏭️  Next task scheduled: ${nextRequest.toLocaleTimeString()}`);
		}
	}
}
