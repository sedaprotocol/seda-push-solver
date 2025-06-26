/**
 * Configuration Test - Verify configuration functions work after refactoring
 */

import type { SEDADataRequestConfig, NetworkConfig } from '../../src/types';

// Set up required environment for testing
process.env.SEDA_ORACLE_PROGRAM_IDS = 'test-program-1,test-program-2';
process.env.SEDA_MNEMONIC = 'test mnemonic';
process.env.SEDA_NETWORK = 'testnet';

import { 
  getSedaNetworkConfig,
  getSedaDataRequestConfig
} from '../../src/config';

// Test getting network configuration
const testnetConfig: NetworkConfig = getSedaNetworkConfig('testnet');
console.log('✅ getSedaNetworkConfig works');
console.log('   Testnet RPC:', testnetConfig.rpcEndpoint);
console.log('   Testnet network:', testnetConfig.name);

// Test getting DataRequest configuration
const drConfig: SEDADataRequestConfig = getSedaDataRequestConfig('testnet');
console.log('✅ getSedaDataRequestConfig works');
console.log('   Oracle Program ID:', drConfig.oracleProgramId);
console.log('   Gas Limit:', drConfig.execGasLimit);

// Test that we can get different network configurations
const mainnetConfig = getSedaNetworkConfig('mainnet');
const localConfig = getSedaNetworkConfig('local');
console.log('✅ Network configurations accessible');
console.log('   Available networks: testnet, mainnet, local');
console.log('   Mainnet RPC:', mainnetConfig.rpcEndpoint);
console.log('   Local RPC:', localConfig.rpcEndpoint);

console.log('\n✅ All configuration tests passed!'); 