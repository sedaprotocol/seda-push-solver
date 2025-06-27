/**
 * EVM Result Poster
 * Handles posting DataRequest results to EVM networks after batch confirmation
 * Refactored to use extracted processing and validation modules
 */

import type { LoggingServiceInterface } from '../services';
import type { DataRequestResult, EvmNetworkConfig, SignedBatch } from '../types';
import { getErrorMessage } from '../helpers/error-utils';
import { evmPrivateKey } from '../../config';
import { loadSEDAConfig } from '../config/seda';

import { Solver } from '@seda-protocol/solver-sdk';

// Validation modules
import { validateResultPostingPrerequisites } from './result-validation';
import { checkResultExists } from './result-validation';

// Processing modules
import { getCurrentBatchHeight } from './result-processing';
import { convertDataResultToDataResultEvm, type DataResultEvm } from './result-processing';
import { executeResultTransaction } from './result-processing';
import { deriveResultId } from './result-processing';
import { categorizeResultPostingError } from './result-processing';
import type { EvmNonceCoordinator } from './nonce-coordinator';

export interface ResultPostingResult {
  success: boolean;
  txHash?: string;
  error?: string;
  resultId?: string;
}

/**
 * Posts DataRequest results to EVM networks
 * Refactored to use extracted processing modules
 */
export class ResultPoster {
  private solver: Solver | null = null;

  constructor(private logger: LoggingServiceInterface) {}

  /**
   * Generate a hash of the proof for comparison purposes
   */
  private hashProof(proof: string[]): string {
    const crypto = require('crypto');
    const proofString = proof.join(',');
    return crypto.createHash('sha256').update(proofString).digest('hex').substring(0, 16);
  }

  /**
   * Log detailed proof analysis for debugging
   */
  private logProofAnalysis(
    dataRequestResult: DataRequestResult,
    dataResult: any,
    assignedBatchNumber: number,
    assignedBatch: SignedBatch,
    proof: string[],
    status: 'BEFORE_POSTING' | 'SUCCESS' | 'FAILURE'
  ): void {
    this.logger.info(`🔍 PROOF ANALYSIS [${status}] for DR ${dataRequestResult.drId}:`);
    this.logger.info(`   📋 DR ID: ${dataRequestResult.drId}`);
    this.logger.info(`   🆔 Result ID: ${dataResult.id}`);
    this.logger.info(`   📦 Assigned Batch: ${assignedBatchNumber}`);
    this.logger.info(`   📊 Batch Entries: ${assignedBatch.dataResultEntries?.length || 0}`);
    this.logger.info(`   🌳 Proof Length: ${proof.length}`);
    this.logger.info(`   🌳 Proof Hash: ${this.hashProof(proof)}`);
    this.logger.info(`   ⏰ Timestamp: ${new Date().toISOString()}`);
    
    // Log batch entries for analysis
    if (assignedBatch.dataResultEntries && assignedBatch.dataResultEntries.length > 0) {
      this.logger.info(`   📋 Batch Entries:`);
      assignedBatch.dataResultEntries.forEach((entry, index) => {
        const entryHex = Buffer.isBuffer(entry) ? entry.toString('hex') : Array.from(entry as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');
        this.logger.info(`      ${index}: ${entryHex} ${entryHex === dataResult.id ? '← THIS RESULT' : ''}`);
      });
    }
    
    // Log individual proof elements for detailed analysis
    this.logger.info(`   🌳 Proof Elements:`);
    proof.forEach((element, index) => {
      this.logger.info(`      ${index}: ${element}`);
    });
  }

  /**
   * Initialize the solver SDK for proof generation
   */
  private async initializeSolver(): Promise<Solver> {
    if (this.solver) {
      return this.solver;
    }

    try {
      const config = loadSEDAConfig();
      this.solver = await Solver.fromConfig({
        rpc: config.rpcEndpoint,
        mnemonic: config.mnemonic,
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
   * Simplified main method using extracted modules
   */
  async postResult(
    network: EvmNetworkConfig,
    dataRequestResult: DataRequestResult,
    batch: SignedBatch,
    sedaCoreAddress: string
  ): Promise<ResultPostingResult> {
    // LEGACY METHOD - to be deprecated in favor of postResultWithNonce
    try {
      this.logger.info(`🔍 Posting result for DR ${dataRequestResult.drId} to ${network.displayName}`);
      this.logger.info(`   📋 DR ID: ${dataRequestResult.drId}`);
      this.logger.info(`   🎯 Contract: ${sedaCoreAddress}`);
      this.logger.info(`   📦 Batch: ${batch.batchNumber}`);

      // Validate prerequisites using extracted validator
      const validation = validateResultPostingPrerequisites(dataRequestResult, evmPrivateKey);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // TEMPORARILY DISABLE existence check to force result posting
      // The existence check is giving false positives, so let's bypass it for now
      this.logger.info(`📝 FORCING result posting for DR ${dataRequestResult.drId} to ${network.displayName} (existence check bypassed)`);
      
      // TODO: Fix the result existence check - it's incorrectly reporting results as existing
      // const resultExists = await checkResultExists(network, sedaCoreAddress, dataRequestResult.drId, this.logger);
      // if (resultExists) {
      //   this.logger.info(`✅ Result already exists for DR ${dataRequestResult.drId} on ${network.displayName} - skipping posting`);
      //   return { success: true, error: 'Result already exists' };
      // }

      // Get the actual DataResult from solver SDK at the correct block height
      const solver = await this.initializeSolver();
      const dataResultResponse = await solver.getDataResult(dataRequestResult.drId, dataRequestResult.drBlockHeight);
      
      if (dataResultResponse.isErr) {
        return { success: false, error: `Failed to get DataResult: ${dataResultResponse.error}` };
      }
      
      if (dataResultResponse.value.isNothing) {
        return { success: false, error: `DataResult not found for ${dataRequestResult.drId}` };
      }
      
      const dataResult = dataResultResponse.value.value;
      
      // DEBUG: Log the actual data result ID vs DR ID to understand the difference
      this.logger.info(`🔍 DEBUG: Data Request ID (drId): ${dataRequestResult.drId}`);
      this.logger.info(`🔍 DEBUG: Data Result ID (dataResult.id): ${dataResult.id}`);
      this.logger.info(`🔍 DEBUG: Data Result drId field: ${dataResult.drId}`);
      this.logger.info(`🔍 DEBUG: Are DR ID and Result ID the same? ${dataRequestResult.drId === dataResult.id}`);
      this.logger.info(`🔍 DEBUG: Are DR ID and Result drId the same? ${dataRequestResult.drId === dataResult.drId}`);
      
      // Convert DataResult to EVM format using extracted converter
      const evmResult = convertDataResultToDataResultEvm(dataResult);

      // CRITICAL: Always use the assigned batch from the DataResult, not the passed batch parameter
      const assignedBatchNumber = dataResult.batchAssignment;
      this.logger.info(`🎯 DataRequest assigned to batch: ${assignedBatchNumber}`);
      this.logger.info(`📦 Passed batch parameter: ${batch.batchNumber}`);
      
      // Fetch the actual assigned batch if it's different from the passed batch
      let assignedBatch: SignedBatch;
      if (assignedBatchNumber === batch.batchNumber) {
        this.logger.info(`✅ Using passed batch ${batch.batchNumber} (matches assignment)`);
        assignedBatch = batch;
      } else {
        this.logger.info(`🔄 Fetching assigned batch ${assignedBatchNumber} (different from passed batch ${batch.batchNumber})`);
        
        // Fetch the assigned batch from solver SDK
        const solver = await this.initializeSolver();
        const batchResponse = await solver.getBatch(BigInt(assignedBatchNumber));
        
        if (batchResponse.isErr) {
          return { success: false, error: `Failed to fetch assigned batch ${assignedBatchNumber}: ${batchResponse.error}` };
        }
        
        if (batchResponse.value.isNothing) {
          return { success: false, error: `Assigned batch ${assignedBatchNumber} not found` };
        }
        
        // Convert solver SDK batch to SignedBatch format
        const solverBatch = batchResponse.value.value;
        assignedBatch = {
          batchNumber: BigInt(solverBatch.batchNumber),
          batchId: solverBatch.batchId || '',
          blockHeight: BigInt(solverBatch.blockHeight || 0),
          currentDataResultRoot: solverBatch.currentDataResultRoot || '',
          dataResultRoot: solverBatch.dataResultRoot || '',
          validatorRoot: solverBatch.validatorRoot || '',
          dataResultEntries: solverBatch.dataResultEntries || []
        };
        
        this.logger.info(`✅ Fetched assigned batch ${assignedBatchNumber} with ${assignedBatch.dataResultEntries?.length || 0} entries`);
      }
      
      // Get the current batch height for reference
      const currentBatchHeight = await getCurrentBatchHeight(network, sedaCoreAddress, assignedBatch, this.logger);
      
      // Always assume permissionless contract (as requested)
      const isPermissioned = false; // FORCE: Always treat as permissionless
      
      this.logger.info(`🔍 Contract treatment: ${sedaCoreAddress} - FORCED Permissionless: ${!isPermissioned}`);
      this.logger.info(`📊 Current batch height: ${currentBatchHeight}, Assigned batch: ${assignedBatchNumber}`);
      
      let proof: string[] = [];
      // IMPORTANT: Use the assigned batch number from DataResult
      const targetBatch = BigInt(assignedBatchNumber);
      
      // For permissionless contracts, generate proper merkle proof using solver SDK
      this.logger.info(`🌳 Generating merkle proof for assigned batch: ${targetBatch} (DataRequest batch assignment)`);
      
      try {
        const solver = await this.initializeSolver();
        this.logger.debug(`🔧 Calling solver.getDataResultProof('${dataRequestResult.drId}', ${targetBatch}) - using default dataRequestHeight=0n like simple-solver`);
        
        // DEBUG: Let's also check what the solver SDK will use for the proof
        this.logger.info(`🔍 DEBUG: About to generate proof for DR ID: ${dataRequestResult.drId}`);
        this.logger.info(`🔍 DEBUG: The solver SDK will internally use dataResult.id: ${dataResult.id} for the merkle leaf`);
        
        // DEBUG: Get what the EVM contract thinks the result ID should be
        try {
          const contractDerivedResultId = await deriveResultId(network, sedaCoreAddress, evmResult, this.logger);
          this.logger.info(`🔍 DEBUG: Contract-derived result ID: ${contractDerivedResultId}`);
          this.logger.info(`🔍 DEBUG: Does solver SDK result ID match contract? ${dataResult.id === contractDerivedResultId}`);
          this.logger.info(`🔍 DEBUG: Contract error showed result ID: 0xf080b7445b4d5dbbf84d3b5d9224a13bd2f01a88e4b97e4b41f5371b505be37b`);
          this.logger.info(`🔍 DEBUG: Does contract-derived match error ID? ${contractDerivedResultId === '0xf080b7445b4d5dbbf84d3b5d9224a13bd2f01a88e4b97e4b41f5371b505be37b'}`);
        } catch (deriveError) {
          this.logger.warn(`⚠️ Could not derive result ID from contract: ${getErrorMessage(deriveError)}`);
        }
        
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
      
      // Log result data for debugging
      const serializableResult = {
        ...evmResult,
        blockHeight: evmResult.blockHeight.toString(),
        blockTimestamp: evmResult.blockTimestamp.toString(),
        gasUsed: evmResult.gasUsed.toString()
      };
      this.logger.debug(`📊 Result data: ${JSON.stringify(serializableResult, null, 2)}`);
      this.logger.debug(`📊 Target batch: ${targetBatch}, Proof length: ${proof.length}`);

      // Execute the transaction using extracted executor
      const txHash = await executeResultTransaction(
        network,
        evmPrivateKey!,
        sedaCoreAddress,
        evmResult,
        targetBatch,
        proof,
        this.logger
      );

      // Derive result ID for tracking using extracted deriver
      const resultId = await deriveResultId(network, sedaCoreAddress, evmResult, this.logger);

      this.logger.info(`✅ Successfully posted result for DR ${dataRequestResult.drId} to ${network.displayName}`);
      this.logger.info(`   📋 Result ID: ${resultId}`);
      this.logger.info(`   🔗 TX Hash: ${txHash}`);
      
      return { success: true, txHash, resultId };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to post result to ${network.displayName}: ${errorMessage}`);
      
      return { 
        success: false, 
        error: categorizeResultPostingError(errorMessage)
      };
    }
  }

  /**
   * Post a DataRequest result to an EVM network with nonce coordination
   * Enhanced version for parallel posting
   */
  async postResultWithNonce(
    network: EvmNetworkConfig,
    dataRequestResult: DataRequestResult,
    batch: SignedBatch,
    sedaCoreAddress: string,
    nonceCoordinator: EvmNonceCoordinator
  ): Promise<ResultPostingResult> {
    let nonceReservation: { 
      nonce: number; 
      gasPrice: bigint; 
      isReplacement: boolean; 
      updateHash: (hash: any) => void; 
      release: () => void; 
    } | null = null;
    let dataResult: any = null;
    let assignedBatch: SignedBatch | null = null;
    let assignedBatchNumber: number | undefined = undefined;
    let proof: string[] = [];
    
    try {
      this.logger.info(`🔍 Posting result for DR ${dataRequestResult.drId} to ${network.displayName} (with nonce coordination)`);
      this.logger.info(`   📋 DR ID: ${dataRequestResult.drId}`);
      this.logger.info(`   🎯 Contract: ${sedaCoreAddress}`);
      this.logger.info(`   📦 Batch: ${batch.batchNumber}`);

      // Validate prerequisites using extracted validator
      const validation = validateResultPostingPrerequisites(dataRequestResult, evmPrivateKey);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // TEMPORARILY DISABLE existence check to force result posting
      // The existence check is giving false positives, so let's bypass it for now
      this.logger.info(`📝 FORCING result posting for DR ${dataRequestResult.drId} to ${network.displayName} (existence check bypassed)`);

      // Get the actual DataResult from solver SDK at the correct block height
      const solver = await this.initializeSolver();
      const dataResultResponse = await solver.getDataResult(dataRequestResult.drId, dataRequestResult.drBlockHeight);
      
      if (dataResultResponse.isErr) {
        return { success: false, error: `Failed to get DataResult: ${dataResultResponse.error}` };
      }
      
      if (dataResultResponse.value.isNothing) {
        return { success: false, error: `DataResult not found for ${dataRequestResult.drId}` };
      }

      dataResult = dataResultResponse.value.value;
      
      // DEBUG: Log the actual data result ID vs DR ID to understand the difference
      this.logger.info(`🔍 DEBUG: Data Request ID (drId): ${dataRequestResult.drId}`);
      this.logger.info(`🔍 DEBUG: Data Result ID (dataResult.id): ${dataResult.id}`);
      this.logger.info(`🔍 DEBUG: Data Result drId field: ${dataResult.drId}`);
      this.logger.info(`🔍 DEBUG: Are DR ID and Result ID the same? ${dataRequestResult.drId === dataResult.id}`);
      this.logger.info(`🔍 DEBUG: Are DR ID and Result drId the same? ${dataRequestResult.drId === dataResult.drId}`);
      
      // Convert DataResult to EVM format using extracted converter
      const evmResult = convertDataResultToDataResultEvm(dataResult);

      // CRITICAL: Always use the assigned batch from the DataResult, not the passed batch parameter
      assignedBatchNumber = dataResult.batchAssignment;
      this.logger.info(`🎯 DataRequest assigned to batch: ${assignedBatchNumber}`);
      this.logger.info(`📦 Passed batch parameter: ${batch.batchNumber}`);

      // Fetch the actual assigned batch if it's different from the passed batch
      if (assignedBatchNumber === Number(batch.batchNumber)) {
        this.logger.info(`✅ Using passed batch ${batch.batchNumber} (matches assignment)`);
        assignedBatch = batch;
      } else {
        this.logger.info(`🔄 Fetching assigned batch ${assignedBatchNumber} (different from passed batch ${batch.batchNumber})`);
        
        // Fetch the assigned batch from solver SDK
        const solver = await this.initializeSolver();
        const batchResponse = await solver.getBatch(BigInt(assignedBatchNumber!));
        
        if (batchResponse.isErr) {
          return { success: false, error: `Failed to fetch assigned batch ${assignedBatchNumber}: ${batchResponse.error}` };
        }
        
        if (batchResponse.value.isNothing) {
          return { success: false, error: `Assigned batch ${assignedBatchNumber} not found` };
        }
        
        // Convert solver SDK batch to SignedBatch format
        const solverBatch = batchResponse.value.value;
        assignedBatch = {
          batchNumber: BigInt(solverBatch.batchNumber),
          batchId: solverBatch.batchId || '',
          blockHeight: BigInt(solverBatch.blockHeight || 0),
          currentDataResultRoot: solverBatch.currentDataResultRoot || '',
          dataResultRoot: solverBatch.dataResultRoot || '',
          validatorRoot: solverBatch.validatorRoot || '',
          dataResultEntries: solverBatch.dataResultEntries || []
        };
        
        this.logger.info(`✅ Fetched assigned batch ${assignedBatchNumber} with ${assignedBatch.dataResultEntries?.length || 0} entries`);
      }
      
      // Get the current batch height for reference
      const currentBatchHeight = await getCurrentBatchHeight(network, sedaCoreAddress, assignedBatch, this.logger);
      
      // Always assume permissionless contract (as requested)
      const isPermissioned = false; // FORCE: Always treat as permissionless
      
      this.logger.info(`🔍 Contract treatment: ${sedaCoreAddress} - FORCED Permissionless: ${!isPermissioned}`);
      this.logger.info(`📊 Current batch height: ${currentBatchHeight}, Assigned batch: ${assignedBatchNumber}`);
      
      // IMPORTANT: Use the assigned batch number from DataResult
      const targetBatch = BigInt(assignedBatchNumber!);
      
      // For permissionless contracts, generate proper merkle proof using solver SDK
      this.logger.info(`🌳 Generating merkle proof for assigned batch: ${targetBatch} (DataRequest batch assignment)`);
      
      try {
        const solver = await this.initializeSolver();
        this.logger.debug(`🔧 Calling solver.getDataResultProof('${dataRequestResult.drId}', ${targetBatch}) - using default dataRequestHeight=0n like simple-solver`);
        
        // DEBUG: Let's also check what the solver SDK will use for the proof
        this.logger.info(`🔍 DEBUG: About to generate proof for DR ID: ${dataRequestResult.drId}`);
        this.logger.info(`🔍 DEBUG: The solver SDK will internally use dataResult.id: ${dataResult.id} for the merkle leaf`);
        
        // DEBUG: Get what the EVM contract thinks the result ID should be
        try {
          const contractDerivedResultId = await deriveResultId(network, sedaCoreAddress, evmResult, this.logger);
          this.logger.info(`🔍 DEBUG: Contract-derived result ID: ${contractDerivedResultId}`);
          this.logger.info(`🔍 DEBUG: Does solver SDK result ID match contract? ${dataResult.id === contractDerivedResultId}`);
          this.logger.info(`🔍 DEBUG: Contract error showed result ID: 0xf080b7445b4d5dbbf84d3b5d9224a13bd2f01a88e4b97e4b41f5371b505be37b`);
          this.logger.info(`🔍 DEBUG: Does contract-derived match error ID? ${contractDerivedResultId === '0xf080b7445b4d5dbbf84d3b5d9224a13bd2f01a88e4b97e4b41f5371b505be37b'}`);
        } catch (deriveError) {
          this.logger.warn(`⚠️ Could not derive result ID from contract: ${getErrorMessage(deriveError)}`);
        }
        
        const proofResult = await solver.getDataResultProof(dataRequestResult.drId, targetBatch);
        
        if (proofResult.isErr) {
          this.logger.error(`❌ Solver SDK proof generation failed: ${proofResult.error}`);
          throw new Error(`Solver SDK proof generation failed: ${proofResult.error}`);
        }
        
        proof = proofResult.value;
        this.logger.info(`✅ Generated merkle proof with ${proof.length} elements using solver SDK`);
        this.logger.debug(`🌳 Proof elements: ${JSON.stringify(proof)}`);

        // Log detailed proof analysis before posting
        this.logProofAnalysis(dataRequestResult, dataResult, assignedBatchNumber!, assignedBatch, proof, 'BEFORE_POSTING');

      } catch (proofError) {
        const proofErrorMessage = proofError instanceof Error ? proofError.message : String(proofError);
        this.logger.error(`❌ Failed to generate merkle proof: ${proofErrorMessage}`);
        return { success: false, error: `Failed to generate merkle proof: ${proofErrorMessage}` };
      }

      // Attempt to post with automatic nonce failure recovery
      const maxRetries = 3;
      let attempt = 0;
      
      while (attempt < maxRetries) {
        try {
          // Reserve nonce for this transaction
          this.logger.info(`🔢 Reserving nonce for ${network.displayName} transaction (DR: ${dataRequestResult.drId}) - Attempt ${attempt + 1}`);
          
          if (attempt === 0) {
            // First attempt: use normal nonce reservation
            nonceReservation = await nonceCoordinator.reserveNonce(network, evmPrivateKey);
            this.logger.info(`🔢 Reserved ${nonceReservation.isReplacement ? 'replacement' : 'new'} nonce ${nonceReservation.nonce} for ${network.displayName} (DR: ${dataRequestResult.drId})`);
          } else {
            // Retry attempts: use nonce failure recovery
            const errorMsg = `Retry attempt ${attempt} after nonce failure`;
            const previousNonce = (nonceReservation as any)?.nonce ?? 0;
            const recoveryResult = await nonceCoordinator.handleNonceFailure(network, evmPrivateKey, previousNonce, errorMsg);
            nonceReservation = {
              nonce: recoveryResult.nonce,
              gasPrice: recoveryResult.gasPrice,
              updateHash: recoveryResult.updateHash,
              release: recoveryResult.release,
              isReplacement: true // Mark as replacement for retry attempts
            };
            this.logger.info(`🔢 Recovered with fresh nonce ${nonceReservation.nonce} for ${network.displayName} (DR: ${dataRequestResult.drId})`);
          }
          
          // Debug: Log nonce coordinator status
          const nonceStatus = nonceCoordinator.getComprehensiveStatus();
          const networkKey = `${network.chainId}-${evmPrivateKey.toLowerCase()}`;
          const networkStatus = nonceStatus[networkKey];
          
          if (networkStatus) {
            this.logger.debug(`🔍 Nonce status for ${network.displayName}: confirmed=${networkStatus.confirmed}, pending=${networkStatus.pending}, gaps=[${networkStatus.gaps.join(',')}]`);
          }
          
          // Log result data for debugging
          const serializableResult = {
            ...evmResult,
            blockHeight: evmResult.blockHeight.toString(),
            blockTimestamp: evmResult.blockTimestamp.toString(),
            gasUsed: evmResult.gasUsed.toString()
          };
          this.logger.debug(`📊 Result data: ${JSON.stringify(serializableResult, null, 2)}`);
          // Ensure we have a valid nonce reservation
          if (!nonceReservation) {
            throw new Error('Nonce reservation is null - this should not happen');
          }
          
          this.logger.debug(`📊 Target batch: ${targetBatch}, Proof length: ${proof.length}, Nonce: ${nonceReservation.nonce}, Gas Price: ${nonceReservation.gasPrice}`);

          // Execute the transaction using extracted executor with manual nonce and CRITICAL VERIFICATION
          const txHash = await this.executeResultTransactionWithNonce(
            network,
            evmPrivateKey,
            sedaCoreAddress,
            evmResult,
            targetBatch,
            proof,
            nonceReservation.nonce,
            this.logger
          );
          
          // Update the nonce coordinator with the transaction hash
          nonceReservation.updateHash(txHash);

          // Derive result ID for tracking using extracted deriver
          const resultId = await deriveResultId(network, sedaCoreAddress, evmResult, this.logger);

          this.logger.info(`✅ Successfully posted result for DR ${dataRequestResult.drId} to ${network.displayName} (nonce: ${nonceReservation.nonce})`);
          this.logger.info(`   📋 Result ID: ${resultId}`);
          this.logger.info(`   🔗 TX Hash: ${txHash}`);
          
          // Log proof analysis for successful posting
          this.logProofAnalysis(dataRequestResult, dataResult, assignedBatchNumber!, assignedBatch, proof, 'SUCCESS');
          
          return { success: true, txHash, resultId };
          
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          
          // Check if this is a nonce-related error or replacement transaction underpriced
          const isNonceError = errorMessage.toLowerCase().includes('nonce') || 
                              errorMessage.toLowerCase().includes('replacement transaction underpriced');
          
          if (isNonceError && attempt < maxRetries - 1) {
            this.logger.warn(`⚠️ Nonce/replacement error on attempt ${attempt + 1}, retrying with fresh nonce: ${errorMessage}`);
            
            // Special handling for "replacement transaction underpriced"
            if (errorMessage.toLowerCase().includes('replacement transaction underpriced')) {
              this.logger.warn(`🔄 Detected "replacement transaction underpriced" - this indicates nonce collision`);
              this.logger.warn(`   The blockchain received two transactions with the same nonce`);
              this.logger.warn(`   Our transaction had lower gas price than the competing transaction`);
              this.logger.warn(`   Will retry with fresh nonce and escalated gas price`);
            }
            
            // Release the current nonce reservation
            if (nonceReservation) {
              nonceReservation.release();
              nonceReservation = null;
            }
            
            // Wait longer for replacement transaction errors to let blockchain state settle
            const waitTime = errorMessage.toLowerCase().includes('replacement transaction underpriced') ? 2000 : 1000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            attempt++;
            continue;
          } else {
            // Non-nonce error or max retries reached
            throw error;
          }
        }
      }
      
      throw new Error(`Failed to post result after ${maxRetries} attempts`);
      
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`❌ Failed to post result to ${network.displayName}: ${errorMessage}`);
      
      // Log proof analysis for failed posting (if we have the required variables)
      try {
        if (dataResult && assignedBatch && proof && assignedBatchNumber !== undefined) {
          this.logProofAnalysis(dataRequestResult, dataResult, Number(assignedBatchNumber), assignedBatch, proof, 'FAILURE');
        }
      } catch (analysisError) {
        this.logger.debug(`Could not log proof analysis for failure: ${analysisError}`);
      }
      
      return { 
        success: false, 
        error: categorizeResultPostingError(errorMessage)
      };
    } finally {
      // Always release the nonce reservation
      if (nonceReservation) {
        nonceReservation.release();
        this.logger.debug(`🔢 Released nonce ${nonceReservation.nonce} for ${network.displayName}`);
      }
    }
  }

  /**
   * Execute result transaction with manual nonce and CRITICAL VERIFICATION
   */
  private async executeResultTransactionWithNonce(
    network: EvmNetworkConfig,
    privateKey: string,
    sedaCoreAddress: string,
    evmResult: DataResultEvm,
    targetBatch: bigint,
    proof: string[],
    nonce: number,
    logger?: LoggingServiceInterface
  ): Promise<string> {
    const { executeEvmTransaction } = await import('../utils/transaction/evm-transaction-builder');
    const { add0x } = await import('./result-processing/data-result-converter');
    const { ABI_SEDA_CORE_V1 } = await import('./abi');

    logger?.info(`📡 EXECUTING result posting transaction to ${network.displayName} with nonce ${nonce}...`);
    logger?.info(`   🎯 Target: ${sedaCoreAddress}`);
    logger?.info(`   📦 Batch: ${targetBatch}`);
    logger?.info(`   🌳 Proof elements: ${proof.length}`);
    logger?.info(`   🔢 Nonce: ${nonce}`);

    // CRITICAL FIX: Verify nonce is still valid just before transaction execution
    try {
      const { createEvmClients } = await import('../utils/transaction/evm-transaction-builder');
      const { publicClient, account } = createEvmClients(network, privateKey);
      
      // Get the current blockchain nonce state
      const [confirmedNonce, pendingNonce] = await Promise.all([
        publicClient.getTransactionCount({ 
          address: account.address, 
          blockTag: 'latest' 
        }),
        publicClient.getTransactionCount({ 
          address: account.address, 
          blockTag: 'pending' 
        })
      ]);
      
      logger?.info(`🔍 PRE-EXECUTION NONCE VERIFICATION:`);
      logger?.info(`   📊 Blockchain confirmed: ${confirmedNonce}`);
      logger?.info(`   📊 Blockchain pending: ${pendingNonce}`);
      logger?.info(`   📊 Reserved nonce: ${nonce}`);
      logger?.info(`   ⏰ Verification time: ${new Date().toISOString()}`);
      
      // CRITICAL VALIDATION: Ensure our nonce is exactly what blockchain expects
      if (nonce < confirmedNonce) {
        const error = `CRITICAL: Nonce ${nonce} is too low! Blockchain confirmed nonce is ${confirmedNonce}`;
        logger?.error(`❌ ${error}`);
        throw new Error(error);
      }
      
      if (nonce < pendingNonce) {
        const error = `CRITICAL: Nonce ${nonce} is stale! Blockchain pending nonce is ${pendingNonce}`;
        logger?.error(`❌ ${error}`);
        throw new Error(error);
      }
      
      if (nonce > pendingNonce + 10) {
        const error = `CRITICAL: Nonce ${nonce} is too high! Blockchain pending nonce is ${pendingNonce}`;
        logger?.error(`❌ ${error}`);
        throw new Error(error);
      }
      
      // SUCCESS: Nonce is valid
      logger?.info(`✅ NONCE VERIFICATION PASSED: ${nonce} is valid for execution`);
      
      // Additional safety: Log the exact nonce that will be used
      logger?.info(`🚀 EXECUTING TRANSACTION WITH VERIFIED NONCE: ${nonce}`);
      
    } catch (verificationError) {
      logger?.error(`❌ NONCE VERIFICATION FAILED: ${verificationError}`);
      throw new Error(`Nonce verification failed: ${verificationError}`);
    }

    try {
      const result = await executeEvmTransaction(
        network,
        privateKey,
        {
          to: sedaCoreAddress,
          abi: ABI_SEDA_CORE_V1 as unknown as any[],
          functionName: 'postResult',
          args: [evmResult, targetBatch, proof.map(p => add0x(p))],
          nonce // Use the verified nonce
        }
      );

      logger?.info(`✅ Result transaction successful! Block: ${result.blockNumber}, Gas: ${result.gasUsed}, TX: ${result.txHash}, Nonce: ${nonce}`);
      return result.txHash;
    } catch (error) {
      const { getErrorMessage } = await import('../helpers/error-utils');
      const errorMsg = getErrorMessage(error);
      
      // Enhanced error logging for nonce issues
      if (errorMsg.toLowerCase().includes('nonce')) {
        logger?.error(`❌ NONCE ERROR in transaction execution (nonce: ${nonce}): ${errorMsg}`);
        logger?.error(`   This indicates the nonce verification passed but blockchain state changed during execution!`);
      } else {
        logger?.error(`❌ Result transaction failed (nonce: ${nonce}): ${errorMsg}`);
      }
      
      throw new Error(`Transaction execution failed: ${errorMsg}`);
    }
  }
}