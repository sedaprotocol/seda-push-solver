#!/usr/bin/env bun

/**
 * Parallel SEDA DataRequest Scheduler Demo
 * 
 * Demonstrates DataRequests firing every 15 seconds in parallel
 * with a countdown ticker showing when the next DataRequest will be posted
 */

import { SEDADataRequestScheduler } from '../src/scheduler';
import { ServiceContainer } from '../src/services';

async function runParallelSchedulerDemo() {
  console.log('🚀 SEDA Parallel DataRequest Scheduler Demo');
  console.log('📅 Posting DataRequests every 15 seconds in parallel\n');

  try {
    // Initialize services
    const services = ServiceContainer.createProduction();
    const logger = services.loggingService;

    // Create scheduler with 15-second intervals
    const scheduler = new SEDADataRequestScheduler(
      {
        intervalMs: 15000, // 15 seconds
        continuous: true,  // Run continuously
        maxRetries: 2,
        memo: 'Parallel Demo DataRequest'
      },
      logger
    );

    console.log('✅ Scheduler created with 15-second intervals');

    // Initialize scheduler
    await scheduler.initialize();
    console.log('✅ Scheduler initialized\n');

    // Start the scheduler (non-blocking)
    console.log('🚀 Starting parallel scheduler...\n');
    scheduler.start();

    // Countdown ticker - logs time until next post
    let nextPostTime = Date.now() + 15000; // Next post in 15 seconds (first one fired immediately)
    let postCount = 1; // First post already happened

    const tickerInterval = setInterval(() => {
      const now = Date.now();
      const secondsLeft = Math.max(0, Math.ceil((nextPostTime - now) / 1000));
      
      if (secondsLeft === 0) {
        // Next post is happening now
        postCount++;
        nextPostTime = now + 15000; // Schedule next post in 15 seconds
        console.log(`⚡ DataRequest #${postCount} POSTED! Next post in 15 seconds...`);
      } else {
        // Show countdown to next post
        const stats = scheduler.getStats();
        console.log(`⏰ Next DataRequest post in: ${secondsLeft} seconds | Active tasks: ${stats.activeTasks || 0} | Total posted: ${stats.totalRequests}`);
      }
    }, 1000); // Update every second

    // Run for 90 seconds to show multiple posts
    setTimeout(() => {
      clearInterval(tickerInterval);
      console.log('\n🛑 Stopping demo...');
      scheduler.stop();
      
      const finalStats = scheduler.getStats();
      console.log('\n📈 Final Statistics:');
      console.log(`   📊 Total DataRequests Posted: ${finalStats.totalRequests}`);
      console.log(`   ✅ Completed Successfully: ${finalStats.successfulRequests}`);
      console.log(`   ❌ Failed: ${finalStats.failedRequests}`);
      console.log(`   🔄 Still Active: ${finalStats.activeTasks || 0}`);
      
      console.log('\n🎉 Demo completed! DataRequests posted every 15 seconds in parallel.');
      process.exit(0);
    }, 90000); // 90 seconds

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      clearInterval(tickerInterval);
      console.log('\n🔔 Stopping demo...');
      scheduler.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

// Run the demo
runParallelSchedulerDemo().catch(console.error); 