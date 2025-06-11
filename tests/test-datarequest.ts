#!/usr/bin/env bun

/**
 * Test script for posting a single DataRequest to SEDA network
 */

import { loadSEDAConfig, SEDADataRequestBuilder } from '../src';

async function testDataRequest() {
  console.log('🧪 Testing SEDA DataRequest Posting\n');

  try {
    // Load configuration
    const config = loadSEDAConfig();
    console.log('✅ Configuration loaded successfully');
    console.log(`🌐 Network: ${config.network}`);
    console.log(`🔗 RPC: ${config.rpcEndpoint}`);

    // Create builder
    const builder = new SEDADataRequestBuilder(config);
    console.log('✅ DataRequest builder created');

    // Initialize builder
    await builder.initialize();
    console.log('✅ Builder initialized successfully');

    // Post DataRequest
    console.log('\n📤 Posting DataRequest...');
    
    const startTime = Date.now();
    const result = await builder.postDataRequest({
      memo: 'Test DataRequest from automated test'
    });
    const duration = Date.now() - startTime;

    console.log('\n🎉 DataRequest completed successfully!');
    console.log('📊 Results:');
    console.log(`   DR ID: ${result.drId}`);
    console.log(`   Exit Code: ${result.exitCode}`);
    console.log(`   Block Height: ${result.blockHeight}`);
    console.log(`   Gas Used: ${result.gasUsed}`);
    console.log(`   Result: ${result.result || 'No result data'}`);
    console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);

    return {
      success: true,
      drId: result.drId,
      exitCode: result.exitCode,
      gasUsed: result.gasUsed,
      duration,
      result: result.result
    };

  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Run the test
testDataRequest().then(result => {
  if (result.success) {
    console.log('\n✅ DataRequest test completed successfully');
    process.exit(0);
  } else {
    console.log('\n❌ DataRequest test failed');
    process.exit(1);
  }
}).catch(error => {
  console.error('💥 Test script failed:', error);
  process.exit(1);
}); 