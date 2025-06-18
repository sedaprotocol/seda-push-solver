/**
 * Batch Service
 * Domain service for managing batch operations and validation
 */

import type { LoggingServiceInterface } from '../../services';
import type { SignedBatch, EvmNetworkConfig, DataRequestResult } from '../../types';
import { validateSignedBatch, validateBatchConsensus } from '../../utils/validation/batch-validation';
import { ResultPoster } from '../../evm/result-poster';

/**
 * Batch processing result
 */
export interface BatchProcessingResult {
  success: boolean;
  processedResults: number;
  failedResults: number;
  errors: string[];
}

/**
 * Batch Service
 * Encapsulates business logic for batch operations
 */
export class BatchService {
  private resultPoster: ResultPoster;

  constructor(private logger: LoggingServiceInterface) {
    this.resultPoster = new ResultPoster(this.logger);
  }

  /**
   * Validate a signed batch
   */
  validateBatch(batch: SignedBatch): { valid: boolean; error?: string } {
    this.logger.debug(`Validating batch ${batch.batchNumber}`);
    
    // Validate batch structure
    const structureValidation = validateSignedBatch(batch);
    if (!structureValidation.valid) {
      return structureValidation;
    }

    // Calculate total voting power
    const totalVotingPower = batch.validatorEntries?.reduce(
      (total, entry) => total + entry.votingPowerPercent,
      0
    ) || 0;

    // Validate consensus requirements
    const consensusValidation = validateBatchConsensus(totalVotingPower);
    if (!consensusValidation.valid) {
      return consensusValidation;
    }

    this.logger.debug(`✅ Batch ${batch.batchNumber} validation passed`);
    return { valid: true };
  }

  /**
   * Process batch results for EVM networks
   */
  async processBatchResults(
    batch: SignedBatch,
    results: DataRequestResult[],
    networks: EvmNetworkConfig[]
  ): Promise<BatchProcessingResult> {
    this.logger.info(`Processing ${results.length} results for batch ${batch.batchNumber} across ${networks.length} networks`);
    
    let processedResults = 0;
    let failedResults = 0;
    const errors: string[] = [];

    for (const result of results) {
      for (const network of networks) {
        try {
          const postingResult = await this.resultPoster.postResult(
            network,
            result,
            batch,
            network.contractAddress
          );

          if (postingResult.success) {
            processedResults++;
            this.logger.info(`✅ Posted result ${result.drId} to ${network.displayName}`);
          } else {
            failedResults++;
            const error = `Failed to post ${result.drId} to ${network.displayName}: ${postingResult.error}`;
            errors.push(error);
            this.logger.warn(error);
          }
        } catch (error) {
          failedResults++;
          const errorMsg = `Error posting ${result.drId} to ${network.displayName}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          this.logger.error(errorMsg);
        }
      }
    }

    const summary = {
      success: failedResults === 0,
      processedResults,
      failedResults,
      errors
    };

    this.logger.info(`Batch processing complete: ${processedResults} successful, ${failedResults} failed`);
    return summary;
  }

  /**
   * Get batch statistics
   */
  getBatchStatistics(batch: SignedBatch): {
    validatorCount: number;
    totalVotingPower: number;
    consensusPercentage: number;
    hasConsensus: boolean;
  } {
    const validatorCount = batch.validatorEntries?.length || 0;
    const totalVotingPower = batch.validatorEntries?.reduce(
      (total, entry) => total + entry.votingPowerPercent,
      0
    ) || 0;
    
    const consensusPercentage = totalVotingPower / 1_000_000; // Convert to percentage
    const hasConsensus = totalVotingPower >= 66_666_666; // 66.666666% threshold

    return {
      validatorCount,
      totalVotingPower,
      consensusPercentage,
      hasConsensus
    };
  }

  /**
   * Check if batch is ready for processing
   */
  isBatchReady(batch: SignedBatch): boolean {
    const validation = this.validateBatch(batch);
    return validation.valid;
  }
} 