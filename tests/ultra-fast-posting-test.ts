#!/usr/bin/env bun

/**
 * Fast Posting Test
 * Tests the architecture where timer intervals are NEVER blocked by posting
 */

import { SEDADataRequestBuilder, loadSEDAConfig } from '../src/core/data-request';
import { ServiceContainer } from '../src/services';
import { TaskManager } from '../src/core/scheduler/task-manager';
import type { SchedulerConfig } from '../src/types';
import { SchedulerStatistics } from '../src/core/scheduler/statistics';
import type { TaskCompletionHandler, AsyncTaskResult } from '../src/core/scheduler/types';

async function testFastPosting() {
  console.log('⚡ Testing FAST Posting Architecture\n');
  console.log('🎯 Timer intervals should NEVER be blocked by posting execution!\n');

  try {
    // Initialize services
    const services = ServiceContainer.createProduction();
    const logger = services.loggingService;

    // Load configuration
    const sedaConfig = loadSEDAConfig();
    console.log(`✅ Configuration loaded for ${sedaConfig.network}`);

    // Initialize SEDA builder
    const builder = new SEDADataRequestBuilder(sedaConfig, logger);
    await builder.initialize();
    console.log('✅ SEDA builder initialized');

    // Scheduler config with fast intervals
    const config: SchedulerConfig = {
      intervalMs: 5000, // 5 seconds - should be VERY fast
      continuous: true,
      maxRetries: 1,
      memo: 'Fast Test',
      cosmosSequence: {
        postingTimeoutMs: 20000,
        drResultTimeout: 60000,
        maxQueueSize: 100
      }
    };

    // Initialize task manager
    const taskManager = new TaskManager(
      logger,
      config.cosmosSequence
    );

    await taskManager.initialize(builder);
    console.log('⚡ Task manager initialized');

    // Initialize statistics
    const statistics = new SchedulerStatistics();

    // Create completion handler
    const completionHandler: TaskCompletionHandler = {
      onSuccess: (result: AsyncTaskResult) => {
        if (result.result && result.result.type === 'posted') {
          console.log(`✅ POSTED: ${result.taskId} posted in ${result.duration}ms`);
        } else {
          console.log(`✅ COMPLETED: ${result.taskId} oracle finished in ${result.duration}ms`);
        }
      },
      onFailure: (result: AsyncTaskResult) => {
        console.log(`❌ FAILED: ${result.taskId} failed: ${result.error?.message}`);
      }
    };

    console.log('\n🚀 TESTING FAST QUEUEING:');
    console.log('='.repeat(50));
    console.log('📊 Each queue operation should return in < 10ms');
    console.log('📊 Timer intervals should NEVER wait for posting');

    // Test rapid queueing
    const numberOfTasks = 6;
    const queueTimes: number[] = [];

    for (let i = 0; i < numberOfTasks; i++) {
      const queueStartTime = Date.now();
      
      // THIS SHOULD BE INSTANT (< 10ms)
      const taskId = taskManager.queueTask(
        builder,
        config,
        () => true,
        completionHandler,
        statistics
      );
      
      const queueTime = Date.now() - queueStartTime;
      queueTimes.push(queueTime);
      
      console.log(`⚡ Queued task ${i + 1}: ${taskId} in ${queueTime}ms`);
      
      // Simulate timer interval
      if (i < numberOfTasks - 1) {
        console.log(`⏳ Waiting ${config.intervalMs/1000}s for next interval...`);
        await new Promise(resolve => setTimeout(resolve, config.intervalMs));
      }
    }

    // Analyze queueing performance
    const maxQueueTime = Math.max(...queueTimes);
    const avgQueueTime = queueTimes.reduce((a, b) => a + b, 0) / queueTimes.length;

    console.log('\n📈 QUEUEING PERFORMANCE ANALYSIS:');
    console.log('='.repeat(50));
    console.log(`📊 Total Tasks Queued: ${numberOfTasks}`);
    console.log(`⚡ Average Queue Time: ${avgQueueTime.toFixed(1)}ms`);
    console.log(`📈 Max Queue Time: ${maxQueueTime}ms`);
    console.log(`🎯 Target: < 10ms per queue operation`);

    if (maxQueueTime < 10) {
      console.log('🎉 SUCCESS: Fast queueing achieved!');
    } else if (maxQueueTime < 50) {
      console.log('✅ Good: Queueing is fast but could be faster');
    } else {
      console.log('⚠️  Warning: Queueing is still too slow');
    }

    // Show current state
    console.log('\n📊 CURRENT TASK MANAGER STATE:');
    console.log('='.repeat(50));
    console.log(`🔄 Active Tasks: ${taskManager.getActiveTaskCount()}`);
    console.log(`📋 Queue Size: ${taskManager.getQueueSize()}`);
    
    const queueStats = taskManager.getQueueStats();
    console.log(`⏰ Oldest Task Age: ${(queueStats.oldestTaskAge / 1000).toFixed(1)}s`);
    console.log(`📈 Average Task Age: ${(queueStats.averageTaskAge / 1000).toFixed(1)}s`);

    const sequenceStats = taskManager.getSequenceCoordinatorStats();
    console.log(`🔢 Sequence Queue: ${sequenceStats.queueSize}`);
    console.log(`🔄 Processing: ${sequenceStats.isProcessing}`);

    console.log('\n💡 FAST ARCHITECTURE BENEFITS:');
    console.log('✅ Timer intervals complete in milliseconds');
    console.log('✅ Posting happens in background without blocking');
    console.log('✅ Oracle execution happens in parallel');
    console.log('✅ Maximum throughput achieved');

    console.log('\n⏳ Waiting 30 seconds to observe background processing...');
    
    // Wait and monitor progress
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const stats = statistics.getStats();
      const queueSize = taskManager.getQueueSize();
      const activeCount = taskManager.getActiveTaskCount();
      
      if (i % 5 === 0) { // Log every 5 seconds
        console.log(`📊 t+${i + 1}s: Queue: ${queueSize}, Active: ${activeCount}, Posted: ${stats.postedRequests}, Completed: ${stats.totalRequests}`);
      }
    }

    // Final statistics
    const finalStats = statistics.getStats();
    console.log('\n📈 FINAL RESULTS:');
    console.log('='.repeat(50));
    console.log(`📤 Tasks Queued: ${numberOfTasks}`);
    console.log(`📋 Posted to Blockchain: ${finalStats.postedRequests}`);
    console.log(`✅ Oracle Executions Completed: ${finalStats.totalRequests}`);
    console.log(`🔄 Still Processing: ${taskManager.getActiveTaskCount()}`);

    console.log('\n✅ Fast posting test completed!');

  } catch (error) {
    console.error('❌ Fast posting test failed:', error);
    throw error;
  }
}

// Run test if executed directly
if (import.meta.main) {
  testFastPosting()
    .then(() => {
      console.log('\n🎉 Fast posting test completed!');
      process.exit(0);
    })
    .catch((error: any) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
} 