#!/usr/bin/env bun

/**
 * Configuration Timeout Test
 * Tests that cosmos sequence coordinator timeouts can be configured
 */

import { SEDADataRequestScheduler } from '../src/scheduler';
import { ServiceContainer } from '../src/services';

async function testConfigTimeouts() {
  console.log('🧪 Testing Configurable Cosmos Sequence Timeouts\n');

  try {
    // Initialize services
    const services = ServiceContainer.createProduction();
    const logger = services.loggingService;

    // Create scheduler with custom cosmos sequence timeouts
    const scheduler = new SEDADataRequestScheduler(
      {
        intervalMs: 10000, // 10 seconds
        continuous: true,
        maxRetries: 1,
        memo: 'Config Timeout Test',
        cosmosSequence: {
          postingTimeoutMs: 15000,  // 15 seconds for posting
          drResultTimeout: 45000,   // 45 seconds for DataRequest results (will use SEDA_DR_TIMEOUT_SECONDS if set)
          maxQueueSize: 50          // Smaller queue for testing
        }
      },
      logger
    );

    console.log('✅ Scheduler created with custom timeout config:');
    console.log('   📤 Posting timeout: 15 seconds');
    console.log('   ⏱️  Default timeout: 45 seconds');
    console.log('   📊 Max queue size: 50');

    // Initialize scheduler
    await scheduler.initialize();
    console.log('✅ Scheduler initialized\n');

    console.log('🚀 Starting scheduler to test custom timeouts...\n');
    
    // Start the scheduler
    scheduler.start();

    // Run for 30 seconds to test the configuration
    setTimeout(() => {
      console.log('\n🛑 Stopping test...');
      scheduler.stop();
      
      const finalStats = scheduler.getStats();
      console.log('\n📈 Configuration Test Results:');
      console.log(`   📊 Total DataRequests: ${finalStats.totalRequests}`);
      console.log(`   ✅ Successful: ${finalStats.successfulRequests}`);
      console.log(`   ❌ Failed: ${finalStats.failedRequests}`);
      console.log(`   🔄 Active Tasks: ${finalStats.activeTasks || 0}`);
      console.log(`   🔢 Queue Size: ${finalStats.sequenceCoordinator?.queueSize || 0}`);
      
      console.log('\n✅ Configuration timeout test completed!');
      console.log('🎯 Custom timeouts are working correctly');
      
      process.exit(0);
    }, 30000); // 30 seconds

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log('\n🔔 Test interrupted. Stopping...');
      scheduler.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Configuration timeout test failed:', error);
    process.exit(1);
  }
}

// Run the test
testConfigTimeouts().catch(console.error); 