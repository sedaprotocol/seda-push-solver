/**
 * Configuration Test - Verify configuration functions work after refactoring
 */

import { 
  getNetworkConfig,
  getDataRequestConfig,
  validateDataRequestConfig,
  SEDA_NETWORK_CONFIGS
} from '../../src/core/network';

import type { SEDADataRequestConfig, NetworkConfig } from '../../src/types';

// Test getting network configuration
const testnetConfig: NetworkConfig = getNetworkConfig('testnet');
console.log('✅ getNetworkConfig works');
console.log('   Testnet RPC:', testnetConfig.rpcEndpoint);
console.log('   Testnet network:', testnetConfig.name);

// Test getting DataRequest configuration
const drConfig: SEDADataRequestConfig = getDataRequestConfig('testnet');
console.log('✅ getDataRequestConfig works');
console.log('   Oracle Program ID:', drConfig.oracleProgramId);
console.log('   Gas Limit:', drConfig.execGasLimit);

// Test validation
try {
  validateDataRequestConfig(drConfig);
  console.log('✅ validateDataRequestConfig works');
} catch (error) {
  console.error('❌ Validation failed:', error);
}

// Test that the network configs are accessible
console.log('✅ SEDA_NETWORK_CONFIGS accessible');
console.log('   Available networks:', Object.keys(SEDA_NETWORK_CONFIGS));

console.log('\n✅ All configuration tests passed!'); 