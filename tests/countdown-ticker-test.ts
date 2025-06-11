#!/usr/bin/env bun

/**
 * Countdown Ticker Test
 * Tests the integrated countdown ticker functionality in the main scheduler
 */

import { SEDADataRequestScheduler } from '../src/scheduler';
import { ServiceContainer } from '../src/services';

async function testCountdownTicker() {
  console.log('🧪 Testing Integrated Countdown Ticker\n');

  try {
    // Initialize services
    const services = ServiceContainer.createProduction();
    const logger = services.loggingService;

    // Create scheduler with 15-second intervals
    const scheduler = new SEDADataRequestScheduler(
      {
        intervalMs: 15000, // 15 seconds
        continuous: true,
        maxRetries: 2,
        memo: 'Countdown Ticker Test'
      },
      logger
    );

    console.log('✅ Scheduler created with countdown ticker');

    // Initialize scheduler
    await scheduler.initialize();
    console.log('✅ Scheduler initialized\n');

    console.log('🚀 Starting scheduler with integrated countdown ticker...\n');
    
    // Start the scheduler (this will show countdown logs)
    scheduler.start();
    
    console.log('⏰ Watch the countdown logs appear every second!\n');

    // Run for 45 seconds to see multiple countdowns and posts
    setTimeout(() => {
      console.log('\n🛑 Stopping test...');
      scheduler.stop();
      
      const finalStats = scheduler.getStats();
      console.log('\n📈 Test Results:');
      console.log(`   📊 Total DataRequests Posted: ${finalStats.totalRequests}`);
      console.log(`   🔄 Active Tasks: ${finalStats.activeTasks || 0}`);
      
      console.log('\n✅ Countdown ticker test completed!');
      console.log('🎯 You should have seen countdown logs every second');
      
      process.exit(0);
    }, 45000); // 45 seconds

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log('\n🔔 Test interrupted. Stopping...');
      scheduler.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Countdown ticker test failed:', error);
    process.exit(1);
  }
}

// Run the test
testCountdownTicker().catch(console.error); 