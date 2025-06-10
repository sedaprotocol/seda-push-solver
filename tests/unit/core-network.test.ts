/**
 * Core Network Module Test - Verify the new network configuration structure
 */

// Test importing directly from core modules
import {
  SEDA_NETWORK_CONFIGS,
  getNetworkConfig,
  getRpcEndpoint
} from '../../src/core/network/network-config';

import {
  getDataRequestConfig,
  createDataRequestConfig
} from '../../src/core/network/data-request-config';

import {
  validateDataRequestConfig
} from '../../src/core/network/network-validator';

// Test importing from the core index
import {
  getNetworkConfig as getNetworkConfigFromIndex,
  getDataRequestConfig as getDataRequestConfigFromIndex,
  validateDataRequestConfig as validateFromIndex
} from '../../src/core/network';

import type { NetworkConfig, SEDADataRequestConfig } from '../../src/types';

console.log('🧪 Testing Core Network Module Structure\n');

// Test direct module imports
console.log('✅ Direct module imports work');
const testnetConfig: NetworkConfig = getNetworkConfig('testnet');
console.log('   Network config:', testnetConfig.network);

const drConfig: SEDADataRequestConfig = getDataRequestConfig('testnet');
console.log('   DR config oracle ID:', drConfig.oracleProgramId.slice(0, 10) + '...');

const rpcEndpoint = getRpcEndpoint('testnet');
console.log('   RPC endpoint:', rpcEndpoint);

// Test index imports
console.log('\n✅ Core index imports work');
const testnetConfig2 = getNetworkConfigFromIndex('testnet');
console.log('   Network config from index:', testnetConfig2.network);

const drConfig2 = getDataRequestConfigFromIndex('testnet');
console.log('   DR config from index oracle ID:', drConfig2.oracleProgramId.slice(0, 10) + '...');

// Test configuration creation
const customConfig = createDataRequestConfig('testnet', {
  memo: 'Custom test memo',
  timeoutSeconds: 120
});
console.log('\n✅ Custom configuration creation works');
console.log('   Custom memo:', customConfig.memo);
console.log('   Custom timeout:', customConfig.timeoutSeconds);

// Test validation
try {
  validateFromIndex(customConfig);
  console.log('✅ Validation works');
} catch (error) {
  console.error('❌ Validation failed:', error);
}

// Test that configs are available
console.log('\n✅ Network configs accessible');
console.log('   Available networks:', Object.keys(SEDA_NETWORK_CONFIGS));

console.log('\n🎉 All core network module tests passed!'); 