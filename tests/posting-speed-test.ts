#!/usr/bin/env bun

/**
 * DataRequest Posting Speed Test
 * Tests how fast we can post DataRequests without awaiting results
 */

import { SEDADataRequestBuilder, loadSEDAConfig } from '../src/core/data-request';
import { getNetworkConfig } from '../src/core/network';
import { buildDataRequestInput, buildGasOptions, postDataRequestTransaction } from '../src/core/data-request';
import { ServiceContainer } from '../src/services';
import { CosmosSequenceCoordinator } from '../src/core/scheduler';
import type { SequencedPosting } from '../src/core/scheduler';

async function testPostingSpeed() {
  console.log('🧪 Testing DataRequest Posting Speed (WITHOUT awaiting results)\n');

  try {
    // Initialize services
    const services = ServiceContainer.createProduction();
    const logger = services.loggingService;

    // Load configuration
    const sedaConfig = loadSEDAConfig();
    const networkConfig = getNetworkConfig(sedaConfig.network);
    
    console.log(`✅ Configuration loaded for ${sedaConfig.network}`);

    // Initialize SEDA builder
    const builder = new SEDADataRequestBuilder(sedaConfig, logger);
    await builder.initialize();
    console.log('✅ SEDA builder initialized');

    // Initialize sequence coordinator
    const sequenceCoordinator = new CosmosSequenceCoordinator(
      logger,
      {
        postingTimeoutMs: 15000,
        drResultTimeout: 60000, // Not used in this test
        maxQueueSize: 100
      }
    );

    const signer = (builder as any).signer;
    await sequenceCoordinator.initialize(signer);
    console.log('✅ Sequence coordinator initialized');

    // Test rapid posting
    const numberOfPosts = 5;
    const postPromises: Promise<any>[] = [];
    const startTime = Date.now();

    console.log(`\n🚀 Starting rapid posting test: ${numberOfPosts} DataRequests`);
    console.log('📊 Each post will be coordinated by sequence but NOT await oracle results\n');

    for (let i = 0; i < numberOfPosts; i++) {
      const sequencedPosting: SequencedPosting<any> = {
        taskId: `speed-test-${i}`,
        timeout: 15000,
        postTransaction: async (sequenceNumber: number) => {
          const memo = `Speed Test #${i + 1} | seq:${sequenceNumber}`;
          
          // Build posting input
          const postInput = buildDataRequestInput(networkConfig.dataRequest, { memo });
          const gasOptions = buildGasOptions(networkConfig);
          
          console.log(`📤 Posting DataRequest #${i + 1} with sequence ${sequenceNumber}`);
          
          // ONLY post the transaction - do NOT await oracle results
          const result = await postDataRequestTransaction(
            signer,
            postInput,
            gasOptions,
            networkConfig,
            logger
          );
          
          console.log(`✅ Posted #${i + 1}: ${result.drId} (${result.txHash})`);
          return result;
        }
      };

      // Queue the posting (this returns immediately)
      const postPromise = sequenceCoordinator.executeSequenced(sequencedPosting);
      postPromises.push(postPromise);
      
      console.log(`📋 Queued DataRequest #${i + 1} for posting`);
    }

    console.log(`\n⏳ Waiting for all ${numberOfPosts} posts to complete...`);
    
    // Wait for all posts to complete (but NOT oracle results)
    const results = await Promise.all(postPromises);
    
    const totalTime = Date.now() - startTime;
    const avgTimePerPost = totalTime / numberOfPosts;

    console.log('\n📈 POSTING SPEED TEST RESULTS:');
    console.log('='.repeat(50));
    console.log(`📊 Total DataRequests Posted: ${numberOfPosts}`);
    console.log(`⏱️  Total Time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`);
    console.log(`📈 Average Time per Post: ${avgTimePerPost.toFixed(0)}ms`);
    console.log(`🚀 Posts per Second: ${(1000 / avgTimePerPost).toFixed(2)}`);
    console.log('='.repeat(50));

    // Show successful vs failed posts
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`✅ Successful Posts: ${successful}`);
    console.log(`❌ Failed Posts: ${failed}`);

    if (successful > 0) {
      console.log('\n🎯 DataRequest IDs posted:');
      results.forEach((result, index) => {
        if (result.success && result.result) {
          console.log(`   ${index + 1}. ${result.result.drId}`);
        }
      });
    }

    console.log('\n💡 Note: These DataRequests are now executing in parallel on the SEDA network!');
    console.log('💡 We did NOT wait for oracle results - only posting to blockchain');

    console.log('\n✅ Posting speed test completed!');

  } catch (error) {
    console.error('❌ Posting speed test failed:', error);
    throw error;
  }
}

// Run test if executed directly
if (import.meta.main) {
  testPostingSpeed()
    .then(() => {
      console.log('\n🎉 Posting speed test completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
} 