/**
 * Data Request Service
 * Domain service for managing DataRequest operations
 */

import type { LoggingServiceInterface } from '../../services';
import type { SEDADataRequestBuilder } from '../../core/data-request';
import type { DataRequestResult, DataRequestOptions } from '../../types';

/**
 * Data Request Service
 * Encapsulates business logic for DataRequest operations
 */
export class DataRequestService {
  constructor(
    private builder: SEDADataRequestBuilder,
    private logger: LoggingServiceInterface
  ) {}

  /**
   * Post a DataRequest with business logic
   */
  async postDataRequest(options: DataRequestOptions = {}): Promise<DataRequestResult> {
    this.logger.info('Starting DataRequest posting process');
    
    try {
      const result = await this.builder.postDataRequest(options);
      
      this.logger.info(`✅ DataRequest completed successfully: ${result.drId}`);
      return result;
    } catch (error) {
      this.logger.error('❌ DataRequest failed:', error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get builder configuration
   */
  getConfiguration() {
    return this.builder.getConfig();
  }

  /**
   * Check if builder is ready
   */
  isReady(): boolean {
    return this.builder.isBuilderInitialized();
  }
} 