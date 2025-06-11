#!/usr/bin/env bun

/**
 * SEDA DataRequest Single Posting Test
 */

import { loadSEDAConfig, SEDADataRequestBuilder } from '../src/core/data-request';
import { ServiceContainer } from '../src/services';

async function testDataRequest() {
  const services = ServiceContainer.createProduction();
  const logger = services.loggingService;
  
  logger.info('🧪 Testing SEDA DataRequest Posting');

  try {
    // Load configuration
    const config = loadSEDAConfig();
    logger.info('✅ Configuration loaded successfully');
    logger.info(`🌐 Network: ${config.network}`);
    logger.info(`🔗 RPC: ${config.rpcEndpoint}`);

    // Create builder
    const builder = new SEDADataRequestBuilder(config, logger);
    logger.info('✅ DataRequest builder created');

    // Initialize
    await builder.initialize();
    logger.info('✅ Builder initialized successfully');

    // Post DataRequest
    logger.info('\n📤 Posting DataRequest...');
    const startTime = Date.now();
    
    const result = await builder.postDataRequest({
      memo: 'Test DataRequest from SEDA single test'
    });
    
    const duration = Date.now() - startTime;

    logger.info('\n🎉 DataRequest completed successfully!');
    logger.info('📊 Results:');
    logger.info(`   DR ID: ${result.drId}`);
    logger.info(`   Exit Code: ${result.exitCode}`);
    logger.info(`   Block Height: ${result.blockHeight}`);
    logger.info(`   Gas Used: ${result.gasUsed}`);
    logger.info(`   Result: ${result.result || 'No result data'}`);
    logger.info(`   Duration: ${(duration / 1000).toFixed(2)}s`);

    // Validate results
    if (!result.drId) {
      throw new Error('Missing DataRequest ID in result');
    }
    if (typeof result.exitCode !== 'number') {
      throw new Error('Invalid exit code in result');
    }
    if (!result.blockHeight) {
      throw new Error('Missing block height in result');
    }

  } catch (error) {
    logger.error('❌ Test failed:', error);
    throw error;
  }
}

// Run test if executed directly
if (import.meta.main) {
  testDataRequest()
    .then(() => {
      const services = ServiceContainer.createProduction();
      const logger = services.loggingService;
      logger.info('\n✅ DataRequest test completed successfully');
      process.exit(0);
    })
    .catch(() => {
      const services = ServiceContainer.createProduction();
      const logger = services.loggingService;
      logger.error('\n❌ DataRequest test failed');
      process.exit(1);
    });
} 