/**
 * Phase 2: SEDA Chain Integration Tests
 * Tests for SEDA chain service, DataRequest completion tracker, and updated batch service
 */

import { describe, test, beforeEach, afterEach, expect, jest } from 'bun:test';
import { 
  SEDAChainService, 
  MockSEDAChainService,
  DataRequestTracker,
  MockDataRequestTracker,
  BatchService,
  MockBatchService,
  LoggingService,
  LogLevel,
  MockConfigService
} from '../../src/services';
import type { 
  SEDAChainConfig, 
  DataRequestResult,
  BatchInfo,
  DataRequestCompletionInfo,
  DataRequestCompletionEvent
} from '../../src/services';
import type { BatchTrackingInfo } from '../../src/types/evm-types';

describe('Phase 2: SEDA Chain Integration', () => {
  let loggingService: LoggingService;
  let configService: MockConfigService;

  beforeEach(() => {
    loggingService = new LoggingService();
    loggingService.setLogLevel(LogLevel.ERROR); // Reduce noise in tests
    configService = new MockConfigService();
  });

  describe('SEDA Chain Service', () => {
    let sedaChainService: MockSEDAChainService;

    beforeEach(() => {
      sedaChainService = new MockSEDAChainService(loggingService);
    });

    test('should initialize successfully', async () => {
      const config: SEDAChainConfig = {
        rpcEndpoint: 'http://localhost:26657',
        chainId: 'seda-1',
        network: 'testnet',
        timeout: 5000,
        retryAttempts: 3,
        retryDelayMs: 1000
      };

      await sedaChainService.initialize(config);
      expect(sedaChainService.isInitialized()).toBe(true);
    });

    test('should check DataRequest completion status', async () => {
      const config: SEDAChainConfig = {
        rpcEndpoint: 'http://localhost:26657',
        chainId: 'seda-1',
        network: 'testnet'
      };

      await sedaChainService.initialize(config);

      // Test with completed DataRequest
      const completedResult: DataRequestResult = {
        drId: 'test-dr-completed',
        blockHeight: 1000n,
        exitCode: 0,
        result: Buffer.from('test result'),
        consensus: true,
        version: '1.0.0',
        gasUsed: 100000n,
        isCompleted: true
      };

      sedaChainService.setMockDataRequest('test-dr-completed', completedResult);

      const isCompleted = await sedaChainService.isDataRequestCompleted('test-dr-completed');
      expect(isCompleted).toBe(true);

      // Test with non-existent DataRequest
      const isNotCompleted = await sedaChainService.isDataRequestCompleted('non-existent');
      expect(isNotCompleted).toBe(false);
    });

    test('should retrieve DataRequest results', async () => {
      const config: SEDAChainConfig = {
        rpcEndpoint: 'http://localhost:26657',
        chainId: 'seda-1',
        network: 'testnet'
      };

      await sedaChainService.initialize(config);

      const mockResult: DataRequestResult = {
        drId: 'test-dr-1',
        blockHeight: 1000n,
        exitCode: 0,
        result: Buffer.from('test result data'),
        consensus: true,
        version: '1.0.0',
        gasUsed: 150000n,
        isCompleted: true,
        batchAssignment: 5n
      };

      sedaChainService.setMockDataRequest('test-dr-1', mockResult);

      const result = await sedaChainService.getDataRequestResult('test-dr-1');
      expect(result).toEqual(mockResult);

      const notFound = await sedaChainService.getDataRequestResult('not-found');
      expect(notFound).toBeNull();
    });

    test('should find DataRequest batches', async () => {
      const config: SEDAChainConfig = {
        rpcEndpoint: 'http://localhost:26657',
        chainId: 'seda-1',
        network: 'testnet'
      };

      await sedaChainService.initialize(config);

      const mockBatch: BatchInfo = {
        batchNumber: 5n,
        batchId: 'test-batch-5',
        blockHeight: 1005n,
        dataResultRoot: '0xabcd1234',
        currentDataResultRoot: '0xefgh5678',
        validatorRoot: '0xijkl9012',
        dataRequestIds: ['test-dr-1', 'test-dr-2'],
        totalDataRequests: 2,
        signed: true
      };

      sedaChainService.setMockBatch(mockBatch);
      sedaChainService.setMockBatchAssignment('test-dr-1', 5n);

      const foundBatch = await sedaChainService.findDataRequestBatch('test-dr-1');
      expect(foundBatch).toEqual(mockBatch);

      const notFoundBatch = await sedaChainService.findDataRequestBatch('not-in-batch');
      expect(notFoundBatch).toBeNull();
    });

    test('should get batch information', async () => {
      const config: SEDAChainConfig = {
        rpcEndpoint: 'http://localhost:26657',
        chainId: 'seda-1',
        network: 'testnet'
      };

      await sedaChainService.initialize(config);

      const mockBatch: BatchInfo = {
        batchNumber: 10n,
        batchId: 'test-batch-10',
        blockHeight: 1010n,
        dataResultRoot: '0xbatch10root',
        currentDataResultRoot: '0xcurrent10root',
        validatorRoot: '0xvalidator10root',
        dataRequestIds: ['dr-10-1', 'dr-10-2', 'dr-10-3'],
        totalDataRequests: 3,
        signed: true
      };

      sedaChainService.setMockBatch(mockBatch);

      const batchInfo = await sedaChainService.getBatchInfo(10n);
      expect(batchInfo).toEqual(mockBatch);

      const notFound = await sedaChainService.getBatchInfo(999n);
      expect(notFound).toBeNull();
    });

    test('should get chain health status', async () => {
      const config: SEDAChainConfig = {
        rpcEndpoint: 'http://localhost:26657',
        chainId: 'seda-1',
        network: 'testnet'
      };

      await sedaChainService.initialize(config);

      const health = await sedaChainService.getChainHealth();
      expect(health.connected).toBe(true);
      expect(health.latestBlock).toBe(0n);
      expect(typeof health.latency).toBe('number');
    });
  });

  describe('DataRequest Completion Tracker', () => {
    let dataRequestTracker: MockDataRequestTracker;
    let sedaChainService: MockSEDAChainService;

    beforeEach(async () => {
      sedaChainService = new MockSEDAChainService(loggingService);
      await sedaChainService.initialize({
        rpcEndpoint: 'http://localhost:26657',
        chainId: 'seda-1',
        network: 'testnet'
      });

      dataRequestTracker = new MockDataRequestTracker(loggingService);
      await dataRequestTracker.initialize(sedaChainService, {
        maxRetryAttempts: 3,
        retryDelayMs: 1000,
        completionPollingIntervalMs: 5000,
        enableBatchTracking: true
      });
    });

    test('should initialize successfully', () => {
      expect(dataRequestTracker.isInitialized()).toBe(true);
    });

    test('should track DataRequest completion', async () => {
      await dataRequestTracker.trackDataRequest('test-dr-track');
      
      const tracked = dataRequestTracker.getTrackedDataRequests();
      expect(tracked).toContain('test-dr-track');

      const completionInfo = dataRequestTracker.getCompletionInfo('test-dr-track');
      expect(completionInfo).not.toBeNull();
      expect(completionInfo!.drId).toBe('test-dr-track');
      expect(completionInfo!.status).toBe('pending');
    });

    test('should handle completion events', async () => {
      const events: DataRequestCompletionEvent[] = [];
      
      dataRequestTracker.onCompletion((event) => {
        events.push(event);
      });

      const mockResult: DataRequestResult = {
        drId: 'test-dr-event',
        blockHeight: 1000n,
        exitCode: 0,
        result: Buffer.from('completed result'),
        consensus: true,
        version: '1.0.0',
        gasUsed: 120000n,
        isCompleted: true
      };

      const mockBatch: BatchInfo = {
        batchNumber: 7n,
        batchId: 'test-batch-7',
        blockHeight: 1007n,
        dataResultRoot: '0xbatch7root',
        currentDataResultRoot: '0xcurrent7root',
        validatorRoot: '0xvalidator7root',
        dataRequestIds: ['test-dr-event'],
        totalDataRequests: 1,
        signed: true
      };

      dataRequestTracker.setMockResult('test-dr-event', mockResult);
      dataRequestTracker.setMockBatch('test-dr-event', mockBatch);

      await dataRequestTracker.trackDataRequest('test-dr-event');
      await dataRequestTracker.simulateCompletion('test-dr-event');

      expect(events.length).toBeGreaterThan(0);
      const completionEvent = events.find(e => e.status === 'batch_assigned');
      expect(completionEvent).toBeDefined();
      if (completionEvent) {
        expect(completionEvent.drId).toBe('test-dr-event');
        expect(completionEvent.batchInfo).toEqual(mockBatch);
      }
    });

    test('should provide tracking statistics', async () => {
      await dataRequestTracker.trackDataRequest('dr-stats-1');
      await dataRequestTracker.trackDataRequest('dr-stats-2');
      await dataRequestTracker.trackDataRequest('dr-stats-3');

      const stats = dataRequestTracker.getTrackingStatistics();
      expect(stats.totalTracked).toBe(3);
      expect(stats.pending).toBe(3);
      expect(stats.completed).toBe(0);
      expect(stats.batchAssigned).toBe(0);
      expect(stats.failed).toBe(0);
    });

    test('should stop tracking DataRequests', async () => {
      await dataRequestTracker.trackDataRequest('test-dr-stop');
      
      let tracked = dataRequestTracker.getTrackedDataRequests();
      expect(tracked).toContain('test-dr-stop');

      await dataRequestTracker.stopTracking('test-dr-stop');
      
      tracked = dataRequestTracker.getTrackedDataRequests();
      expect(tracked).not.toContain('test-dr-stop');
    });
  });

  describe('Updated Batch Service', () => {
    let batchService: MockBatchService;
    let sedaChainService: MockSEDAChainService;

    beforeEach(async () => {
      sedaChainService = new MockSEDAChainService(loggingService);
      await sedaChainService.initialize({
        rpcEndpoint: 'http://localhost:26657',
        chainId: 'seda-1',
        network: 'testnet'
      });

      batchService = new MockBatchService(loggingService);
      await batchService.initialize(sedaChainService);
    });

    test('should initialize with SEDA chain service', () => {
      expect(batchService.isInitialized()).toBe(true);
    });

    test('should retrieve batch information', async () => {
      const mockBatch: BatchTrackingInfo = {
        batchNumber: 15n,
        batchId: 'batch-15',
        blockHeight: 1015n,
        dataResultRoot: '0xbatch15root',
        currentDataResultRoot: '0xcurrent15root',
        validatorRoot: '0xvalidator15root',
        signatures: [],
        dataRequestIds: ['dr-15-1', 'dr-15-2'],
        totalDataRequests: 2,
        isSigned: true,
        chainInfo: {
          network: 'seda-chain',
          blockHeight: 1015n,
          timestamp: Date.now()
        }
      };

      batchService.setMockBatch(mockBatch);

      const retrievedBatch = await batchService.getBatch(15n);
      expect(retrievedBatch).toEqual(mockBatch);

      const notFound = await batchService.getBatch(999n);
      expect(notFound).toBeNull();
    });

    test('should find batches containing DataRequests', async () => {
      const batch1: BatchTrackingInfo = {
        batchNumber: 20n,
        batchId: 'batch-20',
        blockHeight: 1020n,
        dataResultRoot: '0xbatch20root',
        currentDataResultRoot: '0xcurrent20root',
        validatorRoot: '0xvalidator20root',
        signatures: [],
        dataRequestIds: ['dr-20-1', 'dr-20-2'],
        totalDataRequests: 2,
        isSigned: true,
        chainInfo: {
          network: 'seda-chain',
          blockHeight: 1020n,
          timestamp: Date.now()
        }
      };

      const batch2: BatchTrackingInfo = {
        batchNumber: 21n,
        batchId: 'batch-21',
        blockHeight: 1021n,
        dataResultRoot: '0xbatch21root',
        currentDataResultRoot: '0xcurrent21root',
        validatorRoot: '0xvalidator21root',
        signatures: [],
        dataRequestIds: ['dr-21-1'],
        totalDataRequests: 1,
        isSigned: true,
        chainInfo: {
          network: 'seda-chain',
          blockHeight: 1021n,
          timestamp: Date.now()
        }
      };

      batchService.setMockBatch(batch1);
      batchService.setMockBatch(batch2);
      batchService.setMockDataRequestMapping('dr-20-1', 20n);
      batchService.setMockDataRequestMapping('dr-20-2', 20n);
      batchService.setMockDataRequestMapping('dr-21-1', 21n);

      const foundBatches = await batchService.getBatchesContainingDataRequests(['dr-20-1', 'dr-21-1']);
      expect(foundBatches).toHaveLength(2);
      
      const batchNumbers = foundBatches.map(b => b.batchNumber);
      expect(batchNumbers).toContain(20n);
      expect(batchNumbers).toContain(21n);
    });

    test('should validate batch information', async () => {
      const validBatch: BatchTrackingInfo = {
        batchNumber: 25n,
        batchId: 'batch-25',
        blockHeight: 1025n,
        dataResultRoot: '0xbatch25root',
        currentDataResultRoot: '0xcurrent25root',
        validatorRoot: '0xvalidator25root',
        signatures: [],
        dataRequestIds: ['dr-25-1'],
        totalDataRequests: 1,
        isSigned: true,
        chainInfo: {
          network: 'seda-chain',
          blockHeight: 1025n,
          timestamp: Date.now()
        }
      };

      const invalidBatch: BatchTrackingInfo = {
        ...validBatch,
        batchId: '', // Invalid - empty batch ID
        dataResultRoot: '' // Invalid - empty data result root
      };

      const validResult = await batchService.validateBatch(validBatch);
      expect(validResult).toBe(true);

      const invalidResult = await batchService.validateBatch(invalidBatch);
      expect(invalidResult).toBe(false);
    });

    test('should get batch ranges', async () => {
      const batches: BatchTrackingInfo[] = [];
      
      for (let i = 30; i <= 35; i++) {
        const batch: BatchTrackingInfo = {
          batchNumber: BigInt(i),
          batchId: `batch-${i}`,
          blockHeight: BigInt(1000 + i),
          dataResultRoot: `0xbatch${i}root`,
          currentDataResultRoot: `0xcurrent${i}root`,
          validatorRoot: `0xvalidator${i}root`,
          signatures: [],
          dataRequestIds: [`dr-${i}-1`],
          totalDataRequests: 1,
          isSigned: true,
          chainInfo: {
            network: 'seda-chain',
            blockHeight: BigInt(1000 + i),
            timestamp: Date.now()
          }
        };
        
        batches.push(batch);
        batchService.setMockBatch(batch);
      }

      const rangeBatches = await batchService.getBatchRange(32n, 34n);
      expect(rangeBatches).toHaveLength(3);
      
      const batchNumbers = rangeBatches.map(b => Number(b.batchNumber));
      expect(batchNumbers).toEqual([32, 33, 34]);
    });
  });

  describe('Integration Tests', () => {
    let sedaChainService: MockSEDAChainService;
    let dataRequestTracker: MockDataRequestTracker;
    let batchService: MockBatchService;

    beforeEach(async () => {
      // Initialize SEDA chain service
      sedaChainService = new MockSEDAChainService(loggingService);
      await sedaChainService.initialize({
        rpcEndpoint: 'http://localhost:26657',
        chainId: 'seda-1',
        network: 'testnet'
      });

      // Initialize DataRequest tracker
      dataRequestTracker = new MockDataRequestTracker(loggingService);
      await dataRequestTracker.initialize(sedaChainService);

      // Initialize batch service
      batchService = new MockBatchService(loggingService);
      await batchService.initialize(sedaChainService);
    });

    test('should handle complete DataRequest lifecycle', async () => {
      const drId = 'integration-test-dr';
      const batchNumber = 100n;

      // Setup mock data
      const mockResult: DataRequestResult = {
        drId,
        blockHeight: 2000n,
        exitCode: 0,
        result: Buffer.from('integration test result'),
        consensus: true,
        version: '1.0.0',
        gasUsed: 200000n,
        isCompleted: true,
        batchAssignment: batchNumber
      };

      const mockBatchInfo: BatchInfo = {
        batchNumber,
        batchId: 'integration-batch-100',
        blockHeight: 2001n,
        dataResultRoot: '0xintegrationroot',
        currentDataResultRoot: '0xcurrentintegrationroot',
        validatorRoot: '0xvalidatorintegrationroot',
        dataRequestIds: [drId],
        totalDataRequests: 1,
        signed: true
      };

      const mockBatchTracking: BatchTrackingInfo = {
        batchNumber,
        batchId: 'integration-batch-100',
        blockHeight: 2001n,
        dataResultRoot: '0xintegrationroot',
        currentDataResultRoot: '0xcurrentintegrationroot',
        validatorRoot: '0xvalidatorintegrationroot',
        signatures: [],
        dataRequestIds: [drId],
        totalDataRequests: 1,
        isSigned: true,
        chainInfo: {
          network: 'seda-chain',
          blockHeight: 2001n,
          timestamp: Date.now()
        }
      };

      // Configure mocks
      sedaChainService.setMockDataRequest(drId, mockResult);
      sedaChainService.setMockBatch(mockBatchInfo);
      sedaChainService.setMockBatchAssignment(drId, batchNumber);
      batchService.setMockBatch(mockBatchTracking);
      batchService.setMockDataRequestMapping(drId, batchNumber);

      // Test the lifecycle
      // 1. Check DataRequest completion
      const isCompleted = await sedaChainService.isDataRequestCompleted(drId);
      expect(isCompleted).toBe(true);

      // 2. Get DataRequest result
      const result = await sedaChainService.getDataRequestResult(drId);
      expect(result).toEqual(mockResult);

      // 3. Find batch containing DataRequest
      const foundBatch = await sedaChainService.findDataRequestBatch(drId);
      expect(foundBatch).toEqual(mockBatchInfo);

      // 4. Get batch tracking info
      const batchTracking = await batchService.getBatch(batchNumber);
      expect(batchTracking).toEqual(mockBatchTracking);

      // 5. Validate batch
      const isValid = await batchService.validateBatch(mockBatchTracking);
      expect(isValid).toBe(true);

      // 6. Track DataRequest completion
      await dataRequestTracker.trackDataRequest(drId);
      dataRequestTracker.setMockResult(drId, mockResult);
      dataRequestTracker.setMockBatch(drId, mockBatchInfo);
      
      const events: DataRequestCompletionEvent[] = [];
      dataRequestTracker.onCompletion((event) => {
        events.push(event);
      });

      await dataRequestTracker.simulateCompletion(drId);
      expect(events).toHaveLength(1);
      if (events.length > 0 && events[0]) {
        expect(events[0].status).toBe('batch_assigned');
      }
    });

    test('should handle error scenarios', async () => {
      // Test with non-existent DataRequest
      const nonExistent = await sedaChainService.isDataRequestCompleted('non-existent-dr');
      expect(nonExistent).toBe(false);

      const noResult = await sedaChainService.getDataRequestResult('non-existent-dr');
      expect(noResult).toBeNull();

      const noBatch = await sedaChainService.findDataRequestBatch('non-existent-dr');
      expect(noBatch).toBeNull();

      // Test batch service with non-existent batch
      const noBatchTracking = await batchService.getBatch(999999n);
      expect(noBatchTracking).toBeNull();
    });
  });
});

// Test helpers
function createMockBatchInfo(batchNumber: bigint, dataRequestIds: string[]): BatchInfo {
  return {
    batchNumber,
    batchId: `mock-batch-${batchNumber}`,
    blockHeight: 1000n + batchNumber,
    dataResultRoot: `0xmockroot${batchNumber}`,
    currentDataResultRoot: `0xcurrentmockroot${batchNumber}`,
    validatorRoot: `0xvalidatormockroot${batchNumber}`,
    dataRequestIds,
    totalDataRequests: dataRequestIds.length,
    signed: true
  };
}

function createMockDataRequestResult(drId: string, isCompleted: boolean = true): DataRequestResult {
  return {
    drId,
    blockHeight: 1000n,
    exitCode: isCompleted ? 0 : -1,
    result: Buffer.from(`mock result for ${drId}`),
    consensus: isCompleted,
    version: '1.0.0',
    gasUsed: 100000n,
    isCompleted
  };
}

function createMockBatchTrackingInfo(batchNumber: bigint, dataRequestIds: string[]): BatchTrackingInfo {
  return {
    batchNumber,
    batchId: `mock-tracking-batch-${batchNumber}`,
    blockHeight: 1000n + batchNumber,
    dataResultRoot: `0xtrackingroot${batchNumber}`,
    currentDataResultRoot: `0xcurrenttrackingroot${batchNumber}`,
    validatorRoot: `0xvalidatortrackingroot${batchNumber}`,
    signatures: [],
    dataRequestIds,
    totalDataRequests: dataRequestIds.length,
    isSigned: true,
    chainInfo: {
      network: 'seda-chain',
      blockHeight: 1000n + batchNumber,
      timestamp: Date.now()
    }
  };
}