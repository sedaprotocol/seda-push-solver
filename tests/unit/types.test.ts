/**
 * Types Test - Validate core type definitions
 */

import type { SEDAConfig, DataRequestResult, DataRequestOptions, NetworkType } from '../../src/types';

// Test type compilation and basic usage
const testConfig: SEDAConfig = {
  rpcEndpoint: 'https://rpc.testnet.seda.xyz',
  network: 'testnet' as NetworkType,
  mnemonic: 'test mnemonic'
};

const testResult: DataRequestResult = {
  drId: 'test-id',
  exitCode: 0,
  result: 'test-result',
  blockHeight: 12345,
  gasUsed: '100000'
};

const testOptions: DataRequestOptions = {
  memo: 'test memo',
  customTimeout: 60
};

console.log('✅ Types test passed - all interfaces compile correctly');
console.log('   Config network:', testConfig.network);
console.log('   Result DR ID:', testResult.drId);
console.log('   Options memo:', testOptions.memo);

// Test network type validation
const validNetworks: NetworkType[] = ['testnet', 'mainnet', 'local'];
console.log('   Valid networks:', validNetworks);

export { testConfig, testResult, testOptions }; 