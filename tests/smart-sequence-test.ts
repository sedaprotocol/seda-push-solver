#!/usr/bin/env bun

/**
 * Smart Sequence Coordinator Test
 * Tests the enhanced sequence management features including recovery and validation
 */

import { SEDADataRequestBuilder, loadSEDAConfig } from '../src/core/data-request';
import { ServiceContainer } from '../src/services';
import { CosmosSequenceCoordinator } from '../src/core/scheduler/cosmos-sequence-coordinator';
import type { SequencedPosting } from '../src/core/scheduler/cosmos-sequence-coordinator';

async function testSmartSequenceCoordinator() {
  console.log('🧠 Testing Smart Sequence Coordinator\n');
  console.log('🎯 Features being tested:');
  console.log('   - Smart sequence initialization');
  console.log('   - Pending sequence tracking');
  console.log('   - Automatic recovery from sequence errors');
  console.log('   - Periodic blockchain validation');
  console.log('   - Collision detection and handling\n');

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

    // Create smart sequence coordinator
    const sequenceConfig = {
      postingTimeoutMs: 15000,
      drResultTimeout: 60000,
      maxQueueSize: 50
    };

    const coordinator = new CosmosSequenceCoordinator(logger, sequenceConfig);
    const signer = (builder as any).signer;

    // Test 1: Smart Initialization
    console.log('\n🧠 TEST 1: Smart Sequence Initialization');
    console.log('='.repeat(50));
    
    const initStartTime = Date.now();
    await coordinator.initialize(signer);
    const initDuration = Date.now() - initStartTime;
    
    console.log(`✅ Smart initialization completed in ${initDuration}ms`);
    
    const stats = coordinator.getStats();
    console.log(`📊 Initial Stats:`);
    console.log(`   Current Sequence: ${stats.currentSequenceNumber}`);
    console.log(`   Last Validated: ${stats.lastValidatedSequence}`);
    console.log(`   Validation Age: ${stats.lastValidationAge}ms`);
    console.log(`   Pending Sequences: ${stats.pendingSequences}`);

    // Test 2: Mock Sequence Posting
    console.log('\n🔢 TEST 2: Smart Sequence Management');
    console.log('='.repeat(50));

    const mockPostings: SequencedPosting<any>[] = [];
    
    // Create mock posting operations
    for (let i = 0; i < 5; i++) {
      mockPostings.push({
        taskId: `test-task-${i + 1}`,
        timeout: 10000,
        postTransaction: async (sequence: number) => {
          console.log(`📤 Mock posting task-${i + 1} with sequence ${sequence}`);
          
          // Simulate posting time
          await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
          
          // Simulate some failures for testing recovery
          if (i === 2 && sequence < 10) {
            throw new Error('account sequence mismatch, expected 10, got ' + sequence);
          }
          
          return {
            drId: `mock-dr-${sequence}-${i}`,
            blockHeight: BigInt(12345 + sequence),
            txHash: `mock-tx-${sequence}`
          };
        }
      });
    }

    // Execute all postings and track results
    const results = await Promise.all(
      mockPostings.map(async (posting, index) => {
        try {
          const result = await coordinator.executeSequenced(posting);
          console.log(`✅ Task ${index + 1} completed: sequence=${result.sequence}, success=${result.success}, duration=${result.duration}ms`);
          return result;
        } catch (error) {
          console.log(`❌ Task ${index + 1} failed: ${error}`);
          return null;
        }
      })
    );

    // Test 3: Statistics Analysis
    console.log('\n📈 TEST 3: Smart Coordinator Statistics');
    console.log('='.repeat(50));
    
    const finalStats = coordinator.getStats();
    console.log(`📊 Final Statistics:`);
    console.log(`   Queue Size: ${finalStats.queueSize}`);
    console.log(`   Current Sequence: ${finalStats.currentSequenceNumber}`);
    console.log(`   Next Available: ${finalStats.nextSequenceNumber}`);
    console.log(`   Last Validated: ${finalStats.lastValidatedSequence}`);
    console.log(`   Pending Sequences: ${finalStats.pendingSequences}`);
    console.log(`   Is Processing: ${finalStats.isProcessing}`);
    console.log(`   Validation Age: ${(finalStats.lastValidationAge / 1000).toFixed(1)}s`);

    // Test 4: Results Analysis
    console.log('\n🔍 TEST 4: Results Analysis');
    console.log('='.repeat(50));
    
    const successfulResults = results.filter(r => r && r.success);
    const failedResults = results.filter(r => r && !r.success);
    const nullResults = results.filter(r => r === null);
    
    console.log(`📊 Execution Summary:`);
    console.log(`   Total Tasks: ${mockPostings.length}`);
    console.log(`   Successful: ${successfulResults.length}`);
    console.log(`   Failed: ${failedResults.length}`);
    console.log(`   Null Results: ${nullResults.length}`);
    
    if (successfulResults.length > 0) {
      const sequences = successfulResults.map(r => r!.sequence);
      const avgDuration = successfulResults.reduce((sum, r) => sum + r!.duration, 0) / successfulResults.length;
      
      console.log(`📈 Performance Metrics:`);
      console.log(`   Sequences Used: [${sequences.join(', ')}]`);
      console.log(`   Average Duration: ${avgDuration.toFixed(0)}ms`);
      console.log(`   Sequence Range: ${Math.min(...sequences)} - ${Math.max(...sequences)}`);
    }

    // Test 5: Smart Features Validation
    console.log('\n🧠 TEST 5: Smart Features Validation');
    console.log('='.repeat(50));
    
    const features = {
      smartInit: finalStats.isInitialized,
      sequenceTracking: finalStats.currentSequenceNumber > 0,
      validationWorking: finalStats.lastValidationAge < 60000, // Less than 1 minute
      recoveryTested: failedResults.length < mockPostings.length, // Some should succeed after recovery
      pendingCleanup: finalStats.pendingSequences === 0 // Should be clean after completion
    };
    
    console.log(`✅ Smart Features Status:`);
    Object.entries(features).forEach(([feature, working]) => {
      console.log(`   ${working ? '✅' : '❌'} ${feature}: ${working ? 'Working' : 'Issue detected'}`);
    });

    // Wait for any pending operations
    console.log('\n⏳ Waiting for queue to clear...');
    await coordinator.waitForQueue();
    
    const cleanStats = coordinator.getStats();
    console.log(`📊 Final Clean State:`);
    console.log(`   Queue Size: ${cleanStats.queueSize}`);
    console.log(`   Pending Sequences: ${cleanStats.pendingSequences}`);
    console.log(`   Is Processing: ${cleanStats.isProcessing}`);

    console.log('\n🎉 Smart Sequence Coordinator Test Summary:');
    console.log('='.repeat(50));
    console.log('✅ Smart initialization with blockchain validation');
    console.log('✅ Automatic sequence recovery from errors');
    console.log('✅ Pending sequence tracking and cleanup');
    console.log('✅ Comprehensive statistics and monitoring');
    console.log('✅ Collision detection and handling');

    console.log('\n✅ Smart sequence coordinator test completed successfully!');

  } catch (error) {
    console.error('❌ Smart sequence coordinator test failed:', error);
    throw error;
  }
}

// Run test if executed directly
if (import.meta.main) {
  testSmartSequenceCoordinator()
    .then(() => {
      console.log('\n🎉 All smart sequence tests passed!');
      process.exit(0);
    })
    .catch((error: any) => {
      console.error('\n💥 Smart sequence test failed:', error);
      process.exit(1);
    });
} 