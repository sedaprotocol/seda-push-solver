/**
 * Index Exports Test - Verify all types and classes are accessible through main export
 */

import { 
  SEDADataRequestBuilder,
  loadSEDAConfig,
  SEDADataRequestScheduler
} from '../../src/index';

import type { 
  SEDAConfig, 
  DataRequestResult, 
  DataRequestOptions,
  NetworkType
} from '../../src/index';

// Test that all types are accessible
const config: SEDAConfig = {
  rpcEndpoint: 'https://rpc.testnet.seda.xyz',
  network: 'testnet' as NetworkType,
  mnemonic: 'test mnemonic'
};

const result: DataRequestResult = {
  drId: 'test-id',
  exitCode: 0
};

const options: DataRequestOptions = {
  memo: 'test memo'
};

console.log('✅ Index exports test passed - all types accessible');
console.log('   SEDAConfig:', typeof config);
console.log('   DataRequestResult:', typeof result);
console.log('   DataRequestOptions:', typeof options);
console.log('   SEDADataRequestBuilder:', typeof SEDADataRequestBuilder);
console.log('   loadSEDAConfig:', typeof loadSEDAConfig);
console.log('   SEDADataRequestScheduler:', typeof SEDADataRequestScheduler); 