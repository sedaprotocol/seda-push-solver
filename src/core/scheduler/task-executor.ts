/**
 * Task Executor for DataRequest Operations
 * Handles the execution of individual DataRequest tasks with sequence coordination
 */

import type { ILoggingService } from '../../services';
import type { SEDADataRequestBuilder } from '../data-request/builder';
import type { SchedulerConfig } from '../../types';
import { executeWithRetry } from './retry-handler';
import { UniqueMemoGenerator } from './unique-memo-generator';
import { 
  CosmosSequenceCoordinator, 
  type SequencedPosting, 
  type PostingResult
} from './cosmos-sequence-coordinator';
import { postDataRequestTransaction, awaitDataRequestResult, buildDataRequestInput, buildGasOptions } from '../data-request';
import { getNetworkConfig } from '../network';
import type { AsyncTaskResult, TaskCompletionHandler } from './types';
import type { TaskRegistry } from './task-registry';

/**
 * Executes individual DataRequest tasks with proper sequence coordination
 */
export class TaskExecutor {
  private memoGenerator: UniqueMemoGenerator;

  constructor(
    private logger: ILoggingService,
    private sequenceCoordinator: CosmosSequenceCoordinator,
    private registry: TaskRegistry,
    private getTimestamp: () => number = Date.now
  ) {
    this.memoGenerator = new UniqueMemoGenerator(this.logger);
  }

  /**
   * Execute a complete DataRequest task with sequence coordination
   */
  async executeTask(
    taskId: string,
    requestNumber: number,
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    isRunning: () => boolean,
    completionHandler: TaskCompletionHandler
  ): Promise<AsyncTaskResult> {
    const startTime = this.getTimestamp();
    
    try {
      this.logger.info(`\n${'='.repeat(73)}`);
      this.logger.info(`📤 Async DataRequest #${requestNumber} (${taskId}) | ${new Date().toLocaleTimeString()}`);
      this.logger.info('='.repeat(73));

      // Get network configuration for building inputs and query config
      const builderConfig = builder.getConfig();
      const networkConfig = getNetworkConfig(builderConfig.network);

      // Phase 1: Post the DataRequest with sequence coordination
      const postingResult = await this.executePosting(
        taskId,
        builder,
        config,
        networkConfig,
        isRunning
      );

      if (!postingResult.success || !postingResult.result) {
        return this.handlePostingFailure(taskId, postingResult, startTime, completionHandler);
      }

      // Phase 2: DataRequest posted successfully
      const postedData = postingResult.result;
      this.logPostingSuccess(taskId, postedData, startTime);
      
      // Update registry with posted info
      this.registry.markAsPosted(
        taskId,
        postedData.drId,
        postedData.blockHeight,
        postedData.txHash,
        postingResult.sequence
      );

      // Phase 3: Wait for oracle result
      return await this.executeOracleAwaiting(
        taskId,
        postedData,
        networkConfig,
        builderConfig,
        startTime,
        postingResult.sequence,
        completionHandler
      );
        
    } catch (error) {
      return this.handleGeneralFailure(taskId, error, startTime, completionHandler);
    }
  }

  /**
   * Execute the posting phase with sequence coordination
   */
  private async executePosting(
    taskId: string,
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    networkConfig: any,
    isRunning: () => boolean
  ): Promise<PostingResult<{ drId: string; blockHeight: bigint; txHash: string }>> {
    
    const sequencedPosting: SequencedPosting<{ drId: string; blockHeight: bigint; txHash: string }> = {
      taskId,
      timeout: 20000, // 20 seconds for posting
      postTransaction: async (sequenceNumber: number) => {
        this.logger.info(`🔢 Posting DataRequest transaction for task ${taskId} with sequence ${sequenceNumber}`);
        
        // Generate unique memo using the sequence number
        const uniqueMemoData = this.memoGenerator.generateUniqueMemo(
          config.memo || 'DataRequest',
          sequenceNumber
        );
        
        // Post transaction only (no waiting for results yet)
        const retryResult = await executeWithRetry(
          async () => {
            // Ensure builder is initialized
            if (!builder.isBuilderInitialized()) {
              await builder.initialize();
            }

            // Build the post input
            const postInput = buildDataRequestInput(networkConfig.dataRequest, { memo: uniqueMemoData.memo });
            const gasOptions = buildGasOptions(networkConfig.dataRequest);
            
            // Get the signer from the builder
            const signer = (builder as any).signer;
            if (!signer) {
              throw new Error('Builder signer not available');
            }
            
            // Use the split function to ONLY post the transaction
            return await postDataRequestTransaction(
              signer,
              postInput,
              gasOptions,
              networkConfig,
              this.logger
            );
          },
          config.maxRetries,
          0, // requestNumber not needed for retry logging
          isRunning,
          this.logger
        );

        // Handle retry result
        if (retryResult.success && retryResult.result) {
          return retryResult.result;
        } else {
          throw retryResult.lastError || new Error('Failed to post DataRequest transaction');
        }
      }
    };

    this.logger.info(`🎯 Coordinating DataRequest posting for task ${taskId}`);
    return await this.sequenceCoordinator.executeSequenced(sequencedPosting);
  }

  /**
   * Handle posting failure
   */
  private handlePostingFailure(
    taskId: string,
    postingResult: PostingResult<any>,
    startTime: number,
    completionHandler: TaskCompletionHandler
  ): AsyncTaskResult {
    const completedAt = this.getTimestamp();
    const duration = completedAt - startTime;
    
    // Update registry with failure info
    this.registry.markAsFailed(
      taskId,
      postingResult.error || new Error('Failed to post DataRequest transaction'),
      postingResult.sequence
    );
    
    const failureResult: AsyncTaskResult = {
      taskId,
      success: false,
      error: postingResult.error || new Error('Failed to post DataRequest transaction'),
      completedAt,
      duration,
      sequenceNumber: postingResult.sequence
    };
    
    // Call completion handler for posting failure
    completionHandler.onFailure(failureResult);
    
    return failureResult;
  }

  /**
   * Log successful posting
   */
  private logPostingSuccess(
    taskId: string,
    postedData: { drId: string; blockHeight: bigint; txHash: string },
    startTime: number
  ): void {
    const postingDuration = Date.now() - startTime;

    this.logger.info(`✅ DataRequest posted successfully for task ${taskId}`);
    this.logger.info(`   📋 Request ID: ${postedData.drId}`);
    this.logger.info(`   📦 Block Height: ${postedData.blockHeight}`);
    this.logger.info(`   🔗 Transaction: ${postedData.txHash}`);
    this.logger.info(`   ⏱️ Posting Duration: ${postingDuration}ms`);
    this.logger.info(`   🔍 Now waiting for oracle execution...`);
  }

  /**
   * Execute oracle result awaiting
   */
  private async executeOracleAwaiting(
    taskId: string,
    postedData: { drId: string; blockHeight: bigint; txHash: string },
    networkConfig: any,
    builderConfig: any,
    taskStartTime: number,
    sequenceNumber: number,
    completionHandler: TaskCompletionHandler
  ): Promise<AsyncTaskResult> {
    try {
      // Use specific polling parameters from network config
      const awaitOptions = {
        timeoutSeconds: networkConfig.dataRequest.timeoutSeconds,
        pollingIntervalSeconds: networkConfig.dataRequest.pollingIntervalSeconds
      };

      // Query configuration for awaiting results
      const queryConfig = { rpc: builderConfig.rpcEndpoint };

      this.logger.info(`⏳ Awaiting oracle execution for DataRequest ${postedData.drId}...`);
      this.logger.info(`   ⏱️ Timeout: ${awaitOptions.timeoutSeconds}s, Polling: ${awaitOptions.pollingIntervalSeconds}s`);

      // Wait for the DataRequest execution to complete
      const executionResult = await awaitDataRequestResult(
        queryConfig,
        postedData.drId,
        postedData.blockHeight,
        awaitOptions,
        networkConfig,
        this.logger
      );
      
      const completedAt = this.getTimestamp();
      const totalDuration = completedAt - taskStartTime;

      // Update registry with completion info
      this.registry.markAsCompleted(taskId);

      // Create success result
      const successResult: AsyncTaskResult = {
        taskId,
        success: true,
        result: executionResult,
        drId: executionResult.drId,
        blockHeight: Number(executionResult.blockHeight),
        completedAt,
        duration: totalDuration,
        sequenceNumber
      };

      // Call completion handler for oracle success
      completionHandler.onSuccess(successResult);
      
      return successResult;
      
    } catch (error) {
      return this.handleOracleFailure(taskId, postedData, error, taskStartTime, sequenceNumber, networkConfig, completionHandler);
    }
  }

  /**
   * Handle oracle execution failure
   */
  private handleOracleFailure(
    taskId: string,
    postedData: { drId: string; blockHeight: bigint; txHash: string },
    error: any,
    taskStartTime: number,
    sequenceNumber: number,
    networkConfig: any,
    completionHandler: TaskCompletionHandler
  ): AsyncTaskResult {
    const completedAt = this.getTimestamp();
    const totalDuration = completedAt - taskStartTime;
    
    this.logger.error(`❌ Oracle execution failed for ${taskId}:`, error);
    this.logger.info(`   📋 DataRequest ${postedData.drId} was posted successfully but oracle execution timed out or failed`);
    this.logger.info(`   💡 The DataRequest may still be executing - check the explorer manually`);
    
    if (networkConfig.explorerEndpoint) {
      this.logger.info(`   🔗 Manual Check: ${networkConfig.explorerEndpoint}/data-requests/${postedData.drId}/${postedData.blockHeight}`);
    }
    
    // Update registry with failure info
    this.registry.markAsFailed(taskId, error instanceof Error ? error : new Error(String(error)));

    // Create failure result
    const failureResult: AsyncTaskResult = {
      taskId,
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      drId: postedData.drId,
      blockHeight: Number(postedData.blockHeight),
      completedAt,
      duration: totalDuration,
      sequenceNumber
    };
    
    // Call completion handler for oracle failure
    completionHandler.onFailure(failureResult);
    
    return failureResult;
  }

  /**
   * Handle general task failure
   */
  private handleGeneralFailure(
    taskId: string,
    error: any,
    startTime: number,
    completionHandler: TaskCompletionHandler
  ): AsyncTaskResult {
    const completedAt = this.getTimestamp();
    const duration = completedAt - startTime;
    
    this.logger.error(`❌ Async task ${taskId} failed:`, error);
    
    // Update registry
    this.registry.markAsFailed(taskId, error instanceof Error ? error : new Error(String(error)));
    
    const failureResult: AsyncTaskResult = {
      taskId,
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      completedAt,
      duration
    };
    
    // Call completion handler for general failure
    completionHandler.onFailure(failureResult);
    
    return failureResult;
  }

  /**
   * Get memo generator statistics
   */
  getMemoGeneratorStats() {
    return this.memoGenerator.getStats();
  }

  /**
   * Reset memo generator (for cleanup)
   */
  reset(): void {
    this.memoGenerator.reset();
  }
} 