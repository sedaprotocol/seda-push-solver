/**
 * SEDA Protocol Service Interface
 * Abstracts all interactions with the SEDA protocol for better testability and decoupling
 */

import type { Signer } from '@seda-protocol/dev-tools';
import type { PostDataRequestInput, GasOptions } from '@seda-protocol/dev-tools';
import type { SEDAConfig, DataRequestResult } from '../types';

/**
 * Interface for SEDA protocol operations
 * Allows mocking and testing of SEDA interactions without actual network calls
 */
export interface ISEDAService {
  /**
   * Create and initialize a SEDA signer from configuration
   */
  createSigner(config: SEDAConfig): Promise<Signer>;

  /**
   * Post a DataRequest to the SEDA network and await the result
   */
  postAndAwaitDataRequest(
    signer: Signer,
    input: PostDataRequestInput,
    gasOptions: GasOptions,
    awaitOptions: { timeoutSeconds: number; pollingIntervalSeconds: number }
  ): Promise<{
    version: string;
    drId: string;
    drBlockHeight: bigint;
    consensus: boolean;
    exitCode: number;
    result: string;
    resultAsUtf8: string;
    blockHeight: bigint;
    blockTimestamp: Date;
    gasUsed: bigint;
    paybackAddress: string;
    sedaPayload: string;
  }>;

  /**
   * Check if a signer is valid and ready to use
   */
  validateSigner(signer: Signer): boolean;
}

/**
 * Production implementation of SEDA service using actual SEDA protocol
 */
export class SEDAService implements ISEDAService {
  async createSigner(config: SEDAConfig): Promise<Signer> {
    // Dynamic import to avoid issues with module loading
    const { buildSigningConfig, Signer } = await import('@seda-protocol/dev-tools');
    
    const signingConfig = buildSigningConfig({
      mnemonic: config.mnemonic!,
      rpc: config.rpcEndpoint
      // contract field omitted - will auto-detect or use SEDA_CORE_CONTRACT env var
    });
    
    return await Signer.fromPartial(signingConfig);
  }

  async postAndAwaitDataRequest(
    signer: Signer,
    input: PostDataRequestInput,
    gasOptions: GasOptions,
    awaitOptions: { timeoutSeconds: number; pollingIntervalSeconds: number }
  ) {
    const { postAndAwaitDataRequest } = await import('@seda-protocol/dev-tools');
    
    return await postAndAwaitDataRequest(signer, input, gasOptions, awaitOptions);
  }

  validateSigner(signer: Signer): boolean {
    return signer !== null && signer !== undefined;
  }
}

/**
 * Mock implementation for testing
 */
export class MockSEDAService implements ISEDAService {
  private mockResults: Map<string, any> = new Map();

  async createSigner(config: SEDAConfig): Promise<Signer> {
    // Return a mock signer object
    return { 
      address: 'mock-address',
      mnemonic: config.mnemonic 
    } as any;
  }

  async postAndAwaitDataRequest(
    signer: Signer,
    input: PostDataRequestInput,
    gasOptions: GasOptions,
    awaitOptions: { timeoutSeconds: number; pollingIntervalSeconds: number }
  ) {
    // Return mock result matching the actual SEDA protocol response
    return {
      version: '1.0.0',
      drId: 'mock-dr-id-' + Date.now(),
      drBlockHeight: BigInt(12345),
      consensus: true,
      exitCode: 0,
      result: '0x1234567890abcdef',
      resultAsUtf8: 'mock-result',
      blockHeight: BigInt(12345),
      blockTimestamp: new Date(),
      gasUsed: BigInt(100000),
      paybackAddress: 'mock-payback-address',
      sedaPayload: 'mock-seda-payload'
    };
  }

  validateSigner(signer: Signer): boolean {
    return true; // Mock signer is always valid
  }

  /**
   * Set mock result for testing specific scenarios
   */
  setMockResult(key: string, result: any): void {
    this.mockResults.set(key, result);
  }
} 