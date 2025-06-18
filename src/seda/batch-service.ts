/**
 * SEDA Batch Service
 * Handles fetching batch information from the SEDA chain
 */

import type { QueryConfig } from '@seda-protocol/dev-tools';
import { QueryClient, createProtobufRpcClient } from "@cosmjs/stargate";
import { Comet38Client } from "@cosmjs/tendermint-rpc";
import { sedachain } from "@seda-protocol/proto-messages";
import type { SignedBatch } from '../types';
import type { LoggingServiceInterface } from '../services';
import { getErrorMessage } from '../helpers/error-utils';

export class SedaBatchService {
  constructor(
    private queryConfig: QueryConfig,
    private logger: LoggingServiceInterface
  ) {}

  /**
   * Fetch batch information from SEDA chain
   */
  async fetchBatch(
    drId: string,
    blockHeight: bigint,
    maxRetries: number = 10,
    pollingIntervalMs: number = 3000
  ): Promise<SignedBatch | null> {
    try {
      // Get DataResult with batch assignment
      const dataResult = await this.getDataResult(drId, blockHeight);
      
      if (!dataResult) {
        return null;
      }
      
      const { batchAssignment } = dataResult;
      
      // Start polling with summary logging only
      this.logger.info(`📦 Fetching batch ${batchAssignment} (max ${maxRetries} attempts, ${pollingIntervalMs}ms intervals)`);
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        this.logger.debug(`🔄 Polling attempt ${attempt}/${maxRetries} for batch ${batchAssignment}`);
        
        const batch = await this.getBatch(batchAssignment);
        
        if (batch) {
          this.logger.info(`✅ Batch ${batchAssignment} ready after ${attempt} attempts`);
          return batch;
        }
        
        if (attempt < maxRetries) {
          this.logger.debug(`⏱️ Batch ${batchAssignment} not ready, waiting ${pollingIntervalMs}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, pollingIntervalMs));
        }
      }
      
      // Try to get latest signed batch if assigned batch isn't ready
      this.logger.warn(`⚠️ Batch ${batchAssignment} not ready after ${maxRetries} attempts, trying latest signed batch`);
      
      const latestSignedBatch = await this.getLatestSignedBatch();
      if (latestSignedBatch) {
        this.logger.info(`✅ Using latest signed batch ${latestSignedBatch.batchNumber} (fallback)`);
        return latestSignedBatch;
      }
      
      this.logger.error(`❌ No usable batch found for DataRequest ${drId}`);
      return null;

    } catch (error) {
      this.logger.error(`❌ Failed to fetch batch information: ${getErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * Create protobuf RPC client for SEDA chain queries
   */
  private async createSedaQueryClient() {
    const cometClient = await Comet38Client.connect(this.queryConfig.rpc);
    const queryClient = new QueryClient(cometClient);
    return createProtobufRpcClient(queryClient);
  }

  /**
   * Get DataResult to find batch assignment
   */
  private async getDataResult(drId: string, blockHeight: bigint): Promise<{ batchAssignment: bigint } | null> {
    try {
      const protoClient = await this.createSedaQueryClient();
      const client = new sedachain.batching.v1.QueryClientImpl(protoClient);
      
      this.logger.info(`📋 Querying DataResult for ${drId} at height ${blockHeight}...`);
      
      const response = await client.DataResult({ 
        dataRequestId: drId, 
        dataRequestHeight: blockHeight 
      });
      
      if (!response.batchAssignment || !response.dataResult) {
        this.logger.warn(`⚠️ DataResult not found for ${drId}`);
        return null;
      }
      
      this.logger.info(`✅ DataResult found - assigned to batch ${response.batchAssignment.batchNumber}`);
      
      return {
        batchAssignment: response.batchAssignment.batchNumber
      };
      
    } catch (error) {
      this.logger.error(`❌ Failed to get DataResult: ${getErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * Get batch information directly from SEDA chain
   */
  private async getBatch(batchNumber: bigint): Promise<SignedBatch | null> {
    try {
      const protoClient = await this.createSedaQueryClient();
      const client = new sedachain.batching.v1.QueryClientImpl(protoClient);
      
      this.logger.info(`📦 Querying batch ${batchNumber} from SEDA chain...`);
      
      const response = await client.Batch({ 
        batchNumber, 
        latestSigned: false 
      });
      
      if (!response.batch) {
        this.logger.warn(`⚠️ Batch ${batchNumber} not found`);
        return null;
      }
      
      const { batch, batchSignatures, dataResultEntries, validatorEntries } = response;
      
      // Check if batch has signatures
      if (!batchSignatures || batchSignatures.length === 0) {
        this.logger.warn(`⚠️ Batch ${batchNumber} has no signatures yet`);
        return null;
      }
      
      if (!validatorEntries || validatorEntries.length === 0) {
        this.logger.warn(`⚠️ Batch ${batchNumber} has no validator entries`);
        return null;
      }
      
      this.logger.info(`✅ Batch ${batchNumber} fetched successfully with ${batchSignatures.length} signatures!`);
      
      return {
        batchNumber: batch.batchNumber,
        batchId: Buffer.from(batch.batchId).toString('hex'),
        blockHeight: batch.blockHeight,
        currentDataResultRoot: batch.currentDataResultRoot,
        dataResultRoot: batch.dataResultRoot,
        validatorRoot: batch.validatorRoot,
        dataResultEntries: dataResultEntries?.entries || [],
        batchSignatures: batchSignatures || [],
        validatorEntries: validatorEntries || []
      };
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        this.logger.warn(`⚠️ Batch ${batchNumber} not found on chain`);
        return null;
      }
      this.logger.error(`❌ Failed to get batch ${batchNumber}: ${getErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * Get the latest signed batch from SEDA chain
   */
  private async getLatestSignedBatch(): Promise<SignedBatch | null> {
    try {
      const protoClient = await this.createSedaQueryClient();
      const client = new sedachain.batching.v1.QueryClientImpl(protoClient);
      
      this.logger.debug(`📦 Querying latest signed batch from SEDA chain`);
      
      const response = await client.Batch({ 
        batchNumber: 0n,
        latestSigned: true 
      });
      
      if (!response.batch) {
        this.logger.warn(`⚠️ No latest signed batch found`);
        return null;
      }
      
      const { batch, batchSignatures, dataResultEntries, validatorEntries } = response;
      
      if (!batchSignatures || batchSignatures.length === 0) {
        this.logger.warn(`⚠️ Latest signed batch has no signatures`);
        return null;
      }
      
      if (!validatorEntries || validatorEntries.length === 0) {
        this.logger.warn(`⚠️ Latest signed batch has no validator entries`);
        return null;
      }
      
      this.logger.debug(`✅ Latest signed batch ${batch.batchNumber} fetched with ${batchSignatures.length} signatures`);
      
      return {
        batchNumber: batch.batchNumber,
        batchId: Buffer.from(batch.batchId).toString('hex'),
        blockHeight: batch.blockHeight,
        currentDataResultRoot: batch.currentDataResultRoot,
        dataResultRoot: batch.dataResultRoot,
        validatorRoot: batch.validatorRoot,
        dataResultEntries: dataResultEntries?.entries || [],
        batchSignatures: batchSignatures || [],
        validatorEntries: validatorEntries || []
      };
      
    } catch (error) {
      this.logger.error(`❌ Failed to get latest signed batch: ${getErrorMessage(error)}`);
      return null;
    }
  }
}