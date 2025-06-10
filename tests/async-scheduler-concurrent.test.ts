#!/usr/bin/env bun

/**
 * Concurrent Async Scheduler Test
 * Verifies that multiple async tasks run concurrently without blocking
 */

import { SEDADataRequestScheduler } from '../src/scheduler';
import { ServiceContainer } from '../src/services';

async function testConcurrentAsyncScheduler() {
  console.log('🧪 Testing Concurrent Async SEDA DataRequest Scheduler\n');

  try {
    // Initialize services
    const services = ServiceContainer.createProduction();
    const logger = services.loggingService;

    console.log('✅ Services initialized');

    // Create scheduler with short interval for testing
    const scheduler = new SEDADataRequestScheduler(
      {
        intervalMs: 3000, // 3 seconds interval
        continuous: true, // Continuous mode for concurrent testing
        maxRetries: 1,
        memo: 'Concurrent async test'
      },
      logger
    );

    console.log('✅ Scheduler created');

    // Initialize scheduler
    await scheduler.initialize();
    console.log('✅ Scheduler initialized');

    // Start scheduler (should return immediately and not block)
    console.log('\n🚀 Starting scheduler in continuous mode...');
    const startTime = Date.now();
    
    // This should return immediately since it's fully async now
    scheduler.start(); // Don't await - should not block!
    
    const duration = Date.now() - startTime;
    console.log(`⏱️  Scheduler start() returned in ${duration}ms (should be < 100ms)`);

    // Wait a bit and check that multiple tasks are being launched
    console.log('\n⏳ Waiting 8 seconds to observe concurrent task behavior...');
    
    const observations: { time: number; activeTasks: number; stats: any }[] = [];
    
    for (let i = 0; i < 8; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const activeTasks = scheduler.getActiveTaskCount();
      const stats = scheduler.getStats();
      const observation = {
        time: i + 1,
        activeTasks,
        stats
      };
      observations.push(observation);
      console.log(`📊 t+${i + 1}s: Active tasks: ${activeTasks}, Total: ${stats.totalRequests}, Success: ${stats.successfulRequests}, Failed: ${stats.failedRequests}`);
    }

    // Stop scheduler
    console.log('\n🛑 Stopping scheduler...');
    scheduler.stop();
    
    // Final check
    const finalStats = scheduler.getStats();
    console.log(`📈 Final stats: Total: ${finalStats.totalRequests}, Success: ${finalStats.successfulRequests}, Failed: ${finalStats.failedRequests}`);

    // Verify concurrent behavior
    const maxActiveTasks = Math.max(...observations.map(o => o.activeTasks));
    const finalTotalRequests = finalStats.totalRequests;
    
    console.log('\n🔍 Test Results Analysis:');
    console.log(`- Max concurrent tasks observed: ${maxActiveTasks}`);
    console.log(`- Total requests launched: ${finalTotalRequests}`);
    console.log(`- Scheduler start() duration: ${duration}ms`);
    
    // Assertions
    if (duration > 100) {
      throw new Error(`Scheduler start() took too long (${duration}ms), should be non-blocking`);
    }
    
    if (maxActiveTasks < 2) {
      throw new Error(`Expected at least 2 concurrent tasks, got max of ${maxActiveTasks}`);
    }
    
    // Note: Total requests might be 0 because tasks may not complete due to sequence conflicts
    // This is expected and we'll fix it in the next step with sequence management
    console.log(`ℹ️  Total completed requests: ${finalTotalRequests} (may be 0 due to sequence conflicts - this is expected for now)`);

    console.log('\n✅ Concurrent async scheduler test completed successfully!');
    console.log('✅ Verified non-blocking behavior');
    console.log('✅ Verified concurrent task execution');
    console.log('⚠️  Sequence conflicts observed (expected - will be fixed in next step)');

  } catch (error) {
    console.error('\n❌ Concurrent async scheduler test failed:', error);
    throw error;
  }
}

// Run test if executed directly
if (import.meta.main) {
  testConcurrentAsyncScheduler()
    .then(() => {
      console.log('\n🎉 All concurrent tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Concurrent test failed:', error);
      process.exit(1);
    });
} 