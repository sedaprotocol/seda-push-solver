#!/usr/bin/env bun

/**
 * SEDA Configuration Test
 * Tests network configuration loading and validation
 */

import { loadSEDAConfig, SEDADataRequestBuilder } from '../src/core/data-request';
import { getNetworkConfig, SEDA_NETWORK_CONFIGS } from '../src/core/network';
import { ServiceContainer } from '../src/services';

/**
 * Test SEDA configuration loading and network setup
 */
async function testSEDAConfiguration() {
  const services = ServiceContainer.createProduction();
  const logger = services.loggingService;
  
  logger.info('\n🧪 Testing SEDA Configuration System');
  logger.info('='.repeat(50));

  try {
    // Test 1: Load configuration from environment
    logger.info('\n📋 Test 1: Environment Configuration Loading');
    const config = loadSEDAConfig();
    
    if (!config.network || !config.rpcEndpoint) {
      throw new Error('Configuration validation failed - missing required fields');
    }
    
    logger.info(`✅ Network: ${config.network}`);
    logger.info(`✅ RPC Endpoint: ${config.rpcEndpoint}`);
    logger.info(`✅ Has Mnemonic: ${config.mnemonic ? 'Yes' : 'No'}`);
    
    // Test 2: Network configuration validation
    logger.info('\n📋 Test 2: Network Configuration Validation');
    const networkConfig = getNetworkConfig(config.network);
    
    if (!networkConfig.dataRequest.oracleProgramId) {
      throw new Error('Oracle Program ID not configured');
    }
    
    logger.info(`✅ Oracle Program ID: ${networkConfig.dataRequest.oracleProgramId}`);
    logger.info(`✅ Replication Factor: ${networkConfig.dataRequest.replicationFactor}`);
    logger.info(`✅ Gas Limit: ${networkConfig.dataRequest.execGasLimit.toLocaleString()}`);
    
    // Test 3: Builder initialization
    logger.info('\n📋 Test 3: Builder Initialization');
    const builder = new SEDADataRequestBuilder(config, logger);
    
    if (!builder) {
      throw new Error('Builder creation failed');
    }
    
    logger.info('✅ Builder created successfully');
    logger.info(`✅ Builder initialized: ${builder.isBuilderInitialized()}`);
    
    // Test 4: Configuration structure validation
    logger.info('\n📋 Test 4: Configuration Structure Validation');
    testConfigurationStructure();
    logger.info('✅ Configuration structure validation passed');
    
    logger.info('\n🎉 All SEDA configuration tests passed!');
    return { success: true };
    
  } catch (error) {
    logger.error('❌ Configuration test failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Test the structure of network configurations
 */
function testConfigurationStructure() {
  const requiredNetworks = ['testnet', 'mainnet', 'local'];
  
  for (const network of requiredNetworks) {
    const config = SEDA_NETWORK_CONFIGS[network as keyof typeof SEDA_NETWORK_CONFIGS];
    
    if (!config) {
      throw new Error(`Missing configuration for network: ${network}`);
    }
    
    // Validate required fields
    if (!config.name || !config.rpcEndpoint || !config.dataRequest) {
      throw new Error(`Invalid configuration structure for network: ${network}`);
    }
    
    // Validate DataRequest configuration
    const dr = config.dataRequest;
    if (!dr.oracleProgramId || !dr.execGasLimit || !dr.gasPrice) {
      throw new Error(`Invalid DataRequest configuration for network: ${network}`);
    }
  }
}

/**
 * Run all tests
 */
async function runTests() {
  const services = ServiceContainer.createProduction();
  const logger = services.loggingService;
  
  logger.info('🚀 Starting SEDA Configuration Tests');
  
  const configResult = await testSEDAConfiguration();
  
  if (configResult.success) {
    logger.info('\n✅ All tests completed successfully!');
    return true;
  } else {
    logger.error('\n❌ Tests failed!');
    return false;
  }
}

// Run tests if executed directly
if (import.meta.main) {
  runTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      const services = ServiceContainer.createProduction();
      const logger = services.loggingService;
      logger.error('💥 Test execution failed:', error);
      process.exit(1);
    });
} 