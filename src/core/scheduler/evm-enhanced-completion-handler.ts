/**
 * EVM-Enhanced Task Completion Handler
 * Extends the base completion handler to also push results to EVM networks
 */

import type { ILoggingService } from '../../services';
import type { ITimerService } from '../../infrastructure';
import type { SchedulerStatistics } from './statistics';
import type { SchedulerConfig } from '../../types';
import type { AsyncTaskResult, TaskCompletionHandler } from './types';
import { SchedulerTaskCompletionHandler } from './task-completion-handler';
import { EvmResultPoster } from '../../evm-networks';
import { getEnabledEvmNetworks, validateAllEvmNetworks } from '../../../config';
import type { SedaResultData, EvmPostingResult } from '../../evm-networks/types';

/**
 * Enhanced completion handler that posts results to EVM networks
 */
export class EvmEnhancedCompletionHandler implements TaskCompletionHandler {
  private baseHandler: SchedulerTaskCompletionHandler;
  private evmPosters: EvmResultPoster[] = [];
  private isEvmEnabled: boolean = false;

  constructor(
    private logger: ILoggingService,
    private statistics: SchedulerStatistics,
    private config: SchedulerConfig,
    private isRunning: () => boolean,
    private getActiveTaskCount: () => number,
    private timerService?: ITimerService
  ) {
    // Initialize the base handler
    this.baseHandler = new SchedulerTaskCompletionHandler(
      logger,
      statistics,
      config,
      isRunning,
      getActiveTaskCount,
      timerService
    );

    // Initialize EVM posting
    this.initializeEvmPosting();
  }

  /**
   * Initialize EVM posting capabilities
   */
  private initializeEvmPosting(): void {
    try {
      const enabledNetworks = getEnabledEvmNetworks();
      
      if (enabledNetworks.length === 0) {
        this.logger.info('📡 No EVM networks configured - running in SEDA-only mode');
        return;
      }

      // Validate all EVM network configurations
      validateAllEvmNetworks();

      // Create EVM posters for each enabled network
      this.evmPosters = enabledNetworks.map(network => {
        this.logger.info(`🔗 Initializing EVM poster for ${network.displayName}`);
        return new EvmResultPoster(network);
      });

      this.isEvmEnabled = true;
      this.logger.info(`✅ EVM posting enabled for ${this.evmPosters.length} networks`);

    } catch (error) {
      this.logger.error('❌ Failed to initialize EVM posting:', error);
      this.logger.info('📡 Falling back to SEDA-only mode');
      this.isEvmEnabled = false;
    }
  }

  /**
   * Handle successful task completion - includes EVM posting
   */
  async onSuccess(result: AsyncTaskResult): Promise<void> {
    // First, handle the base SEDA completion logging
    this.baseHandler.onSuccess(result);

    // Then, if EVM is enabled and we have a successful SEDA result, post to EVM networks
    if (this.isEvmEnabled && this.shouldPostToEvm(result)) {
      await this.postToEvmNetworks(result);
    }
  }

  /**
   * Handle failed task completion
   */
  onFailure(result: AsyncTaskResult): void {
    // Delegate to base handler
    this.baseHandler.onFailure(result);
  }

  /**
   * Determine if result should be posted to EVM networks
   */
  private shouldPostToEvm(result: AsyncTaskResult): boolean {
    // Only post successful oracle results that have complete data
    return !!(
      result.drId &&
      result.blockHeight &&
      result.result &&
      result.result.type === 'oracle_completed' &&
      result.result.exitCode === 0
    );
  }

  /**
   * Post result to all enabled EVM networks
   */
  private async postToEvmNetworks(result: AsyncTaskResult): Promise<void> {
    if (this.evmPosters.length === 0) {
      return;
    }

    this.logger.info('\n🌐 Starting EVM network posting...');
    this.logger.info(`├─ Posting to ${this.evmPosters.length} EVM networks`);
    this.logger.info(`└─ DataRequest ID: ${result.drId}`);

    // Prepare SEDA result data for EVM posting
    const sedaResultData: SedaResultData = {
      drId: result.drId!,
      result: result.result?.result || {}, // The actual oracle result
      blockHeight: BigInt(result.blockHeight!),
      txHash: result.result?.txHash || `task-${result.taskId}`, // Use task ID as fallback
      timestamp: Date.now()
    };

    // Post to all networks in parallel for maximum speed
    const postingPromises = this.evmPosters.map(poster => 
      this.postToSingleEvmNetwork(poster, sedaResultData)
    );

    const evmResults = await Promise.allSettled(postingPromises);

    // Log summary
    this.logEvmPostingSummary(evmResults, result.drId!);
  }

  /**
   * Post to a single EVM network with error handling
   */
  private async postToSingleEvmNetwork(
    poster: EvmResultPoster, 
    resultData: SedaResultData
  ): Promise<EvmPostingResult> {
    try {
      return await poster.postResult(resultData);
    } catch (error) {
      const networkInfo = poster.getNetworkInfo();
      const errorResult: EvmPostingResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        network: networkInfo.name,
        attempt: 1,
        duration: 0
      };

      this.logger.error(`❌ Failed to post to ${networkInfo.displayName}: ${errorResult.error}`);
      return errorResult;
    }
  }

  /**
   * Log summary of EVM posting results
   */
  private logEvmPostingSummary(
    results: PromiseSettledResult<EvmPostingResult>[], 
    drId: string
  ): void {
    let successCount = 0;
    let failureCount = 0;

    this.logger.info('\n📊 EVM Posting Summary:');
    this.logger.info('├─────────────────────────────────────────────────────────────────────┤');

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const postingResult = result.value;
        if (postingResult.success) {
          successCount++;
          this.logger.info(`│ ✅ ${postingResult.network.toUpperCase()}: Success (${postingResult.txHash?.substring(0, 10)}...)`);
        } else {
          failureCount++;
          this.logger.info(`│ ❌ ${postingResult.network.toUpperCase()}: ${postingResult.error}`);
        }
      } else {
        failureCount++;
        this.logger.info(`│ ❌ Network ${index + 1}: ${result.reason}`);
      }
    });

    this.logger.info('├─────────────────────────────────────────────────────────────────────┤');
    this.logger.info(`│ 📈 EVM Results: ${successCount} successful, ${failureCount} failed`);
    this.logger.info(`│ 🔗 DataRequest: ${drId}`);
    this.logger.info('└─────────────────────────────────────────────────────────────────────┘');
  }
} 