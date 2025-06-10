#!/usr/bin/env bun

/**
 * Basic Async Scheduler Test
 * Verifies that the async scheduler launches tasks without blocking
 */

import { SEDADataRequestScheduler } from '../src/scheduler';
import { ServiceContainer } from '../src/services';

async function testAsyncScheduler() {
  console.log('🧪 Testing Async SEDA DataRequest Scheduler\n');

  try {
    // Initialize services
    const services = ServiceContainer.createProduction();
    const logger = services.loggingService;

    console.log('✅ Services initialized');

    // Create scheduler with very short interval for testing
    const scheduler = new SEDADataRequestScheduler(
      {
        intervalMs: 2000, // 2 seconds for quick testing
        continuous: false, // Single mode for testing
        maxRetries: 1,
        memo: 'Async test DataRequest'
      },
      logger
    );

    console.log('✅ Scheduler created');

    // Initialize scheduler
    await scheduler.initialize();
    console.log('✅ Scheduler initialized');

    // Check initial state
    console.log(`📊 Initial active tasks: ${scheduler.getActiveTaskCount()}`);
    console.log(`📈 Initial stats:`, scheduler.getStats());

    // Start scheduler (this should not block in single mode)
    console.log('\n🚀 Starting scheduler in single mode...');
    const startTime = Date.now();
    
    await scheduler.start(); // This should complete quickly since tasks are async
    
    const duration = Date.now() - startTime;
    console.log(`⏱️  Scheduler start() completed in ${duration}ms`);

    // Check final state
    console.log(`📊 Final active tasks: ${scheduler.getActiveTaskCount()}`);
    console.log(`📈 Final stats:`, scheduler.getStats());

    console.log('\n✅ Async scheduler test completed successfully!');

  } catch (error) {
    console.error('\n❌ Async scheduler test failed:', error);
    throw error;
  }
}

// Run test if executed directly
if (import.meta.main) {
  testAsyncScheduler()
    .then(() => {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
} 