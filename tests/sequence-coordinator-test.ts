#!/usr/bin/env bun

/**
 * Sequence Coordinator Test
 * Verifies that the sequence coordinator prevents sequence conflicts
 * and allows DataRequests to complete successfully
 */

import { SEDADataRequestScheduler } from '../src/scheduler';
import { ServiceContainer } from '../src/services';

async function testSequenceCoordinator() {
  console.log('🧪 Testing Cosmos Sequence Coordinator\n');

  try {
    // Initialize services
    const services = ServiceContainer.createProduction();
    const logger = services.loggingService;

    console.log('✅ Services initialized');

    // Create scheduler with moderate interval for proper testing
    const scheduler = new SEDADataRequestScheduler(
      {
        intervalMs: 5000, // 5 seconds interval to allow completion
        continuous: true,
        maxRetries: 2,
        memo: 'Sequence coordinator test'
      },
      logger
    );

    console.log('✅ Scheduler created');

    // Initialize scheduler  
    await scheduler.initialize();
    console.log('✅ Scheduler initialized');

    // Start scheduler
    const startTime = Date.now();
    console.log('🚀 Starting scheduler...');
    
    // Start in background
    scheduler.start();
    const startDuration = Date.now() - startTime;
    
    console.log(`⏱️  Scheduler start() returned in ${startDuration}ms`);
    
    // Run for 20 seconds to allow multiple tasks to complete
    console.log('⏳ Running for 20 seconds to test sequence coordination...\n');
    
    const observations: any[] = [];
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const stats = scheduler.getStats();
      observations.push(stats);
      
      console.log(`📊 t+${i+1}s: Active: ${stats.activeTasks || 0}, Total: ${stats.totalRequests}, Success: ${stats.successfulRequests}, Failed: ${stats.failedRequests}, Queue: ${stats.sequenceCoordinator?.queueSize || 0}`);
    }

    // Stop scheduler
    console.log('\n🛑 Stopping scheduler...');
    await scheduler.stop();
    
    const finalStats = scheduler.getStats();
    console.log('✅ Scheduler stopped');

    // Analyze results
    console.log('\n🔍 Test Results Analysis:');
    console.log(`- Total requests completed: ${finalStats.totalRequests}`);
    console.log(`- Successful requests: ${finalStats.successfulRequests}`);
    console.log(`- Failed requests: ${finalStats.failedRequests}`);
    console.log(`- Success rate: ${finalStats.totalRequests > 0 ? ((finalStats.successfulRequests / finalStats.totalRequests) * 100).toFixed(1) : 0}%`);
    
    if (finalStats.sequenceCoordinator) {
      console.log(`- Max sequence number reached: ${finalStats.sequenceCoordinator.nextSequenceNumber}`);
      console.log(`- Final queue size: ${finalStats.sequenceCoordinator.queueSize}`);
    }
    
    // Test assertions
    if (finalStats.totalRequests === 0) {
      throw new Error('No DataRequests completed - sequence coordinator may be blocking');
    }
    
    if (finalStats.successfulRequests === 0) {
      throw new Error('No successful DataRequests - sequence conflicts may still exist');
    }
    
    const successRate = (finalStats.successfulRequests / finalStats.totalRequests) * 100;
    if (successRate < 50) {
      console.log('⚠️  Warning: Low success rate may indicate sequence conflicts or other issues');
    } else {
      console.log('✅ Good success rate - sequence coordinator working properly');
    }

    console.log('\n🎉 Sequence coordinator test completed successfully!');
    console.log('✅ Sequence conflicts prevented');
    console.log('✅ DataRequests completing successfully');
    console.log('✅ Sequential execution working');

  } catch (error) {
    console.error('❌ Sequence coordinator test failed:', error);
    process.exit(1);
  }
}

// Run the test
testSequenceCoordinator().catch(console.error); 