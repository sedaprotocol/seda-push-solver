/**
 * Async Task Management for SEDA DataRequest Scheduler
 * Handles the execution and tracking of asynchronous DataRequest tasks
 */

import type { ILoggingService } from '../../services';
import type { SEDADataRequestBuilder } from '../../push-solver';
import type { SchedulerConfig } from '../../types';
import { executeWithRetry } from './retry-handler';
import { UniqueMemoGenerator } from './unique-memo-generator';
import { 
  CosmosSequenceCoordinator, 
  type SequencedPosting, 
  type PostingResult,
  type CosmosSequenceConfig 
} from './cosmos-sequence-coordinator';
import type { SchedulerStatistics } from './statistics';
import { postDataRequestTransaction, awaitDataRequestResult, buildDataRequestInput, buildGasOptions } from '../data-request';
import { getNetworkConfig } from '../network';

/**
 * Interface for tracking async task results
 */
export interface AsyncTaskResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: Error;
  drId?: string;
  blockHeight?: number;
  completedAt: number;
  duration: number;
  sequenceNumber?: number; // Track the sequence number used
}

/**
 * Interface for task completion callbacks
 */
export interface TaskCompletionHandler {
  onSuccess(result: AsyncTaskResult): void;
  onFailure(result: AsyncTaskResult): void;
}

/**
 * Async Task Manager
 * Handles launching and tracking multiple concurrent DataRequest tasks
 * Provides coordination to prevent Cosmos sequence conflicts
 */
export class AsyncTaskManager {
  private activeTasks = new Map<string, Promise<AsyncTaskResult>>();
  private taskCounter = 0;
  private memoGenerator: UniqueMemoGenerator;
  private sequenceCoordinator: CosmosSequenceCoordinator;

  constructor(
    private logger: ILoggingService,
    private cosmosSequenceConfig: CosmosSequenceConfig,
    private getTimestamp: () => number = Date.now
  ) {
    this.memoGenerator = new UniqueMemoGenerator(this.logger);
    this.sequenceCoordinator = new CosmosSequenceCoordinator(this.logger, this.cosmosSequenceConfig);
  }

  /**
   * Initialize the task manager with signer access for sequence coordination
   */
  async initialize(builder: SEDADataRequestBuilder): Promise<void> {
    // Ensure builder is initialized
    if (!builder.isBuilderInitialized()) {
      await builder.initialize();
    }

    // Get the signer and initialize sequence coordinator
    const signer = (builder as any).signer;
    if (!signer) {
      throw new Error('Builder signer not available for sequence coordinator initialization');
    }

    await this.sequenceCoordinator.initialize(signer);
    this.logger.info('✅ Async task manager initialized with real account sequence');
  }

  /**
   * Launch a new async DataRequest task
   */
  launchTask(
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    isRunning: () => boolean,
    completionHandler: TaskCompletionHandler,
    statistics: SchedulerStatistics // Properly typed statistics parameter
  ): string {
    this.taskCounter++;
    const taskId = `task-${this.taskCounter}-${Date.now()}`;
    const requestNumber = this.taskCounter;
    
    this.logger.info(`\n🚀 Launching async DataRequest task #${requestNumber} (${taskId})`);
    this.logger.info(`📊 Active tasks: ${this.activeTasks.size + 1}`);

    // Create the async task promise - but only resolve when oracle result comes back
    const taskPromise = this.executeAsyncDataRequest(
      taskId,
      requestNumber,
      builder,
      config,
      isRunning,
      completionHandler,
      statistics
    );
    
    // Store the task reference
    this.activeTasks.set(taskId, taskPromise);
    
    // Handle final cleanup when task fully completes (oracle result or failure)
    taskPromise
      .finally(() => {
        // Clean up task reference
        this.activeTasks.delete(taskId);
      });

    return taskId;
  }

  /**
   * Execute a single DataRequest asynchronously with sequence coordination
   * This method now handles the complete lifecycle and only calls completion handler 
   * when oracle results are available
   */
  private async executeAsyncDataRequest(
    taskId: string,
    requestNumber: number,
    builder: SEDADataRequestBuilder,
    config: SchedulerConfig,
    isRunning: () => boolean,
    completionHandler: TaskCompletionHandler,
    statistics: SchedulerStatistics
  ): Promise<AsyncTaskResult> {
    const startTime = this.getTimestamp();
    
    try {
      this.logger.info(`\n${'='.repeat(73)}`);
      this.logger.info(`📤 Async DataRequest #${requestNumber} (${taskId}) | ${new Date().toLocaleTimeString()}`);
      this.logger.info('='.repeat(73));

      // Get network configuration for building inputs and query config
      const builderConfig = builder.getConfig();
      const networkConfig = getNetworkConfig(builderConfig.network);

      // Create sequenced posting to prevent Cosmos sequence conflicts
      // This only coordinates the POSTING phase, not the result waiting
      const sequencedPosting: SequencedPosting<{ drId: string; blockHeight: bigint; txHash: string }> = {
        taskId,
        timeout: this.cosmosSequenceConfig.postingTimeoutMs,
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
              
              // Get the signer from the builder (need to make it accessible)
              const signer = (builder as any).signer;
              if (!signer) {
                throw new Error('Builder signer not available');
              }
              
              // Use the split function to ONLY post the transaction
              const result = await postDataRequestTransaction(
                signer,
                postInput,
                gasOptions,
                networkConfig,
                this.logger
              );
              
              return result;
            },
            config.maxRetries,
            requestNumber,
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

      // Phase 1: Post the DataRequest with sequence coordination (fast, ~5-10 seconds)
      this.logger.info(`🎯 Coordinating DataRequest posting for task ${taskId}`);
      const postingResult: PostingResult<{ drId: string; blockHeight: bigint; txHash: string }> = 
        await this.sequenceCoordinator.executeSequenced(sequencedPosting);

      if (!postingResult.success || !postingResult.result) {
        // Posting failed - call completion handler immediately
        const completedAt = this.getTimestamp();
        const duration = completedAt - startTime;
        
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

      // Phase 2: DataRequest posted successfully - log and record posting success
      const postedData = postingResult.result;
      const postingDuration = Date.now() - startTime;

      this.logger.info(`✅ DataRequest posted successfully for task ${taskId}`);
      this.logger.info(`   📋 Request ID: ${postedData.drId}`);
      this.logger.info(`   📦 Block Height: ${postedData.blockHeight}`);
      this.logger.info(`   🔗 Transaction: ${postedData.txHash}`);
      this.logger.info(`   ⏱️ Posting Duration: ${postingDuration}ms`);
      this.logger.info(`   🔍 Now waiting for oracle execution...`);

      // Record that the DataRequest was successfully posted to blockchain
      statistics.recordPosted();

      // Phase 3: Wait for oracle result (this is where completion handler gets called)
      return await this.awaitOracleResultWithCompletion(
        taskId,
        postedData,
        networkConfig,
        builderConfig,
        startTime,
        postingResult.sequence,
        completionHandler
      );
        
    } catch (error) {
      const completedAt = this.getTimestamp();
      const duration = completedAt - startTime;
      
      this.logger.error(`❌ Async task ${taskId} failed:`, error);
      
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
  }

  /**
   * Await oracle execution results and call completion handler when done
   * This replaces the old background tracking approach
   */
  private async awaitOracleResultWithCompletion(
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
      const completedAt = this.getTimestamp();
      const totalDuration = completedAt - taskStartTime;
      
      this.logger.error(`❌ Oracle execution failed for ${taskId}:`, error);
      this.logger.info(`   📋 DataRequest ${postedData.drId} was posted successfully but oracle execution timed out or failed`);
      this.logger.info(`   💡 The DataRequest may still be executing - check the explorer manually`);
      
      if (networkConfig.explorerEndpoint) {
        this.logger.info(`   🔗 Manual Check: ${networkConfig.explorerEndpoint}/data-requests/${postedData.drId}/${postedData.blockHeight}`);
      }
      
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
  }

  /**
   * Get count of active tasks
   */
  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  /**
   * Get memo generator statistics
   */
  getMemoGeneratorStats() {
    return this.memoGenerator.getStats();
  }

  /**
   * Get sequence coordinator statistics
   */
  getSequenceCoordinatorStats() {
    return this.sequenceCoordinator.getStats();
  }

  /**
   * Wait for all active tasks to complete
   */
  async waitForAllTasks(): Promise<AsyncTaskResult[]> {
    const tasks = Array.from(this.activeTasks.values());
    if (tasks.length === 0) {
      return [];
    }
    
    this.logger.info(`⏳ Waiting for ${tasks.length} active tasks to complete...`);
    
    // First wait for all tasks to finish
    const results = await Promise.allSettled(tasks);
    
    // Then wait for the sequence coordinator queue to be empty
    await this.sequenceCoordinator.waitForQueue();
    
    return results.map(result => 
      result.status === 'fulfilled' 
        ? result.value 
        : {
            taskId: 'unknown',
            success: false,
            error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
            completedAt: this.getTimestamp(),
            duration: 0
          }
    );
  }

  /**
   * Clear all active tasks (for cleanup)
   */
  clear(): void {
    this.activeTasks.clear();
    this.memoGenerator.reset();
    this.sequenceCoordinator.clear();
  }
} 