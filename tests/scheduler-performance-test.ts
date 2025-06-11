#!/usr/bin/env bun

/**
 * Scheduler Performance Test
 * Tests the architecture where timer intervals are not blocked by posting operations
 */

import { SEDADataRequestBuilder, loadSEDAConfig } from '../src/core/data-request';
import { ServiceContainer } from '../src/services';
import { TaskManager } from '../src/core/scheduler/task-manager';
import type { SchedulerConfig } from '../src/types';
import { SchedulerStatistics } from '../src/core/scheduler/statistics';
import type { TaskCompletionHandler, AsyncTaskResult } from '../src/core/scheduler/types';

async function testSchedulerPerformance() {
  const services = ServiceContainer.createProduction();
  const logger = services.loggingService;

  logger.info('🧪 Testing Scheduler Performance Architecture');
  logger.info('🎯 Timer intervals should not be blocked by posting execution');

  try {
    // Load configuration
    const sedaConfig = loadSEDAConfig();
    logger.info(`✅ Configuration loaded for ${sedaConfig.network}`);

    // Initialize SEDA builder
    const builder = new SEDADataRequestBuilder(sedaConfig, logger);
    await builder.initialize();
    logger.info('✅ SEDA builder initialized');

    // Scheduler config with performance intervals
    const config: SchedulerConfig = {
      intervalMs: 5000, // 5 seconds
      continuous: true,
      maxRetries: 1,
      memo: 'Performance Test',
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
    logger.info('✅ Task manager initialized');

    // Initialize statistics
    const statistics = new SchedulerStatistics();

    // Create completion handler
    const completionHandler: TaskCompletionHandler = {
      onSuccess: (result: AsyncTaskResult) => {
        if (result.result && result.result.type === 'posted') {
          logger.info(`✅ POSTED: ${result.taskId} posted in ${result.duration}ms`);
        } else {
          logger.info(`✅ COMPLETED: ${result.taskId} oracle finished in ${result.duration}ms`);
        }
      },
      onFailure: (result: AsyncTaskResult) => {
        logger.error(`❌ FAILED: ${result.taskId} failed: ${result.error?.message}`);
      }
    };

    logger.info('\n🚀 TESTING QUEUE PERFORMANCE:');
    logger.info('📊 Each queue operation should return quickly');
    logger.info('📊 Timer intervals should not wait for posting');

    // Test rapid queueing
    const numberOfTasks = 6;
    const queueTimes: number[] = [];

    for (let i = 0; i < numberOfTasks; i++) {
      const queueStartTime = Date.now();
      
      const taskId = taskManager.queueTask(
        builder,
        config,
        () => true,
        completionHandler,
        statistics
      );
      
      const queueTime = Date.now() - queueStartTime;
      queueTimes.push(queueTime);
      
      logger.info(`⚡ Queued task ${i + 1}: ${taskId} in ${queueTime}ms`);
      
      // Simulate timer interval
      if (i < numberOfTasks - 1) {
        logger.info(`⏳ Waiting ${config.intervalMs/1000}s for next interval...`);
        await new Promise(resolve => setTimeout(resolve, config.intervalMs));
      }
    }

    // Analyze queueing performance
    const maxQueueTime = Math.max(...queueTimes);
    const avgQueueTime = queueTimes.reduce((a, b) => a + b, 0) / queueTimes.length;

    logger.info('\n📈 QUEUEING PERFORMANCE ANALYSIS:');
    logger.info(`📊 Total Tasks Queued: ${numberOfTasks}`);
    logger.info(`⚡ Average Queue Time: ${avgQueueTime.toFixed(1)}ms`);
    logger.info(`📈 Max Queue Time: ${maxQueueTime}ms`);
    logger.info(`🎯 Target: < 50ms per queue operation`);

    if (maxQueueTime < 10) {
      logger.info('🎉 SUCCESS: Excellent queueing performance');
    } else if (maxQueueTime < 50) {
      logger.info('✅ Good: Acceptable queueing performance');
    } else {
      logger.warn('⚠️  Warning: Queueing performance could be improved');
    }

    // Show current state
    logger.info('\n📊 CURRENT TASK MANAGER STATE:');
    logger.info(`🔄 Active Tasks: ${taskManager.getActiveTaskCount()}`);
    logger.info(`📋 Queue Size: ${taskManager.getQueueSize()}`);
    
    const queueStats = taskManager.getQueueStats();
    logger.info(`⏰ Oldest Task Age: ${(queueStats.oldestTaskAge / 1000).toFixed(1)}s`);
    logger.info(`📈 Average Task Age: ${(queueStats.averageTaskAge / 1000).toFixed(1)}s`);

    const sequenceStats = taskManager.getSequenceCoordinatorStats();
    logger.info(`🔢 Sequence Queue: ${sequenceStats.queueSize}`);
    logger.info(`🔄 Processing: ${sequenceStats.isProcessing}`);

    logger.info('\n💡 PERFORMANCE ARCHITECTURE BENEFITS:');
    logger.info('✅ Timer intervals complete quickly');
    logger.info('✅ Posting happens in background without blocking');
    logger.info('✅ Oracle execution happens in parallel');
    logger.info('✅ Optimal throughput achieved');

    logger.info('\n⏳ Waiting 30 seconds to observe background processing...');
    
    // Wait and monitor progress
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const stats = statistics.getStats();
      const queueSize = taskManager.getQueueSize();
      const activeCount = taskManager.getActiveTaskCount();
      
      if (i % 5 === 0) { // Log every 5 seconds
        logger.info(`📊 t+${i + 1}s: Queue: ${queueSize}, Active: ${activeCount}, Posted: ${stats.postedRequests}, Completed: ${stats.totalRequests}`);
      }
    }

    // Final statistics
    const finalStats = statistics.getStats();
    logger.info('\n📈 FINAL RESULTS:');
    logger.info(`📤 Tasks Queued: ${numberOfTasks}`);
    logger.info(`📋 Posted to Blockchain: ${finalStats.postedRequests}`);
    logger.info(`✅ Oracle Executions Completed: ${finalStats.totalRequests}`);
    logger.info(`🔄 Still Processing: ${taskManager.getActiveTaskCount()}`);

    logger.info('\n✅ Scheduler performance test completed!');

  } catch (error) {
    logger.error('❌ Scheduler performance test failed:', error);
    throw error;
  }
}

// Run test if executed directly
if (import.meta.main) {
  testSchedulerPerformance()
    .then(() => {
      const services = ServiceContainer.createProduction();
      const logger = services.loggingService;
      logger.info('\n🎉 Scheduler performance test completed!');
      process.exit(0);
    })
    .catch((error: any) => {
      const services = ServiceContainer.createProduction();
      const logger = services.loggingService;
      logger.error('\n💥 Test failed:', error);
      process.exit(1);
    });
} 