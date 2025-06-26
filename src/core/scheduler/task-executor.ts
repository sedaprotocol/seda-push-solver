/**
 * Task Executor for DataRequest Operations
 * Efficiently separates posting from oracle awaiting for optimal performance
 */

import type { LoggingServiceInterface } from '../../services';
import type { SEDADataRequestBuilder } from '../data-request';
import type { SchedulerConfig } from '../../types';
import { executeWithRetry } from './retry-handler';
import { UniqueMemoGenerator } from './unique-memo-generator';
import { DataRequestPerformanceTracker, STEP_NAMES } from './performance-tracker';
import {
  CosmosSequenceCoordinator,
  type SequencedPosting,
  type PostingResult
} from './cosmos-sequence-coordinator';
import { SequenceQueryService } from './sequence-query-service';
import { postDataRequestTransaction, awaitDataRequestResult, buildDataRequestInput, buildGasOptions } from '../data-request';
import { getSedaNetworkConfig } from '../../config';
import type { AsyncTaskResult, TaskCompletionHandler } from './types';
import type { TaskRegistry } from './task-registry';
import { getErrorMessage } from '../../helpers/error-utils';

/**
 * Task Executor - separates posting from oracle awaiting
 */
export class TaskExecutor {
  private memoGenerator: UniqueMemoGenerator;
  private sequenceQueryService: SequenceQueryService;

  constructor(
    private logger: LoggingServiceInterface,
    private sequenceCoordinator: CosmosSequenceCoordinator,
    private registry: TaskRegistry,
    private getTimestamp: () => number = Date.now
  ) {
    this.memoGenerator = new UniqueMemoGenerator(this.logger);
    this.sequenceQueryService = new SequenceQueryService(this.logger);
  }

  /**
   * Execute a DataRequest task with TRUE parallel posting and awaiting
   */
  async executeTask(
    taskId: string,
    requestNumber: number,
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    isRunning: () => boolean,
    completionHandler: TaskCompletionHandler,
    performanceTracker?: DataRequestPerformanceTracker
  ): Promise<AsyncTaskResult> {
    const startTime = this.getTimestamp();
    
    try {
      this.logger.info(`\n${'='.repeat(73)}`);
      this.logger.info(`🚀 DataRequest #${requestNumber} (${taskId}) | ${new Date().toLocaleTimeString()}`);
      this.logger.info('='.repeat(73));
      this.logger.info(`⏱️  TASK START: Beginning execution at ${new Date(startTime).toLocaleTimeString()}`);

      // Get network configuration
      performanceTracker?.startStep(taskId, STEP_NAMES.PROCESS);
      
      const builderConfig = builder.getConfig();
      const networkConfig = getSedaNetworkConfig(builderConfig.network);

      performanceTracker?.endStep(taskId, STEP_NAMES.PROCESS);

      // Phase 1: POST ONLY (coordinated by sequence)
      performanceTracker?.startStep(taskId, STEP_NAMES.POSTING);
      
      const postingStartTime = this.getTimestamp();
      this.logger.info(`📋 PHASE 1: Starting posting phase at ${new Date(postingStartTime).toLocaleTimeString()}`);
      
      const postingResult = await this.executePostingOnly(
        taskId,
        builder,
        config,
        networkConfig,
        isRunning
      );

      const postingEndTime = this.getTimestamp();
      const postingDuration = postingEndTime - postingStartTime;
      
      if (!postingResult.success || !postingResult.result) {
        performanceTracker?.failStep(taskId, STEP_NAMES.POSTING, 'Posting failed');
        this.logger.error(`❌ PHASE 1 FAILED: Posting failed after ${postingDuration}ms (${(postingDuration/1000).toFixed(2)}s)`);
        return this.handlePostingFailure(taskId, postingResult, startTime, completionHandler);
      }

      performanceTracker?.endStep(taskId, STEP_NAMES.POSTING);
      
      const postedData = postingResult.result;
      this.logger.info(`✅ PHASE 1 SUCCESS: DataRequest posted after ${postingDuration}ms (${(postingDuration/1000).toFixed(2)}s)`);
      this.logger.info(`   📋 Request ID: ${postedData.drId}`);
      this.logger.info(`   📦 Block Height: ${postedData.blockHeight}`);
      this.logger.info(`   🔗 Transaction: ${postedData.txHash}`);
      
      // Mark as posted in registry
      this.registry.markAsPosted(
        taskId,
        postedData.drId,
        postedData.blockHeight,
        postedData.txHash,
        postingResult.sequence
      );

      // Prepare success result for posting
      const postingSuccessResult: AsyncTaskResult = {
        taskId,
        drId: postedData.drId,
        success: true,
        result: {
          type: 'posted',
          drId: postedData.drId,
          blockHeight: postedData.blockHeight,
          txHash: postedData.txHash
        },
        completedAt: postingEndTime,
        duration: postingDuration,
        sequenceNumber: postingResult.sequence
      };

      // IMPORTANT: Call posting completion handler IMMEDIATELY
      completionHandler.onSuccess(postingSuccessResult);

      // Phase 2: Start Oracle awaiting in parallel (non-blocking)
      this.logger.info(`🔄 PHASE 2: Starting oracle awaiting in parallel (non-blocking)...`);
      
      this.startOracleAwaitingInParallel(
        taskId,
        postedData,
        networkConfig,
        builderConfig,
        startTime,
        postingResult.sequence,
        completionHandler,
        performanceTracker
      );

      // Return the posting success result
      return postingSuccessResult;
        
    } catch (error) {
      const errorTime = this.getTimestamp();
      const errorDuration = errorTime - startTime;
      this.logger.error(`💥 TASK ERROR: Task ${taskId} failed after ${errorDuration}ms (${(errorDuration/1000).toFixed(2)}s):`, error instanceof Error ? error : String(error));
      return this.handleGeneralFailure(taskId, error, startTime, completionHandler);
    }
  }

  /**
   * Execute a multi-program DataRequest task with proper individual transaction tracking
   */
  async executeMultiProgramTask(
    taskId: string,
    requestNumber: number,
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    isRunning: () => boolean,
    completionHandler: TaskCompletionHandler,
    performanceTracker?: DataRequestPerformanceTracker
  ): Promise<AsyncTaskResult> {
    const startTime = this.getTimestamp();
    
    try {
      this.logger.info(`\n${'='.repeat(73)}`);
      this.logger.info(`🚀 Multi-Program DataRequest #${requestNumber} (${taskId}) | ${new Date().toLocaleTimeString()}`);
      this.logger.info('='.repeat(73));
      this.logger.info(`⏱️  MULTI-PROGRAM TASK START: Beginning execution at ${new Date(startTime).toLocaleTimeString()}`);

      // Get network configuration and program IDs
      performanceTracker?.startStep(taskId, STEP_NAMES.PROCESS);
      
      const builderConfig = builder.getConfig();
      const networkConfig = getSedaNetworkConfig(builderConfig.network);
      const programIds = networkConfig.dataRequest.oracleProgramIds || [networkConfig.dataRequest.oracleProgramId];

      performanceTracker?.endStep(taskId, STEP_NAMES.PROCESS);

      this.logger.info(`📋 PROGRAMS TO EXECUTE: ${programIds.length} programs`);
      programIds.forEach((programId, index) => {
        this.logger.info(`   ${index + 1}. ${programId}`);
      });

      // Phase 1: POST ALL PROGRAMS WITH INDIVIDUAL TRANSACTION TRACKING
      performanceTracker?.startStep(taskId, STEP_NAMES.POSTING);
      
      const postingStartTime = this.getTimestamp();
      this.logger.info(`📋 PHASE 1: Starting individual program posting with transaction tracking at ${new Date(postingStartTime).toLocaleTimeString()}`);
      
      // Execute each program individually to get proper transaction tracking
      const programPostingResults = await this.executeMultipleProgramPostings(
        taskId,
        programIds,
        builder,
        config,
        networkConfig,
        isRunning
      );

      const postingEndTime = this.getTimestamp();
      const postingDuration = postingEndTime - postingStartTime;
      
      performanceTracker?.endStep(taskId, STEP_NAMES.POSTING);
      
      this.logger.info(`✅ PHASE 1 SUCCESS: All ${programPostingResults.length} DataRequests posted after ${postingDuration}ms (${(postingDuration/1000).toFixed(2)}s)`);
      
      // Log individual transaction tracking results
      programPostingResults.forEach((result, index) => {
        this.logger.info(`   ${index + 1}. Program: ${programIds[index]}`);
        this.logger.info(`      📋 Request ID: ${result.drId}`);
        this.logger.info(`      📦 Block Height: ${result.blockHeight}`);
        this.logger.info(`      🔗 Transaction: ${result.txHash}`);
        this.logger.info(`      🔢 Sequence: ${result.sequenceNumber}`);
        this.logger.info(`      ⏱️  Posted At: ${new Date(result.postedAt).toLocaleTimeString()}`);
      });
      
      // Mark all programs as posted in registry with individual tracking
      programPostingResults.forEach((result, index) => {
        const programTaskId = `${taskId}-program-${index}`;
        this.registry.markAsPosted(
          programTaskId,
          result.drId,
          result.blockHeight,
          result.txHash,
          result.sequenceNumber
        );
      });

      // Prepare the combined result with individual transaction details
      const multiProgramPostingResult: AsyncTaskResult = {
        taskId,
        drId: programPostingResults.map(r => r.drId).join(','), // Combine all DR IDs
        success: true,
        result: {
          type: 'multi-program-posted',
          programResults: programPostingResults,
          totalPrograms: programIds.length,
          allTransactionHashes: programPostingResults.map(r => r.txHash),
          allSequenceNumbers: programPostingResults.map(r => r.sequenceNumber)
        },
        completedAt: postingEndTime,
        duration: postingDuration,
        sequenceNumber: programPostingResults[0]?.sequenceNumber // Use first program's sequence as primary
      };

      // Call completion handler with detailed transaction information
      completionHandler.onSuccess(multiProgramPostingResult);

      // Phase 2: Start oracle awaiting for all programs in parallel (non-blocking)
      this.logger.info(`🔄 PHASE 2: Starting oracle awaiting for all ${programPostingResults.length} programs in parallel (non-blocking)...`);
      
      this.startMultiProgramOracleAwaitingInParallel(
        taskId,
        programPostingResults,
        programIds,
        networkConfig,
        builderConfig,
        startTime,
        completionHandler,
        performanceTracker
      );

      return multiProgramPostingResult;
        
    } catch (error) {
      const errorTime = this.getTimestamp();
      const errorDuration = errorTime - startTime;
      this.logger.error(`💥 MULTI-PROGRAM TASK ERROR: Task ${taskId} failed after ${errorDuration}ms (${(errorDuration/1000).toFixed(2)}s):`, error instanceof Error ? error : String(error));
      return this.handleGeneralFailure(taskId, error, startTime, completionHandler);
    }
  }

  /**
   * Execute multiple program postings using the bundle approach for better coordination
   */
  private async executeMultipleProgramPostings(
    taskId: string,
    programIds: string[],
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    networkConfig: any,
    isRunning: () => boolean
  ): Promise<Array<{
    drId: string;
    blockHeight: bigint;
    txHash: string;
    sequenceNumber: number;
    postedAt: number;
    programId: string;
  }>> {
    
    this.logger.info(`📦 BUNDLE APPROACH: Preparing to post ${programIds.length} programs using bundle method`);
    this.logger.info(`   🎯 Programs: ${programIds.join(', ')}`);

    const signer = (builder as any).signer;
    if (!signer) {
      throw new Error('Builder signer not available');
    }

    // Get the current account sequence number to make DR IDs more unique
    let currentSequenceNumber: number;
    try {
      currentSequenceNumber = await this.sequenceQueryService.queryAccountSequence(signer);
      this.logger.info(`🔢 Current account sequence: ${currentSequenceNumber}`);
    } catch (error) {
      this.logger.warn(`⚠️ Failed to get account sequence, using timestamp: ${getErrorMessage(error)}`);
      currentSequenceNumber = Date.now() % 1000000; // Fallback to timestamp-based number
    }

    // Import the bundle function from SEDA dev-tools
    const { postDataRequestBundle } = await import('@seda-protocol/dev-tools');

    // Build data request inputs for each program
    const dataRequestInputs = programIds.map((programId, index) => {
      // Generate unique memo for this specific program using actual sequence number
      const uniqueMemoData = this.memoGenerator.generateUniqueMemo(
        `${config.memo || 'Multi-Program DataRequest'} - ${programId}`,
        currentSequenceNumber + index // Use actual sequence number as base
      );

      // Build input with program ID override
      return buildDataRequestInput(networkConfig.dataRequest, { 
        memo: uniqueMemoData.memo,
        programId: programId
      });
    });

    const gasOptions = buildGasOptions(networkConfig);
    const startTime = this.getTimestamp();

    this.logger.info(`📦 Posting bundle of ${dataRequestInputs.length} DataRequests...`);
    this.logger.info(`   🔢 Base sequence: ${currentSequenceNumber}`);
    
    try {
      // Use SEDA's bundle function which handles sequence coordination internally
      const bundleResult = await postDataRequestBundle(signer, dataRequestInputs, gasOptions);
      
      const endTime = this.getTimestamp();
      const duration = endTime - startTime;
      
      this.logger.info(`✅ BUNDLE SUCCESS: All ${programIds.length} programs posted in ${duration}ms (${(duration/1000).toFixed(2)}s)`);
      this.logger.info(`   🔗 Transaction: ${bundleResult.tx}`);
      this.logger.info(`   📊 Data Requests: ${bundleResult.drs.length}`);
      
             // Map the results back to include program IDs and create the expected format
       const results = bundleResult.drs.map((dr, index) => {
         const programId = programIds[index];
         if (!programId) {
           throw new Error(`Program ID not found at index ${index}`);
         }
         
         this.logger.info(`   📋 Program ${index + 1}: ${programId} → ${dr.id}`);
         
         return {
           drId: dr.id,
           blockHeight: dr.height,
           txHash: bundleResult.tx,
           sequenceNumber: currentSequenceNumber + index, // Use the actual sequence number
           postedAt: startTime,
           programId: programId
         };
       });
      
      this.logger.info(`🎉 BUNDLE POSTING COMPLETE: All ${results.length} programs posted successfully!`);
      
      return results;
      
    } catch (error) {
      this.logger.error(`💥 BUNDLE FAILED: Bundle execution failed:`, error instanceof Error ? error : String(error));
      throw new Error(`Failed to post DataRequest bundle: ${error}`);
    }
  }

  /**
   * Execute posting for a specific program with proper tracking
   */
  private async executePostingOnlyWithProgramId(
    taskId: string,
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    networkConfig: any,
    isRunning: () => boolean,
    programId: string
  ): Promise<PostingResult<{ drId: string; blockHeight: bigint; txHash: string }>> {
    
    const sequencedPosting: SequencedPosting<{ drId: string; blockHeight: bigint; txHash: string }> = {
      taskId,
      timeout: process.env.COSMOS_POSTING_TIMEOUT_MS ? parseInt(process.env.COSMOS_POSTING_TIMEOUT_MS) : 20000,
      postTransaction: async (sequenceNumber: number) => {
        const postStartTime = this.getTimestamp();
        this.logger.info(`📤 POST START: Program ${programId} (${taskId}) with sequence ${sequenceNumber} at ${new Date(postStartTime).toLocaleTimeString()}`);
        
        // Generate unique memo for this specific program
        const uniqueMemoData = this.memoGenerator.generateUniqueMemo(
          config.memo || `DataRequest - ${programId}`,
          sequenceNumber
        );
        
        // Post transaction with program-specific configuration
        const retryResult = await executeWithRetry(
          async () => {
            if (!builder.isBuilderInitialized()) {
              await builder.initialize();
            }

            // Build input with program ID override
            const postInput = buildDataRequestInput(networkConfig.dataRequest, { 
              memo: uniqueMemoData.memo,
              programId: programId  // Override with specific program ID
            });
            const gasOptions = buildGasOptions(networkConfig);
            const signer = (builder as any).signer;
            
            if (!signer) {
              throw new Error('Builder signer not available');
            }
            
            const txStartTime = this.getTimestamp();
            this.logger.info(`🔄 TX START: Posting transaction for program ${programId} (${taskId}) at ${new Date(txStartTime).toLocaleTimeString()}`);
            
            // Post the transaction for this specific program
            const result = await postDataRequestTransaction(
              signer,
              postInput,
              gasOptions,
              networkConfig,
              this.logger
            );
            
            const txEndTime = this.getTimestamp();
            const txDuration = txEndTime - txStartTime;
            this.logger.info(`✅ TX COMPLETE: Transaction posted for program ${programId} (${taskId}) in ${txDuration}ms (${(txDuration/1000).toFixed(2)}s)`);
            
            return result;
          },
          config.maxRetries,
          0,
          isRunning,
          this.logger
        );
        
        const postEndTime = this.getTimestamp();
        const postDuration = postEndTime - postStartTime;
        
        if (retryResult.success && retryResult.result) {
          this.logger.info(`🎯 POST COMPLETE: Program ${programId} (${taskId}) posted successfully in ${postDuration}ms (${(postDuration/1000).toFixed(2)}s)`);
          return retryResult.result;
        } else {
          this.logger.error(`❌ POST FAILED: Program ${programId} (${taskId}) failed after ${postDuration}ms (${(postDuration/1000).toFixed(2)}s)`);
          throw retryResult.lastError || new Error(`Failed to post DataRequest transaction for program ${programId}`);
        }
      }
    };

    const coordinationStartTime = this.getTimestamp();
    this.logger.info(`⚡ COORDINATION START: Coordinating program ${programId} (${taskId}) at ${new Date(coordinationStartTime).toLocaleTimeString()}`);
    
    const result = await this.sequenceCoordinator.executeSequenced(sequencedPosting);
    
    const coordinationEndTime = this.getTimestamp();
    const coordinationDuration = coordinationEndTime - coordinationStartTime;
    this.logger.info(`🚀 COORDINATION COMPLETE: Program ${programId} (${taskId}) coordination finished in ${coordinationDuration}ms (${(coordinationDuration/1000).toFixed(2)}s)`);
    
    return result;
  }

  /**
   * Start oracle awaiting for all programs in parallel
   */
  private startMultiProgramOracleAwaitingInParallel(
    taskId: string,
    programResults: Array<{
      drId: string;
      blockHeight: bigint;
      txHash: string;
      sequenceNumber: number;
      postedAt: number;
      programId: string;
    }>,
    programIds: string[],
    networkConfig: any,
    builderConfig: any,
    taskStartTime: number,
    completionHandler: TaskCompletionHandler,
    performanceTracker?: DataRequestPerformanceTracker
  ): void {
    
    let completedCount = 0;
    const totalPrograms = programResults.length;
    
    // Start oracle awaiting for each program in parallel
    programResults.forEach((programResult, index) => {
      const programTaskId = `${taskId}-program-${index}`;
      
      this.startOracleAwaitingInParallel(
        programTaskId,
        {
          drId: programResult.drId,
          blockHeight: programResult.blockHeight,
          txHash: programResult.txHash
        },
        networkConfig,
        builderConfig,
        taskStartTime,
        programResult.sequenceNumber,
        {
          onSuccess: (result) => {
            completedCount++;
            this.logger.info(`✅ Program ${index + 1}/${totalPrograms} completed: ${programIds[index]} (${result.drId})`);
            this.registry.markAsCompleted(programTaskId);
            
            // Check if all programs are completed
            if (completedCount === totalPrograms) {
              this.logger.info(`🎉 ALL PROGRAMS COMPLETED: Multi-program task ${taskId} finished successfully (${completedCount}/${totalPrograms})`);
              
              // Create final completion result with all program details
              const finalCompletionResult: AsyncTaskResult = {
                taskId,
                drId: programResults.map(r => r.drId).join(','),
                success: true,
                result: {
                  type: 'multi-program-completed',
                  completedPrograms: completedCount,
                  totalPrograms: totalPrograms,
                  programResults: programResults,
                  allTransactionHashes: programResults.map(r => r.txHash),
                  allSequenceNumbers: programResults.map(r => r.sequenceNumber)
                },
                completedAt: Date.now(),
                duration: Date.now() - taskStartTime
              };
              
              // Call final completion handler
              completionHandler.onSuccess(finalCompletionResult);
            } else {
              this.logger.info(`🔄 PROGRESS: ${completedCount}/${totalPrograms} programs completed for task ${taskId}`);
            }
          },
          onFailure: (result) => {
            this.logger.error(`❌ Program ${index + 1}/${totalPrograms} failed: ${programIds[index]} - ${result.error}`);
            // Continue with other programs even if one fails
            completedCount++; // Count failed programs towards completion to avoid hanging
            
            if (completedCount === totalPrograms) {
              this.logger.warn(`⚠️ All programs processed (some failed): Multi-program task ${taskId} completed with errors`);
            }
          }
        },
        performanceTracker
      );
    });
  }

  /**
   * Execute posting ONLY - no awaiting
   */
  private async executePostingOnly(
    taskId: string,
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    networkConfig: any,
    isRunning: () => boolean,
    options?: { programId?: string }
  ): Promise<PostingResult<{ drId: string; blockHeight: bigint; txHash: string }>> {
    
    const sequencedPosting: SequencedPosting<{ drId: string; blockHeight: bigint; txHash: string }> = {
      taskId,
      timeout: process.env.COSMOS_POSTING_TIMEOUT_MS ? parseInt(process.env.COSMOS_POSTING_TIMEOUT_MS) : 20000,
      postTransaction: async (sequenceNumber: number) => {
        const postStartTime = this.getTimestamp();
        this.logger.info(`📤 POST START: DataRequest ${taskId} with sequence ${sequenceNumber} at ${new Date(postStartTime).toLocaleTimeString()}`);
        
        // Generate unique memo
        const uniqueMemoData = this.memoGenerator.generateUniqueMemo(
          config.memo || 'DataRequest',
          sequenceNumber
        );
        
        // Post transaction ONLY - no oracle awaiting
        const retryResult = await executeWithRetry(
          async () => {
            if (!builder.isBuilderInitialized()) {
              await builder.initialize();
            }

            const postInput = buildDataRequestInput(networkConfig.dataRequest, { 
              memo: uniqueMemoData.memo,
              programId: options?.programId // Pass through program ID override if provided
            });
            const gasOptions = buildGasOptions(networkConfig);
            const signer = (builder as any).signer;
            
            if (!signer) {
              throw new Error('Builder signer not available');
            }
            
            const txStartTime = this.getTimestamp();
            this.logger.info(`🔄 TX START: Posting transaction for ${taskId} at ${new Date(txStartTime).toLocaleTimeString()}`);
            
            // ONLY post the transaction - return immediately
            const result = await postDataRequestTransaction(
              signer,
              postInput,
              gasOptions,
              networkConfig,
              this.logger
            );
            
            const txEndTime = this.getTimestamp();
            const txDuration = txEndTime - txStartTime;
            this.logger.info(`✅ TX COMPLETE: Transaction posted for ${taskId} in ${txDuration}ms (${(txDuration/1000).toFixed(2)}s)`);
            
            return result;
          },
          config.maxRetries,
          0,
          isRunning,
          this.logger
        );
        
        const postEndTime = this.getTimestamp();
        const postDuration = postEndTime - postStartTime;
        
        if (retryResult.success && retryResult.result) {
          this.logger.info(`🎯 POST COMPLETE: DataRequest ${taskId} posted successfully in ${postDuration}ms (${(postDuration/1000).toFixed(2)}s)`);
          return retryResult.result;
        } else {
          this.logger.error(`❌ POST FAILED: DataRequest ${taskId} failed after ${postDuration}ms (${(postDuration/1000).toFixed(2)}s)`);
          throw retryResult.lastError || new Error('Failed to post DataRequest transaction');
        }
      }
    };

    const coordinationStartTime = this.getTimestamp();
    this.logger.info(`⚡ COORDINATION START: Coordinating DataRequest ${taskId} at ${new Date(coordinationStartTime).toLocaleTimeString()}`);
    
    const result = await this.sequenceCoordinator.executeSequenced(sequencedPosting);
    
    const coordinationEndTime = this.getTimestamp();
    const coordinationDuration = coordinationEndTime - coordinationStartTime;
    this.logger.info(`🚀 COORDINATION COMPLETE: DataRequest ${taskId} coordination finished in ${coordinationDuration}ms (${(coordinationDuration/1000).toFixed(2)}s)`);
    
    return result;
  }

  /**
   * Start oracle awaiting in parallel (fire and forget)
   */
  private startOracleAwaitingInParallel(
    taskId: string,
    postedData: { drId: string; blockHeight: bigint; txHash: string },
    networkConfig: any,
    builderConfig: any,
    taskStartTime: number,
    sequenceNumber: number,
    completionHandler: TaskCompletionHandler,
    performanceTracker?: DataRequestPerformanceTracker
  ): void {
    // Start oracle awaiting in background - don't await this!
    this.executeOracleAwaitingAsync(
      taskId,
      postedData,
      networkConfig,
      builderConfig,
      taskStartTime,
      sequenceNumber,
      completionHandler,
      performanceTracker
    ).catch(error => {
      this.logger.error(`❌ Background oracle awaiting failed for ${taskId}:`, error);
    });

    this.logger.info(`🔥 PARALLEL: Started oracle awaiting for ${taskId} in background`);
  }

  /**
   * Execute oracle awaiting asynchronously (background process)
   */
  private async executeOracleAwaitingAsync(
    taskId: string,
    postedData: { drId: string; blockHeight: bigint; txHash: string },
    networkConfig: any,
    builderConfig: any,
    taskStartTime: number,
    sequenceNumber: number,
    completionHandler: TaskCompletionHandler,
    performanceTracker?: DataRequestPerformanceTracker
  ): Promise<void> {
    try {
      const awaitOptions = {
        timeoutSeconds: networkConfig.dataRequest.timeoutSeconds,
        pollingIntervalSeconds: networkConfig.dataRequest.pollingIntervalSeconds,
        maxBatchRetries: networkConfig.dataRequest.maxBatchRetries || 5,
        batchPollingIntervalMs: networkConfig.dataRequest.batchPollingIntervalMs || 5000
      };

      const queryConfig = { rpc: builderConfig.rpcEndpoint };

      this.logger.info(`⏳ BACKGROUND: Awaiting oracle execution for ${postedData.drId}...`);

      // Wait for oracle execution with detailed timing
      const executionResult = await awaitDataRequestResult(
        queryConfig,
        postedData.drId,
        postedData.blockHeight,
        awaitOptions,
        networkConfig,
        this.logger,
        performanceTracker,
        taskId
      );
      
      const completedAt = this.getTimestamp();
      const totalDuration = completedAt - taskStartTime;

      // Update registry
      this.registry.markAsCompleted(taskId);

      // Create oracle success result
      const oracleSuccessResult: AsyncTaskResult = {
        taskId,
        success: true,
        result: { type: 'oracle_completed', ...executionResult },
        drId: executionResult.drId,
        blockHeight: Number(executionResult.drBlockHeight),
        completedAt,
        duration: totalDuration,
        sequenceNumber
      };

      // Call completion handler for ORACLE SUCCESS
      completionHandler.onSuccess(oracleSuccessResult);
      
    } catch (error) {
      this.handleOracleFailureAsync(taskId, postedData, error, taskStartTime, sequenceNumber, networkConfig, completionHandler);
    }
  }

  /**
   * Handle oracle failure in background
   */
  private handleOracleFailureAsync(
    taskId: string,
    postedData: { drId: string; blockHeight: bigint; txHash: string },
    error: any,
    taskStartTime: number,
    sequenceNumber: number,
    networkConfig: any,
    completionHandler: TaskCompletionHandler
  ): void {
    const completedAt = this.getTimestamp();
    const totalDuration = completedAt - taskStartTime;
    
    this.logger.error(`❌ BACKGROUND: Oracle execution failed for ${taskId}:`, error);
    
    // Update registry
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
    
    // Call completion handler
    completionHandler.onFailure(failureResult);
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
    const postingDuration = this.getTimestamp() - startTime;

    this.logger.info(`⚡ POST SUCCESS: ${taskId}`);
    this.logger.info(`   📋 Request ID: ${postedData.drId}`);
    this.logger.info(`   📦 Block Height: ${postedData.blockHeight}`);
    this.logger.info(`   ⏱️ Posting Duration: ${postingDuration}ms`);
    this.logger.info(`   🔥 Oracle execution started in parallel`);
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
    
    this.logger.error(`❌ Task ${taskId} failed:`, error);
    this.registry.markAsFailed(taskId, error instanceof Error ? error : new Error(String(error)));
    
    const failureResult: AsyncTaskResult = {
      taskId,
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      completedAt,
      duration
    };
    
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
   * Reset memo generator
   */
  reset(): void {
    this.memoGenerator.reset();
  }
} 