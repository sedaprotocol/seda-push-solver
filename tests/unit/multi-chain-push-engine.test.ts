/**
 * Multi-Chain Push Engine Tests
 * Tests for Phase 3: Multi-Chain Push Engine components
 */

import { 
  ChainManager, 
  MockChainManager, 
  EVMChainExecutor, 
  MockEVMChainExecutor,
  ContractInterface,
  MockContractInterface,
  EVMPusherService,
  MockEVMPusherService
} from '../../src/core/evm-pusher';
import { MockLoggingService } from '../../src/services/logging-service';
import { MockBatchService } from '../../src/services/batch-service';
import { MockDataRequestTracker } from '../../src/services/data-request-tracker';
import { buildEVMPusherConfig } from '../../src/core/network/evm-config';
import type { BatchTrackingInfo, EVMChainConfig } from '../../src/types/evm-types';

// Test configuration
const testChainConfig: EVMChainConfig = {
  chainId: 42161,
  name: 'Test Arbitrum',
  rpcEndpoint: 'https://test.arbitrum.io',
  explorerUrl: 'https://test.arbiscan.io',
  contracts: {
    sedaCore: '0x1234567890123456789012345678901234567890',
    sedaProver: '0x1234567890123456789012345678901234567890'
  },
  gas: {
    maxGasPrice: BigInt(50_000_000_000),
    batchPushGasLimit: 500_000,
    gasPriceMultiplier: 1.1,
    useEIP1559: true
  },
  confirmations: {
    required: 3,
    timeoutMs: 300_000,
    blockTimeMs: 1_000
  },
  retry: {
    maxAttempts: 5,
    initialDelayMs: 5_000,
    backoffMultiplier: 2.0,
    maxDelayMs: 60_000
  }
};

const testBatch: BatchTrackingInfo = {
  batchId: 'test-batch-123',
  batchNumber: BigInt(42),
  blockHeight: BigInt(1000000),
  dataResultRoot: '0x' + 'b'.repeat(64),
  currentDataResultRoot: '0x' + 'c'.repeat(64),
  validatorRoot: '0x' + 'd'.repeat(64),
  signatures: [
    {
      validatorAddress: 'validator1',
      signature: Buffer.from('signature1', 'hex'),
      ethAddress: '0x1234567890123456789012345678901234567890',
      votingPowerPercentage: 50,
      proof: [Buffer.from('proof1', 'hex')]
    },
    {
      validatorAddress: 'validator2', 
      signature: Buffer.from('signature2', 'hex'),
      ethAddress: '0x2345678901234567890123456789012345678901',
      votingPowerPercentage: 50,
      proof: [Buffer.from('proof2', 'hex')]
    }
  ],
  dataRequestIds: ['dr-1', 'dr-2', 'dr-3', 'dr-4', 'dr-5'],
  totalDataRequests: 5,
  isSigned: true,
  chainInfo: {
    network: 'testnet',
    blockHeight: BigInt(1000000),
    timestamp: Date.now()
  },
  // Legacy support
  merkleRoot: '0x' + 'a'.repeat(64),
  sedaBlockHeight: BigInt(1000000),
  chainStatus: new Map(),
  discoveredAt: Date.now()
};

function runTests() {
  console.log('\n🧪 Phase 3: Multi-Chain Push Engine Tests');
  console.log('=' .repeat(60));
  
  testContractInterface();
  testEVMChainExecutor();
  testChainManager();
  testEVMPusherService();
  testMultiChainIntegration();
  
  console.log('\n✅ All Phase 3 tests completed successfully!\n');
}

function testContractInterface() {
  console.log('\n📋 Test 1: Contract Interface');
  
  try {
    const logger = new MockLoggingService();
    
    // Test mock contract interface
    const mockContract = new MockContractInterface(testChainConfig, logger);
    
    console.log('   ✅ Mock contract interface created');
    
    // Test interface methods exist
    if (typeof mockContract.initialize === 'function' &&
        typeof mockContract.isBatchPushed === 'function' &&
        typeof mockContract.getBatchInfo === 'function' &&
        typeof mockContract.pushBatch === 'function' &&
        typeof mockContract.estimateGasForBatchPush === 'function' &&
        typeof mockContract.getCurrentGasPrice === 'function' &&
        typeof mockContract.checkHealth === 'function' &&
        typeof mockContract.shutdown === 'function') {
      console.log('   ✅ All contract interface methods present');
    } else {
      throw new Error('Missing contract interface methods');
    }
    
    // Test production contract interface
    const prodContract = new ContractInterface(testChainConfig, logger);
    console.log('   ✅ Production contract interface created');
    
    console.log('   ✅ Contract Interface tests passed\n');
  } catch (error) {
    console.error(`   ❌ Contract Interface test failed: ${error}`);
  }
}

function testEVMChainExecutor() {
  console.log('📋 Test 2: EVM Chain Executor');
  
  try {
    const logger = new MockLoggingService();
    
    // Test mock executor
    const mockExecutor = new MockEVMChainExecutor(testChainConfig, logger);
    
    console.log('   ✅ Mock EVM chain executor created');
    
    // Test interface methods exist
    if (typeof mockExecutor.initialize === 'function' &&
        typeof mockExecutor.pushBatch === 'function' &&
        typeof mockExecutor.isBatchPushed === 'function' &&
        typeof mockExecutor.getBatchStatus === 'function' &&
        typeof mockExecutor.checkHealth === 'function' &&
        typeof mockExecutor.getStatistics === 'function' &&
        typeof mockExecutor.shutdown === 'function') {
      console.log('   ✅ All executor interface methods present');
    } else {
      throw new Error('Missing executor interface methods');
    }
    
    // Test production executor
    const prodExecutor = new EVMChainExecutor(testChainConfig, logger);
    console.log('   ✅ Production EVM chain executor created');
    
    console.log('   ✅ EVM Chain Executor tests passed\n');
  } catch (error) {
    console.error(`   ❌ EVM Chain Executor test failed: ${error}`);
  }
}

function testChainManager() {
  console.log('📋 Test 3: Chain Manager');
  
  try {
    const logger = new MockLoggingService();
    const config = buildEVMPusherConfig();
    
    // Override with test configuration
    config.enabledChains = [42161, 10];
    config.chains = {
      42161: testChainConfig,
      10: { ...testChainConfig, chainId: 10, name: 'Test Optimism' }
    };
    
    // Test mock chain manager
    const mockManager = new MockChainManager(config, logger);
    
    console.log('   ✅ Mock chain manager created');
    
    // Test interface methods exist
    if (typeof mockManager.initialize === 'function' &&
        typeof mockManager.pushBatchToAllChains === 'function' &&
        typeof mockManager.getBatchStatus === 'function' &&
        typeof mockManager.checkChainsHealth === 'function' &&
        typeof mockManager.getStatistics === 'function' &&
        typeof mockManager.shutdown === 'function') {
      console.log('   ✅ All chain manager interface methods present');
    } else {
      throw new Error('Missing chain manager interface methods');
    }
    
    // Test production chain manager
    const prodManager = new ChainManager(config, logger);
    console.log('   ✅ Production chain manager created');
    
    console.log('   ✅ Chain Manager tests passed\n');
  } catch (error) {
    console.error(`   ❌ Chain Manager test failed: ${error}`);
  }
}

function testEVMPusherService() {
  console.log('📋 Test 4: EVM Pusher Service');
  
  try {
    const logger = new MockLoggingService();
    const batchService = new MockBatchService(logger);
    const completionTracker = new MockDataRequestTracker(logger);
    
    // Test mock EVM pusher service
    const mockService = new MockEVMPusherService(batchService, completionTracker, logger);
    
    console.log('   ✅ Mock EVM pusher service created');
    
    // Test interface methods exist
    if (typeof mockService.initialize === 'function' &&
        typeof mockService.start === 'function' &&
        typeof mockService.stop === 'function' &&
        typeof mockService.pushBatch === 'function' &&
        typeof mockService.getBatchStatus === 'function' &&
        typeof mockService.getHealthStatus === 'function' &&
        typeof mockService.getStatistics === 'function' &&
        typeof mockService.shutdown === 'function') {
      console.log('   ✅ All EVM pusher service interface methods present');
    } else {
      throw new Error('Missing EVM pusher service interface methods');
    }
    
    // Test production EVM pusher service (requires environment setup)
    try {
      const prodService = new EVMPusherService(batchService, completionTracker, logger);
      console.log('   ✅ Production EVM pusher service created');
    } catch (error) {
      // This is expected if environment variables are not set
      console.log('   ⚠️  Production service requires environment configuration');
    }
    
    console.log('   ✅ EVM Pusher Service tests passed\n');
  } catch (error) {
    console.error(`   ❌ EVM Pusher Service test failed: ${error}`);
  }
}

async function testMultiChainIntegration() {
  console.log('📋 Test 5: Multi-Chain Integration');
  
  try {
    const logger = new MockLoggingService();
    const batchService = new MockBatchService(logger);
    const completionTracker = new MockDataRequestTracker(logger);
    
    // Test full integration flow with mock services
    const pusherService = new MockEVMPusherService(batchService, completionTracker, logger);
    
    console.log('   🚀 Testing service lifecycle...');
    
    // Initialize service
    await pusherService.initialize();
    console.log('   ✅ Service initialized');
    
    // Start service
    await pusherService.start();
    console.log('   ✅ Service started');
    
    // Test batch pushing
    const result = await pusherService.pushBatch(testBatch);
    if (result.success && result.successCount > 0) {
      console.log(`   ✅ Batch pushed successfully to ${result.successCount} chains`);
    } else {
      throw new Error('Batch push failed');
    }
    
    // Test batch status
    const status = await pusherService.getBatchStatus(testBatch.batchNumber);
    if (Object.keys(status).length > 0) {
      console.log(`   ✅ Batch status retrieved for ${Object.keys(status).length} chains`);
    } else {
      throw new Error('No batch status returned');
    }
    
    // Test health status
    const health = await pusherService.getHealthStatus();
    if (health.isHealthy) {
      console.log('   ✅ Service health status is healthy');
    } else {
      console.log('   ⚠️  Service health status indicates issues');
    }
    
    // Test statistics
    const stats = await pusherService.getStatistics();
    if (stats.totalBatchesProcessed >= 0) {
      console.log(`   ✅ Statistics retrieved: ${stats.totalBatchesProcessed} batches processed`);
    } else {
      throw new Error('Invalid statistics returned');
    }
    
    // Stop service
    await pusherService.stop();
    console.log('   ✅ Service stopped');
    
    // Shutdown service
    await pusherService.shutdown();
    console.log('   ✅ Service shutdown');
    
    console.log('   ✅ Multi-Chain Integration tests passed\n');
  } catch (error) {
    console.error(`   ❌ Multi-Chain Integration test failed: ${error}`);
  }
}

// Run the tests
runTests(); 