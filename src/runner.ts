#!/usr/bin/env bun

/**
 * SEDA DataRequest Pusher Runner
 * Entry point for the SEDA DataRequest scheduler application
 */

import { getErrorMessage } from "./helpers/error-utils";
import { InfrastructureContainer } from "./infrastructure";
import { startScheduler } from "./scheduler";
import { ServiceContainer } from "./services";

async function main() {
	// Initialize service containers
	const services = ServiceContainer.createProduction();
	const infrastructure = InfrastructureContainer.createProduction(services.loggingService);

	const logger = services.loggingService;

	logger.info("\n┌─────────────────────────────────────────────────────────────────────┐");
	logger.info("│                 🚀 SEDA DataRequest Pusher                         │");
	logger.info("│                     Starting Scheduler                             │");
	logger.info("└─────────────────────────────────────────────────────────────────────┘");

	try {
		// Start scheduler with dependency injection
		const scheduler = await startScheduler(
			{}, // default config
			infrastructure.timerService,
			infrastructure.processService,
		);

		logger.info("\n✅ Scheduler started successfully!");
		logger.info("📋 Use Ctrl+C to stop the scheduler gracefully");

		// Start health monitoring
		infrastructure.healthService.registerCheck("scheduler", async () => {
			const timestamp = infrastructure.timerService.now();
			return {
				status: scheduler.isSchedulerRunning() ? "healthy" : "unhealthy",
				responseTime: 0, // Immediate check
				timestamp,
				details: scheduler.getStats(),
			};
		});

		infrastructure.healthService.startPeriodicChecks(30000); // Check every 30s

		// Enhanced shutdown handler to ensure complete cleanup
		infrastructure.processService.onShutdown(async () => {
			logger.info("\n🔔 Received shutdown signal, starting graceful shutdown...");

			try {
				// Stop scheduler first
				logger.info("🛑 Stopping scheduler...");
				await scheduler.shutdown();

				// Shutdown infrastructure services
				logger.info("🛑 Shutting down infrastructure services...");
				await infrastructure.shutdown();

				logger.info("✅ Graceful shutdown completed successfully");
			} catch (error) {
				logger.error("❌ Error during shutdown:", getErrorMessage(error));
			}
		});

		// Start signal handling
		infrastructure.processService.startSignalHandling();
	} catch (error) {
		logger.info("\n📊 Process ending...");

		if (error instanceof Error && error.message.includes("Mnemonic is required")) {
			logger.error("\n┌─────────────────────────────────────────────────────────────────────┐");
			logger.error("│                      ❌ Scheduler Failed                            │");
			logger.error("└─────────────────────────────────────────────────────────────────────┘");

			// Setup instructions with logging service
			logger.info("\n💡 Setup Instructions:");
			logger.info("┌─────────────────────────────────────────────────────────────────────┐");
			logger.info("│                          📖 Setup Guide                            │");
			logger.info("├─────────────────────────────────────────────────────────────────────┤");
			logger.info("│ 1. Set SEDA_MNEMONIC environment variable                          │");
			logger.info("│ 2. Set SEDA_ORACLE_PROGRAM_ID environment variable                 │");
			logger.info("│ 3. Ensure account has sufficient testnet tokens                    │");
			logger.info("├─────────────────────────────────────────────────────────────────────┤");
			logger.info("│                     Environment Variables                          │");
			logger.info("├─────────────────────────────────────────────────────────────────────┤");
			logger.info("│ SEDA_MNEMONIC                     │ Your 24-word mnemonic (required) │");
			logger.info("│ SEDA_ORACLE_PROGRAM_ID            │ Oracle Program ID (required)     │");
			logger.info("│ SEDA_NETWORK                      │ Network (testnet/mainnet/local)  │");
			logger.info("│ SCHEDULER_INTERVAL_MS             │ Interval between requests (ms)   │");
			logger.info("│ SCHEDULER_MEMO                    │ Custom memo (optional)           │");
			logger.info("│ SEDA_DR_TIMEOUT_SECONDS           │ DataRequest exec timeout (sec)   │");
			logger.info("│ COSMOS_POSTING_TIMEOUT_MS         │ Transaction posting timeout (ms) │");
			logger.info("├─────────────────────────────────────────────────────────────────────┤");
			logger.info("│ 💡 Copy env.example to .env and configure your settings           │");
			logger.info("└─────────────────────────────────────────────────────────────────────┘");
		}

		logger.error(`\n❌ Error: ${getErrorMessage(error)}`);

		// Ensure infrastructure cleanup even on startup failure
		try {
			await infrastructure.shutdown();
		} catch (shutdownError) {
			logger.error("❌ Failed to shutdown infrastructure:", getErrorMessage(shutdownError));
		}

		process.exit(1);
	}
}

// Global error handlers using logging service
const services = ServiceContainer.createProduction();
const logger = services.loggingService;

process.on("uncaughtException", (error: Error) => {
	logger.error("💥 Uncaught Exception:", error);
	process.exit(1);
});

process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
	logger.error("💥 Unhandled Rejection at:", promise, "reason:", reason instanceof Error ? reason : String(reason));
	process.exit(1);
});

// Start the application
main().catch((error) => {
	logger.error("❌ Application failed:", error);
	process.exit(1);
});
