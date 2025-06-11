#!/usr/bin/env bun

/**
 * Test script for posting multiple DataRequests to SEDA network
 */

import { loadSEDAConfig, SEDADataRequestBuilder } from '../src/core/data-request';
import { ServiceContainer } from '../src/services';

async function testMultipleDataRequests() {
  const services = ServiceContainer.createProduction();
  const logger = services.loggingService;
  
  logger.info('🧪 Testing Multiple SEDA DataRequests');

  try {
    // Load configuration
    const config = loadSEDAConfig();
    logger.info('✅ Configuration loaded successfully');
    logger.info(`🌐 Network: ${config.network}`);
    logger.info(`🔗 RPC: ${config.rpcEndpoint}`);

    // Create and initialize builder
    const builder = new SEDADataRequestBuilder(config, logger);
    await builder.initialize();
    logger.info('✅ Builder initialized successfully');

    // Test posting multiple DataRequests
    const numberOfRequests = 3;
    const results = [];
    let totalGasUsed = BigInt(0);
    const overallStartTime = Date.now();

    logger.info(`\n🚀 Posting ${numberOfRequests} DataRequests...\n`);

    for (let i = 1; i <= numberOfRequests; i++) {
      logger.info(`📤 DataRequest ${i}/${numberOfRequests}`);
      
      const startTime = Date.now();
      
      try {
        const result = await builder.postDataRequest({
          memo: `Test DataRequest ${i} from multiple requests test`
        });
        
        const duration = Date.now() - startTime;
        const gasUsed = BigInt(result.gasUsed || '0');
        
        logger.info(`✅ DataRequest ${i} completed successfully`);
        logger.info(`   DR ID: ${result.drId}`);
        logger.info(`   Exit Code: ${result.exitCode}`);
        logger.info(`   Block Height: ${result.blockHeight}`);
        logger.info(`   Gas Used: ${result.gasUsed}`);
        logger.info(`   Result: ${result.result || 'No result data'}`);
        logger.info(`   Duration: ${(duration / 1000).toFixed(2)}s`);
        
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
        logger.error(`❌ DataRequest ${i} failed`);
        logger.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        logger.error(`   Duration: ${(duration / 1000).toFixed(2)}s`);
        
        results.push({
          requestNumber: i,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration
        });
      }

      // Delay between requests (except for the last one)
      if (i < numberOfRequests) {
        logger.info('   ⏸️  Waiting 3s before next request...\n');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const overallDuration = Date.now() - overallStartTime;
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logger.info('\n📊 MULTIPLE DATAREQUESTS SUMMARY');
    logger.info('='.repeat(50));
    logger.info(`📤 Total Requests: ${numberOfRequests}`);
    logger.info(`✅ Successful: ${successful}`);
    logger.info(`❌ Failed: ${failed}`);
    logger.info(`📈 Success Rate: ${((successful / numberOfRequests) * 100).toFixed(1)}%`);
    logger.info(`⏱️  Total Duration: ${(overallDuration / 1000).toFixed(2)}s`);
    logger.info(`⛽ Total Gas Used: ${totalGasUsed.toLocaleString()}`);
    logger.info(`💰 Average Gas per Request: ${(Number(totalGasUsed) / successful).toLocaleString()}`);
    logger.info('='.repeat(50));

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
    logger.error('❌ Multiple requests test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Run the test
if (import.meta.main) {
  testMultipleDataRequests()
    .then(result => {
      const services = ServiceContainer.createProduction();
      const logger = services.loggingService;
      if (result.success) {
        logger.info('\n✅ Multiple DataRequests test completed successfully');
        process.exit(0);
      } else {
        logger.error('\n❌ Multiple DataRequests test failed');
        process.exit(1);
      }
    })
    .catch(error => {
      const services = ServiceContainer.createProduction();
      const logger = services.loggingService;
      logger.error('💥 Test script failed:', error);
      process.exit(1);
    });
} 