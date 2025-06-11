#!/usr/bin/env bun

/**
 * Test script for posting multiple DataRequests to SEDA network
 */

import { loadSEDAConfig, SEDADataRequestBuilder } from '../src';

async function testMultipleDataRequests() {
  console.log('🧪 Testing Multiple SEDA DataRequests\n');

  try {
    // Load configuration
    const config = loadSEDAConfig();
    console.log('✅ Configuration loaded successfully');
    console.log(`🌐 Network: ${config.network}`);
    console.log(`🔗 RPC: ${config.rpcEndpoint}`);

    // Create builder
    const builder = new SEDADataRequestBuilder(config);
    await builder.initialize();
    console.log('✅ Builder initialized successfully');

    // Test posting multiple DataRequests
    const numberOfRequests = 3;
    const results = [];
    let totalGasUsed = BigInt(0);
    const overallStartTime = Date.now();

    console.log(`\n🚀 Posting ${numberOfRequests} DataRequests...\n`);

    for (let i = 1; i <= numberOfRequests; i++) {
      console.log(`📤 DataRequest ${i}/${numberOfRequests}`);
      
      const startTime = Date.now();
      
      try {
        const result = await builder.postDataRequest({
          memo: `Test DataRequest ${i} from multiple requests test`
        });
        
        const duration = Date.now() - startTime;
        const gasUsed = BigInt(result.gasUsed || '0');
        
        console.log(`✅ DataRequest ${i} completed successfully`);
        console.log(`   DR ID: ${result.drId}`);
        console.log(`   Exit Code: ${result.exitCode}`);
        console.log(`   Block Height: ${result.blockHeight}`);
        console.log(`   Gas Used: ${result.gasUsed}`);
        console.log(`   Result: ${result.result || 'No result data'}`);
        console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
        
        totalGasUsed += gasUsed;
        
        results.push({
          requestNumber: i,
          success: true,
          drId: result.drId,
          exitCode: result.exitCode,
          gasUsed: result.gasUsed,
          duration,
          result: result.result
        });

      } catch (error) {
        const duration = Date.now() - startTime;
        console.log(`❌ DataRequest ${i} failed`);
        console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
        
        results.push({
          requestNumber: i,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration
        });
      }

      // Delay between requests (except for the last one)
      if (i < numberOfRequests) {
        console.log('   ⏸️  Waiting 3s before next request...\n');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const overallDuration = Date.now() - overallStartTime;
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log('\n📊 MULTIPLE DATAREQUESTS SUMMARY');
    console.log('='.repeat(50));
    console.log(`📤 Total Requests: ${numberOfRequests}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${((successful / numberOfRequests) * 100).toFixed(1)}%`);
    console.log(`⏱️  Total Duration: ${(overallDuration / 1000).toFixed(2)}s`);
    console.log(`⛽ Total Gas Used: ${totalGasUsed.toLocaleString()}`);
    console.log(`💰 Average Gas per Request: ${(Number(totalGasUsed) / successful).toLocaleString()}`);
    console.log('='.repeat(50));

    return {
      success: failed === 0,
      totalRequests: numberOfRequests,
      successful,
      failed,
      results,
      totalGasUsed: totalGasUsed.toString(),
      overallDuration
    };

  } catch (error) {
    console.error('❌ Multiple requests test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Run the test
testMultipleDataRequests().then(result => {
  if (result.success) {
    console.log('\n✅ Multiple DataRequests test completed successfully');
    process.exit(0);
  } else {
    console.log('\n❌ Multiple DataRequests test failed');
    process.exit(1);
  }
}).catch(error => {
  console.error('💥 Test script failed:', error);
  process.exit(1);
}); 