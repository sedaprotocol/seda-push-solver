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
  drBlockHeight: 12345n,
  exitCode: 0,
  gasUsed: 100000n,
  result: 'test-result',
  paybackAddress: 'test-address',
  sedaPayload: 'test-payload',
  version: 'test-version',
  blockTimestamp: 1640995200000n
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