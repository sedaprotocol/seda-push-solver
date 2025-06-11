#!/usr/bin/env bun

/**
 * Test script for SEDA configuration validation and basic functionality
 */

import { 
  loadSEDAConfig, 
  SEDADataRequestBuilder
} from '../src';

import {
  getDataRequestConfig,
  validateDataRequestConfig
} from '../src/core/network';

async function testSEDAConfiguration() {
  console.log('🧪 Testing SEDA Configuration\n');

  try {
    // Test 1: Load SEDA Configuration
    console.log('📋 Step 1: Loading SEDA Configuration...');
    const config = loadSEDAConfig();
    
    console.log('✅ Configuration loaded successfully');
    console.log(`   🌐 Network: ${config.network}`);
    console.log(`   🔗 RPC Endpoint: ${config.rpcEndpoint}`);
    console.log(`   🔑 Has Mnemonic: ${config.mnemonic ? 'Yes' : 'No'}`);

    // Test 2: Validate DataRequest Configuration
    console.log('\n🔍 Step 2: Validating DataRequest Configuration...');
    const drConfig = getDataRequestConfig(config.network);
    
    console.log('✅ DataRequest configuration retrieved');
    console.log(`   🎯 Oracle Program ID: ${drConfig.oracleProgramId}`);
    console.log(`   🔄 Replication Factor: ${drConfig.replicationFactor}`);
    console.log(`   ⚡ Gas Limit: ${drConfig.execGasLimit.toLocaleString()}`);
    console.log(`   💰 Gas Price: ${drConfig.gasPrice}`);
    console.log(`   ⏰ Timeout: ${drConfig.timeoutSeconds}s`);
    console.log(`   📡 Polling Interval: ${drConfig.pollingIntervalSeconds}s`);
    console.log(`   🤝 Consensus Method: ${drConfig.consensusOptions.method}`);

    // Validate the configuration
    validateDataRequestConfig(drConfig);

    // Test 3: Create Builder Instance
    console.log('\n🔧 Step 3: Creating DataRequest Builder...');
    const builder = new SEDADataRequestBuilder(config);
    
    console.log('✅ Builder created successfully');
    console.log(`   📊 Builder initialized: ${builder.isBuilderInitialized()}`);
    console.log(`   ⚙️  Configuration valid: Yes`);

    // Test 4: Builder Configuration Access
    console.log('\n🔍 Step 4: Validating Builder Configuration...');
    const builderConfig = builder.getConfig();
    
    console.log('✅ Builder configuration retrieved');
    console.log(`   📊 Network Match: ${builderConfig.network === config.network ? 'Yes' : 'No'}`);
    console.log(`   🔗 RPC Match: ${builderConfig.rpcEndpoint === config.rpcEndpoint ? 'Yes' : 'No'}`);

    console.log('\n🎉 All configuration tests passed successfully!');
    
    return {
      success: true,
      config,
      drConfig,
      builderConfig
    };

  } catch (error) {
    console.error('❌ Configuration test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Test configuration structure validation
function testConfigurationStructure() {
  console.log('\n🔍 Testing Configuration Structure...');

  try {
    const requiredEnvVars = [
      'SEDA_MNEMONIC',
      'SEDA_NETWORK',
      'SEDA_RPC_ENDPOINT'
    ];

    console.log('📝 Checking environment variables...');
    
    const missingVars = requiredEnvVars.filter(varName => {
      const value = process.env[varName];
      const exists = value && value.trim().length > 0;
      console.log(`   ${exists ? '✅' : '❌'} ${varName}: ${exists ? 'Set' : 'Missing'}`);
      return !exists;
    });

    if (missingVars.length > 0) {
      console.log(`\n⚠️  Missing environment variables: ${missingVars.join(', ')}`);
      console.log('   This is expected if running without proper setup');
    } else {
      console.log('\n✅ All required environment variables are set');
    }

    return {
      success: true,
      missingVars
    };

  } catch (error) {
    console.error('❌ Structure test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Run the tests
async function runTests() {
  console.log('🧪 SEDA Configuration Tests\n');
  console.log('='.repeat(50));

  // Test structure first
  const structureResult = testConfigurationStructure();
  
  // Test configuration loading
  const configResult = await testSEDAConfiguration();

  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
  
  if (structureResult.success && configResult.success) {
    console.log('✅ All tests passed successfully');
    console.log('\n🚀 Next Steps:');
    console.log('  1. Ensure SEDA_MNEMONIC is set with valid mnemonic');
    console.log('  2. Ensure account has sufficient testnet tokens');
    console.log('  3. Run actual DataRequest tests with test:datarequest');
    
    process.exit(0);
  } else {
    console.log('❌ Some tests failed');
    
    if (!structureResult.success) {
      console.log(`   Structure test: ${structureResult.error}`);
    }
    
    if (!configResult.success) {
      console.log(`   Configuration test: ${configResult.error}`);
    }
    
    process.exit(1);
  }
}

// Run if executed directly
runTests().catch(error => {
  console.error('💥 Test script failed:', error);
  process.exit(1);
}); 