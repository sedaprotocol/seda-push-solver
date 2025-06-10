#!/usr/bin/env bun

/**
 * SEDA DataRequest Pusher Runner
 * Entry point for the SEDA DataRequest scheduler application
 */

import { startScheduler } from './scheduler';
import { ServiceContainer } from './services';
import { InfrastructureContainer } from './infrastructure';

async function main() {
  // Initialize service containers
  const services = ServiceContainer.createProduction();
  const infrastructure = InfrastructureContainer.createProduction(services.loggingService);

  const logger = services.loggingService;

  logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
  logger.info('│                 🚀 SEDA DataRequest Pusher                         │');
  logger.info('│                     Starting Scheduler                             │');
  logger.info('└─────────────────────────────────────────────────────────────────────┘');

  try {
    // Start scheduler with dependency injection
    const scheduler = await startScheduler(
      {}, // default config
      infrastructure.timerService,
      infrastructure.processService
    );

    logger.info('\n✅ Scheduler started successfully!');
    logger.info('📋 Use Ctrl+C to stop the scheduler gracefully');

    // Start health monitoring
    infrastructure.healthService.registerCheck('scheduler', async () => {
      const timestamp = infrastructure.timerService.now();
      return {
        status: scheduler.isSchedulerRunning() ? 'healthy' : 'unhealthy',
        responseTime: 0, // Immediate check
        timestamp,
        details: scheduler.getStats()
      };
    });

    infrastructure.healthService.startPeriodicChecks(30000); // Check every 30s

  } catch (error) {
    logger.info('\n📊 Process ending...');
    
    if (error instanceof Error && error.message.includes('Mnemonic is required')) {
      logger.error('\n┌─────────────────────────────────────────────────────────────────────┐');
      logger.error('│                      ❌ Scheduler Failed                            │');
      logger.error('└─────────────────────────────────────────────────────────────────────┘');

      // Setup instructions with logging service
      logger.info('\n💡 Setup Instructions:');
      logger.info('┌─────────────────────────────────────────────────────────────────────┐');
      logger.info('│                          📖 Setup Guide                            │');
      logger.info('├─────────────────────────────────────────────────────────────────────┤');
      logger.info('│ 1. Set SEDA_MNEMONIC environment variable                          │');
      logger.info('│ 2. Ensure account has sufficient testnet tokens                    │');
      logger.info('│ 3. Oracle Program ID is configured in src/core/network/network-config.ts │');
      logger.info('├─────────────────────────────────────────────────────────────────────┤');
      logger.info('│                     Environment Variables                          │');
      logger.info('├─────────────────────────────────────────────────────────────────────┤');
      logger.info('│ SEDA_MNEMONIC              │ Your 24-word mnemonic (required)      │');
      logger.info('│ SEDA_NETWORK               │ Network (testnet/mainnet/local)       │');
      logger.info('│ SCHEDULER_INTERVAL_SECONDS │ Interval between requests (default:60)│');
      logger.info('│ SCHEDULER_MEMO             │ Custom memo (optional)                │');
      logger.info('└─────────────────────────────────────────────────────────────────────┘');
    }
    
    logger.error(`\n❌ Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// Global error handlers using logging service
const services = ServiceContainer.createProduction();
const logger = services.loggingService;

process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main().catch(error => {
  logger.error('❌ Application failed:', error);
  process.exit(1);
}); 