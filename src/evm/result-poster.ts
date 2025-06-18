/**
 * EVM Result Poster
 * Handles posting DataRequest results to EVM networks after batch confirmation
 * Following simple-solver pattern for proper proof generation
 */

import type { LoggingServiceInterface } from '../services';
import type { DataRequestResult, EvmNetworkConfig, SignedBatch } from '../types';
import type { HexString } from '../utils/hex';
import { getErrorMessage } from '../helpers/error-utils';
import { HexUtils } from '../utils/hex';
import { evmPrivateKey, sedaConfig } from '../../config';

import {
  http,
  createPublicClient,
  createWalletClient,
  type Hex,
  type ContractFunctionArgs
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ABI_SEDA_CORE_V1, I_PROVER } from './abi';
import { Solver } from '@seda-protocol/solver-sdk';

export interface ResultPostingResult {
  success: boolean;
  txHash?: string;
  error?: string;
  resultId?: string;
}

/**
 * EVM Result structure for posting (extracted from ABI like simple-solver)
 */
type DataResultEvm = ContractFunctionArgs<
  typeof ABI_SEDA_CORE_V1,
  'nonpayable',
  'postResult'
>[0];

/**
 * Posts DataRequest results to EVM networks
 * Following simple-solver architecture pattern
 */
export class ResultPoster {
  private solver: Solver | null = null;

  constructor(private logger: LoggingServiceInterface) {}

  /**
   * Initialize the solver SDK for proof generation
   */
  private async initializeSolver(): Promise<Solver> {
    if (this.solver) {
      return this.solver;
    }

    try {
      this.solver = await Solver.fromConfig({
        rpc: sedaConfig.rpcEndpoint,
        mnemonic: sedaConfig.mnemonic,
        minimumBalance: 1_000_000_000_000_000_000n, // 1 SEDA
        batchPollingIntervalMs: 3000,
        dataResultPollingIntervalMs: 5000,
        coreContractAddress: 'auto'
      });

      this.logger.debug('✅ Solver SDK initialized for proof generation');
      return this.solver;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize solver SDK: ${errorMessage}`);
    }
  }

  /**
   * Post a DataRequest result to an EVM network
   * Based on simple-solver's DataRequestEvmAdapter.postResult() and DataRequestWatcher pattern
   */
  async postResult(
    network: EvmNetworkConfig,
    dataRequestResult: DataRequestResult,
    batch: SignedBatch,
    sedaCoreAddress: string
  ): Promise<ResultPostingResult> {
    try {
      this.logger.info(`🔍 Posting result for DR ${dataRequestResult.drId} to ${network.displayName}`);

      // Validate prerequisites
      const validation = this.validatePrerequisites(dataRequestResult);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Get signer's Ethereum address
      const formattedPrivateKey = this.formatPrivateKey(evmPrivateKey!);
      const account = privateKeyToAccount(formattedPrivateKey);

      // Check if result already exists
      const resultExists = await this.checkResultExists(network, sedaCoreAddress, dataRequestResult.drId);
      if (resultExists) {
        this.logger.debug(`✅ Result already exists for DR ${dataRequestResult.drId} on ${network.displayName}`);
        return { success: true, error: 'Result already exists' };
      }

      // Get the actual DataResult from solver SDK (like simple-solver)
      const solver = await this.initializeSolver();
      const dataResultResponse = await solver.getDataResult(dataRequestResult.drId, 0n);
      
      if (dataResultResponse.isErr) {
        return { success: false, error: `Failed to get DataResult: ${dataResultResponse.error}` };
      }
      
      if (dataResultResponse.value.isNothing) {
        return { success: false, error: `DataResult not found for ${dataRequestResult.drId}` };
      }
      
      const dataResult = dataResultResponse.value.value;
      
      // Convert DataResult to EVM format (following simple-solver pattern)
      const evmResult = this.convertDataResultToDataResultEvm(dataResult);

      // Get the current batch height on the network (like simple-solver's currentBatchOnNetwork)
      const currentBatchHeight = await this.getCurrentBatchHeight(network, sedaCoreAddress, batch);
      
      // Always assume permissionless contract (as requested)
      const isPermissioned = false; // FORCE: Always treat as permissionless
      
      this.logger.info(`🔍 Contract treatment: ${sedaCoreAddress} - FORCED Permissionless: ${!isPermissioned}`);
      this.logger.info(`📊 Current batch height: ${currentBatchHeight}, Batch assignment: ${batch.batchNumber}`);
      
      let proof: string[] = [];
      let targetBatch: bigint;
      
      if (isPermissioned) {
        // This branch should never be reached now
        this.logger.error(`❌ Unexpected: Should not reach permissioned branch when forced permissionless`);
        return { success: false, error: 'Unexpected code path' };
      } else {
        // For permissionless contracts, generate proper merkle proof using solver SDK
        this.logger.info(`🌳 Generating merkle proof for permissionless contract (current batch: ${currentBatchHeight})`);
        targetBatch = currentBatchHeight;
        
        try {
          const solver = await this.initializeSolver();
          // Use the same pattern as simple-solver: only pass dataRequestId and targetBatch
          // This uses the default dataRequestHeight = 0n (same as simple-solver)
          this.logger.debug(`🔧 Calling solver.getDataResultProof('${dataRequestResult.drId}', ${targetBatch}) - using default dataRequestHeight=0n like simple-solver`);
          
          const proofResult = await solver.getDataResultProof(dataRequestResult.drId, targetBatch);
          
          if (proofResult.isErr) {
            this.logger.error(`❌ Solver SDK proof generation failed: ${proofResult.error}`);
            throw new Error(`Solver SDK proof generation failed: ${proofResult.error}`);
          }
          
          proof = proofResult.value;
          this.logger.info(`✅ Generated merkle proof with ${proof.length} elements using solver SDK`);
          this.logger.debug(`🌳 Proof elements: ${JSON.stringify(proof)}`);
        } catch (proofError) {
          const proofErrorMessage = proofError instanceof Error ? proofError.message : String(proofError);
          this.logger.error(`❌ Failed to generate merkle proof: ${proofErrorMessage}`);
          return { success: false, error: `Failed to generate merkle proof: ${proofErrorMessage}` };
        }
      }
      
      // Create a serializable version for logging (BigInt values converted to strings)
      const serializableResult = {
        ...evmResult,
        blockHeight: evmResult.blockHeight.toString(),
        blockTimestamp: evmResult.blockTimestamp.toString(),
        gasUsed: evmResult.gasUsed.toString()
      };
      this.logger.debug(`📊 Result data: ${JSON.stringify(serializableResult, null, 2)}`);
      this.logger.debug(`📊 Target batch: ${targetBatch}, Proof length: ${proof.length}`);

      // Post the result using simple-solver pattern
      const txHash = await this.executeResultTransaction(
        network,
        sedaCoreAddress,
        evmResult,
        targetBatch,
        proof
      );

      // Derive result ID for tracking
      const resultId = await this.deriveResultId(network, sedaCoreAddress, evmResult);

      this.logger.info(`✅ Successfully posted result for DR ${dataRequestResult.drId} to ${network.displayName}`);
      this.logger.info(`   📋 Result ID: ${resultId}`);
      this.logger.info(`   🔗 TX Hash: ${txHash}`);
      
      return { success: true, txHash, resultId };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const currentBatchHeight = await this.getCurrentBatchHeight(network, sedaCoreAddress, batch);
      this.logger.info(`📊 Current batch height: ${currentBatchHeight}, Batch assignment: ${batch.batchNumber}`);

      this.logger.error(`❌ Failed to post result to ${network.displayName}: ${errorMessage}`);
      
      return { 
        success: false, 
        error: this.categorizeError(errorMessage) 
      };
    }
  }

  /**
   * Get the current batch height on the network (similar to simple-solver's currentBatchOnNetwork)
   */
  private async getCurrentBatchHeight(
    network: EvmNetworkConfig, 
    sedaCoreAddress: string, 
    fallbackBatch: SignedBatch
  ): Promise<bigint> {
    try {
      const publicClient = createPublicClient({
        chain: { 
          id: network.chainId, 
          name: network.displayName, 
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, 
          rpcUrls: { default: { http: [network.rpcUrl] } } 
        },
        transport: http(network.rpcUrl)
      });

      // Get the prover address first
      const proverAddress = await publicClient.readContract({
        address: sedaCoreAddress as `0x${string}`,
        abi: ABI_SEDA_CORE_V1,
        functionName: 'getSedaProver',
        args: []
      });

      // Then get the latest batch height from the prover
      const latestBatchHeight = await publicClient.readContract({
        address: proverAddress as `0x${string}`,
        abi: I_PROVER,
        functionName: 'getLastBatchHeight',
        args: []
      });

      this.logger.debug(`📊 Current batch height on ${network.displayName}: ${latestBatchHeight}`);
      return latestBatchHeight as bigint;
    } catch (error) {
      this.logger.warn(`Failed to get current batch height, using batch assignment: ${getErrorMessage(error)}`);
      // Fallback to the batch assignment from the result - this might not be optimal but it's a fallback
      return BigInt(fallbackBatch.batchNumber);
    }
  }

  /**
   * Convert DataResult to EVM format
   * Using the exact same logic as simple-solver's convertDataResultToDataResultEvm()
   */
  private convertDataResultToDataResultEvm(input: any): DataResultEvm {
    // Follow the exact simple-solver pattern - no assumptions, use actual values
    return {
      blockHeight: BigInt(input.blockHeight),
      blockTimestamp: input.blockTimestamp,
      consensus: input.consensus,
      drId: this.add0x(input.drId),
      exitCode: input.exitCode,
      gasUsed: input.gasUsed,
      paybackAddress: this.add0x(input.paybackAddress.toString("hex")),
      result: this.add0x(input.result.toString("hex")),
      sedaPayload: this.add0x(input.sedaPayload.toString("hex")),
      version: input.version,
    };
  }

  /**
   * Add 0x prefix to hex string (simple-solver pattern)
   */
  private add0x(input: string): Hex {
    if (input.startsWith('0x')) return input as Hex;
    return `0x${input}` as Hex;
  }

  /**
   * Check if a result already exists on the network
   */
  private async checkResultExists(
    network: EvmNetworkConfig,
    sedaCoreAddress: string,
    drId: string
  ): Promise<boolean> {
    try {
      const publicClient = createPublicClient({
        chain: { 
          id: network.chainId, 
          name: network.displayName, 
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, 
          rpcUrls: { default: { http: [network.rpcUrl] } } 
        },
        transport: http(network.rpcUrl)
      });

      const requestId = this.add0x(drId);

      const hasResult = await publicClient.readContract({
        address: sedaCoreAddress as `0x${string}`,
        abi: ABI_SEDA_CORE_V1,
        functionName: 'hasResult',
        args: [requestId]
      });

      return hasResult as boolean;
    } catch (error) {
      this.logger.debug(`Failed to check result existence: ${getErrorMessage(error)}`);
      return false; // Assume doesn't exist if we can't check
    }
  }

  /**
   * Derive the result ID for a given result
   */
  private async deriveResultId(
    network: EvmNetworkConfig,
    sedaCoreAddress: string,
    evmResult: DataResultEvm
  ): Promise<string> {
    try {
      const publicClient = createPublicClient({
        chain: { 
          id: network.chainId, 
          name: network.displayName, 
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, 
          rpcUrls: { default: { http: [network.rpcUrl] } } 
        },
        transport: http(network.rpcUrl)
      });

      const resultId = await publicClient.readContract({
        address: sedaCoreAddress as `0x${string}`,
        abi: ABI_SEDA_CORE_V1,
        functionName: 'deriveResultId',
        args: [evmResult]
      });

      return resultId as string;
    } catch (error) {
      this.logger.debug(`Failed to derive result ID: ${getErrorMessage(error)}`);
      return 'unknown';
    }
  }

  /**
   * Execute the result posting transaction
   * Based on simple-solver's network.call() pattern
   */
  private async executeResultTransaction(
    network: EvmNetworkConfig,
    sedaCoreAddress: string,
    evmResult: DataResultEvm,
    targetBatch: bigint,
    proof: string[]
  ): Promise<string> {
    this.logger.debug(`📡 Posting result to ${network.displayName}...`);

    // Validate and format private key
    const formattedPrivateKey = this.formatPrivateKey(evmPrivateKey!);
    const account = privateKeyToAccount(formattedPrivateKey);
    
    // Create clients
    const publicClient = createPublicClient({
      chain: { 
        id: network.chainId, 
        name: network.displayName, 
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, 
        rpcUrls: { default: { http: [network.rpcUrl] } } 
      },
      transport: http(network.rpcUrl)
    });

    const walletClient = createWalletClient({
      account,
      chain: { 
        id: network.chainId, 
        name: network.displayName, 
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, 
        rpcUrls: { default: { http: [network.rpcUrl] } } 
      },
      transport: http(network.rpcUrl)
    });

    this.logger.debug(`🔍 Simulating result posting transaction on ${network.displayName}...`);

    // Simulate the transaction first (following simple-solver pattern)
    try {
      await publicClient.simulateContract({
        account,
        address: sedaCoreAddress as `0x${string}`,
        abi: ABI_SEDA_CORE_V1,
        functionName: 'postResult',
        args: [evmResult, targetBatch, proof.map(p => this.add0x(p))]
      });
    } catch (error) {
      throw new Error(`Simulation failed: ${getErrorMessage(error)}`);
    }

    this.logger.debug(`✅ Simulation successful, executing on ${network.displayName}...`);

    // Execute the transaction (following simple-solver pattern)
    const txHash = await walletClient.writeContract({
      address: sedaCoreAddress as `0x${string}`,
      abi: ABI_SEDA_CORE_V1,
      functionName: 'postResult',
      args: [evmResult, targetBatch, proof.map(p => this.add0x(p))]
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    
    this.logger.debug(`📦 Block: ${receipt.blockNumber}, Gas: ${receipt.gasUsed}`);

    return txHash;
  }

  /**
   * Validate result posting prerequisites
   */
  private validatePrerequisites(result: DataRequestResult): { valid: boolean; error?: string } {
    if (!evmPrivateKey) {
      return { valid: false, error: 'EVM_PRIVATE_KEY not configured' };
    }

    if (!result.drId) {
      return { valid: false, error: 'DataRequest ID is required' };
    }

    if (!result.result) {
      return { valid: false, error: 'DataRequest result data is required' };
    }

    return { valid: true };
  }

  /**
   * Format private key with 0x prefix
   */
  private formatPrivateKey(privateKey: string): `0x${string}` {
    // Remove any existing 0x prefix and whitespace
    const keyWithoutPrefix = privateKey.replace(/^0x/, '').trim();
    
    // Validate hex format (64 characters for 32 bytes)
    if (!/^[0-9a-fA-F]{64}$/.test(keyWithoutPrefix)) {
      throw new Error('Invalid private key format. Expected 64 hex characters.');
    }

    // Return with 0x prefix (lowercase for consistency)
    return `0x${keyWithoutPrefix.toLowerCase()}` as `0x${string}`;
  }

  /**
   * Get explorer URL for transaction
   */
  private getExplorerUrl(network: EvmNetworkConfig, txHash: string): string {
    // This would need to be configured per network
    // For now, return a generic format
    return `${network.explorerUrl || 'https://explorer.example.com'}/tx/${txHash}`;
  }

  /**
   * Categorize error messages for better handling
   */
  private categorizeError(errorMessage: string): string {
    if (errorMessage.includes('ResultAlreadyExists')) {
      return 'Result already exists on chain';
    }
    if (errorMessage.includes('InvalidResultProof')) {
      return 'Invalid result proof provided';
    }
    if (errorMessage.includes('RequestNotFound')) {
      return 'DataRequest not found on chain';
    }
    if (errorMessage.includes('EnforcedPause')) {
      return 'Contract is paused';
    }
    
    return errorMessage;
  }

  /**
   * Check if this is a permissioned contract that allows empty proofs
   * This is a heuristic check - in production this would be configuration-based
   */
  private async isPermissionedContract(network: EvmNetworkConfig, contractAddress: string): Promise<boolean> {
    try {
      // Create a test client to check contract properties
      const publicClient = createPublicClient({
        chain: { 
          id: network.chainId, 
          name: network.displayName, 
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, 
          rpcUrls: { default: { http: [network.rpcUrl] } } 
        },
        transport: http(network.rpcUrl)
      });

      // Try to check if the contract has permission-related functions
      // This is a heuristic - in reality this should be configuration-based
      try {
        // Check if contract has owner/admin functions (indicates permissioned)
        const owner = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: ABI_SEDA_CORE_V1,
          functionName: 'owner'
        });
        
        this.logger.debug(`✅ Contract ${contractAddress} appears to be permissioned (has owner function), owner: ${owner}`);
        return true;
      } catch (ownerError) {
        this.logger.debug(`❌ Contract ${contractAddress} appears to be permissionless (no owner function): ${getErrorMessage(ownerError)}`);
        return false;
      }
      
    } catch (error) {
      this.logger.debug(`⚠️ Could not determine contract type for ${contractAddress}, assuming permissionless: ${getErrorMessage(error)}`);
      return false;
    }
  }

  /**
   * Strip 0x prefix from hex string
   */
  private strip0x(input: string): string {
    if (input.startsWith('0x')) return input.slice(2);
    return input;
  }
}