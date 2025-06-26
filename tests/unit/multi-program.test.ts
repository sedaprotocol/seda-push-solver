/**
 * Multi-Program Parallel Execution Test
 * Tests the new multi-program functionality for parallel oracle program execution
 */

import { getOracleProgramIds } from '../../src/config/seda';
import { SEDADataRequestBuilder } from '../../src/core/data-request';
import { createMockSEDAConfig, setupMockEnvironment, cleanupMockEnvironment } from '../mocks';

describe('Multi-Program Parallel Execution', () => {
  beforeEach(() => {
    setupMockEnvironment();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  test('should parse multiple oracle program IDs from environment', () => {
    // Set up test environment with multiple programs
    process.env.SEDA_ORACLE_PROGRAM_IDS = 'program-1,program-2,program-3';
    
    const programIds = getOracleProgramIds();
    
    expect(programIds).toHaveLength(3);
    expect(programIds).toEqual(['program-1', 'program-2', 'program-3']);
  });

  test('should handle single program ID (legacy support)', () => {
    // Set up test environment with single program
    process.env.SEDA_ORACLE_PROGRAM_IDS = 'single-program';
    
    const programIds = getOracleProgramIds();
    
    expect(programIds).toHaveLength(1);
    expect(programIds).toEqual(['single-program']);
  });

  test('should handle comma-separated IDs with whitespace', () => {
    // Set up test environment with programs that have whitespace
    process.env.SEDA_ORACLE_PROGRAM_IDS = ' program-1 , program-2 , program-3 ';
    
    const programIds = getOracleProgramIds();
    
    expect(programIds).toHaveLength(3);
    expect(programIds).toEqual(['program-1', 'program-2', 'program-3']);
  });

  test('should filter out empty program IDs', () => {
    // Set up test environment with empty entries
    process.env.SEDA_ORACLE_PROGRAM_IDS = 'program-1,,program-2,   ,program-3';
    
    const programIds = getOracleProgramIds();
    
    expect(programIds).toHaveLength(3);
    expect(programIds).toEqual(['program-1', 'program-2', 'program-3']);
  });

  test('should throw error when no program IDs provided', () => {
    // Remove the environment variable
    delete process.env.SEDA_ORACLE_PROGRAM_IDS;
    
    expect(() => {
      getOracleProgramIds();
    }).toThrow('SEDA_ORACLE_PROGRAM_IDS environment variable is required');
  });

  test('should throw error when only empty values provided', () => {
    // Set up test environment with only empty values
    process.env.SEDA_ORACLE_PROGRAM_IDS = ' ,  , ';
    
    expect(() => {
      getOracleProgramIds();
    }).toThrow('No valid Oracle Program IDs found in SEDA_ORACLE_PROGRAM_IDS');
  });

  test('should create builder with multi-program support', async () => {
    // Clean up any existing environment
    cleanupMockEnvironment();
    
    // Set up test environment with specific program IDs
    process.env.SEDA_ORACLE_PROGRAM_IDS = 'program-1,program-2';
    process.env.SEDA_MNEMONIC = 'test mnemonic';
    process.env.SEDA_NETWORK = 'testnet';
    
    // Create config directly from environment rather than using mock
    const { loadSEDAConfig } = require('../../src/config/seda');
    const config = loadSEDAConfig();
    
    const mockLogger = { 
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };
    
    const builder = new SEDADataRequestBuilder(config, mockLogger);
    
    expect(builder).toBeDefined();
    expect(builder.getConfig().oracleProgramId).toBe('program-1'); // Should use first program for legacy compatibility
  });

  test('should validate network configuration includes multiple program IDs', () => {
    // Set up test environment
    process.env.SEDA_ORACLE_PROGRAM_IDS = 'program-1,program-2,program-3';
    
    // Import and get network config after setting env var
    const { getSedaNetworkConfig } = require('../../src/config/seda');
    const networkConfig = getSedaNetworkConfig('testnet');
    
    expect(networkConfig.dataRequest.oracleProgramId).toBe('program-1');
    expect(networkConfig.dataRequest.oracleProgramIds).toEqual(['program-1', 'program-2', 'program-3']);
  });
}); 