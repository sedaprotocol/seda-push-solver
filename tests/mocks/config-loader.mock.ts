/**
 * Mock Config Loader for Testing
 * Provides test configuration without requiring environment variables
 */

import type { SEDAConfig, NetworkType } from '../../src/types';

/**
 * Mock SEDA configuration for testing
 */
export function createMockSEDAConfig(overrides: Partial<SEDAConfig> = {}): SEDAConfig {
  return {
    rpcEndpoint: 'https://rpc.testnet.seda.xyz',
    network: 'testnet' as NetworkType,
    mnemonic: 'test mnemonic for testing purposes only',
    ...overrides
  };
}

/**
 * Mock Oracle Program ID for testing
 */
export function getMockOracleProgramId(): string {
  return 'test-oracle-program-id-for-testing-only';
}

/**
 * Set up mock environment variables for testing
 */
export function setupMockEnvironment(): void {
  process.env.SEDA_ORACLE_PROGRAM_ID = getMockOracleProgramId();
  process.env.SEDA_MNEMONIC = 'test mnemonic for testing purposes only';
  process.env.SEDA_NETWORK = 'testnet';
}

/**
 * Clean up mock environment variables after testing
 */
export function cleanupMockEnvironment(): void {
  delete process.env.SEDA_ORACLE_PROGRAM_ID;
  delete process.env.SEDA_MNEMONIC;
  delete process.env.SEDA_NETWORK;
} 