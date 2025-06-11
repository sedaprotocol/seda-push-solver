#!/usr/bin/env bun

/**
 * Improved Parallel Architecture Test
 * Tests the new architecture where posting is coordinated but result waiting is parallel
 */

import { SEDADataRequestScheduler } from '../src/scheduler';
import { ServiceContainer } from '../src/services';

async function testImprovedParallel() {
  console.log('🧪 Testing Improved Parallel Architecture\n');
  console.log('🎯 Posting coordinated, result waiting parallel\n');

  try {
    // Initialize services
    const services = ServiceContainer.createProduction();
    const logger = services.loggingService;

    // Create scheduler with short intervals to see rapid posting
    const scheduler = new SEDADataRequestScheduler(
      {
        intervalMs: 8000, // 8 seconds
        continuous: true,
        maxRetries: 2,
        memo: 'Improved Parallel Test'
      },
      logger
    );

    console.log('✅ Scheduler created');

    // Initialize scheduler
    await scheduler.initialize();
    console.log('✅ Scheduler initialized\n');

    console.log('🚀 Starting improved parallel scheduler...');
    console.log('📊 Watch for rapid posting with parallel result waiting!\n');
    
    // Start the scheduler
    scheduler.start();

    // Run for 45 seconds to see multiple rapid posts
    setTimeout(() => {
      console.log('\n🛑 Stopping test...');
      scheduler.stop();
      
      const finalStats = scheduler.getStats();
      console.log('\n📈 Test Results:');
      console.log(`   📊 Total DataRequests Posted: ${finalStats.totalRequests}`);
      console.log(`   ✅ Successful: ${finalStats.successfulRequests}`);
      console.log(`   ❌ Failed: ${finalStats.failedRequests}`);
      console.log(`   🔄 Active Tasks: ${finalStats.activeTasks || 0}`);
      console.log(`   🔢 Queue Size: ${finalStats.sequenceCoordinator?.queueSize || 0}`);
      
      console.log('\n✅ Improved parallel architecture test completed!');
      console.log('🎯 You should see faster posting with parallel result processing');
      
      process.exit(0);
    }, 45000); // 45 seconds

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log('\n🔔 Test interrupted. Stopping...');
      scheduler.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Improved parallel test failed:', error);
    process.exit(1);
  }
}

// Run the test
testImprovedParallel().catch(console.error); 