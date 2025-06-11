/**
 * Cosmos Sequence Number Coordinator for SEDA DataRequest Scheduler
 * Manages sequential access to SEDA Signer to prevent account sequence mismatch errors
 * in concurrent async tasks by ensuring only one transaction is submitted at a time
 */

import type { ILoggingService } from '../../services';
import type { Signer } from '@seda-protocol/dev-tools';

/**
 * Interface for transaction posting with sequence coordination
 * Only coordinates the posting phase, not the full task lifecycle
 */
export interface SequencedPosting<T> {
  postTransaction: (sequenceNumber: number) => Promise<T>; // Just post the transaction
  taskId: string;
  timeout?: number;
}

/**
 * Interface for posting results
 */
export interface PostingResult<T> {
  taskId: string;
  success: boolean;
  result?: T; // The posted transaction result (drId, blockHeight, etc.)
  error?: Error;
  sequence: number;
  startTime: number;
  endTime: number;
  duration: number;
}

/**
 * Configuration for Cosmos Sequence Coordinator
 */
export interface CosmosSequenceConfig {
  postingTimeoutMs: number;
  defaultTimeoutMs: number;
  maxQueueSize: number;
}

/**
 * Cosmos Sequence Coordinator
 * Provides sequential access to SEDA Signer for concurrent async tasks
 * to prevent Cosmos SDK account sequence mismatch errors
 */
export class CosmosSequenceCoordinator {
  private executionQueue: Array<{
    execution: SequencedPosting<any>;
    resolve: (result: PostingResult<any>) => void;
    reject: (error: Error) => void;
  }> = [];
  private isProcessing = false;
  private sequenceNumber: number = 0; // Will be initialized from blockchain
  private isInitialized = false;

  constructor(
    private logger: ILoggingService,
    private config: CosmosSequenceConfig
  ) {}

  /**
   * Initialize the sequence coordinator with the current account sequence number
   */
  async initialize(signer: Signer): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('🔍 Querying account sequence number from blockchain...');
      
      // Query the current account sequence number from the blockchain
      const accountSequence = await this.queryAccountSequence(signer);
      this.sequenceNumber = accountSequence;
      this.isInitialized = true;
      
      this.logger.info(`✅ Initialized sequence coordinator with account sequence: ${this.sequenceNumber}`);
    } catch (error) {
      this.logger.error('❌ Failed to initialize sequence coordinator:', error);
      // Fallback to starting from 0 if query fails (new account)
      this.sequenceNumber = 0;
      this.isInitialized = true;
      this.logger.warn('⚠️ Using fallback sequence number: 0 (assuming new account)');
    }
  }

  /**
   * Query the current account sequence number from the blockchain using CosmJS
   */
  private async queryAccountSequence(signer: Signer): Promise<number> {
    try {
      // Get the address and endpoint from the signer
      const address = signer.getAddress();
      const endpoint = signer.getEndpoint();
      
      this.logger.info(`🔍 Querying account ${address} from ${endpoint}`);
      
      // Use CosmJS Stargate client to query account information
      // We'll use the Stargate client from cosmjs which should be available through the signer
      const cosmjsSigner = signer.getSigner(); // This returns DirectSecp256k1HdWallet
      
      try {
        // Import StargateClient dynamically to avoid module loading issues
        const { StargateClient } = await import('@cosmjs/stargate');
        
        // Create a Stargate client for querying
        const client = await StargateClient.connect(endpoint);
        
        try {
          // Query account information
          const account = await client.getAccount(address);
          
          if (account) {
            const sequence = account.sequence;
            this.logger.info(`📋 Account ${address} current sequence: ${sequence}`);
            
            // Clean up the client
            client.disconnect();
            
            return sequence;
          } else {
            // Account doesn't exist yet - this means sequence 0
            this.logger.info(`📋 Account ${address} not found - assuming new account with sequence 0`);
            
            // Clean up the client
            client.disconnect();
            
            return 0;
          }
        } finally {
          // Ensure we always disconnect the client
          if (client) {
            client.disconnect();
          }
        }
      } catch (importError) {
        this.logger.warn('❌ Failed to import @cosmjs/stargate, trying alternative method');
        
        // Fallback to direct RPC query if CosmJS import fails
        return await this.queryAccountSequenceRpc(address, endpoint);
      }
      
    } catch (error) {
      this.logger.error('❌ Error querying account sequence:', error);
      throw error;
    }
  }

  /**
   * Fallback method to query account sequence using direct RPC calls
   */
  private async queryAccountSequenceRpc(address: string, rpcEndpoint: string): Promise<number> {
    try {
      // Try Tendermint RPC method first (more reliable)
      const rpcUrl = `${rpcEndpoint}/abci_query`;
      
      this.logger.info(`🔍 Trying Tendermint RPC query: ${rpcUrl}`);
      
      // Query account using ABCI query
      const queryData = {
        path: "store/acc/key",
        data: Buffer.from(`account:${address}`).toString('hex'),
        prove: false
      };
      
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'abci_query',
          params: queryData
        })
      });
      
      if (response.ok) {
        const data = await response.json() as any;
        
        if (data.result && data.result.response && data.result.response.value) {
          // Decode the base64 response
          const accountData = Buffer.from(data.result.response.value, 'base64');
          
          // For now, assume sequence 0 if we can't parse properly
          // This is a simplified approach - full account parsing would require protobuf decoding
          this.logger.info(`📋 Account exists, assuming sequence 0 for safety`);
          return 0;
        } else {
          // Account doesn't exist
          this.logger.info(`📋 Account ${address} not found via RPC - new account, sequence 0`);
          return 0;
        }
      } else {
        throw new Error(`RPC query failed: ${response.status} ${response.statusText}`);
      }
      
    } catch (error) {
      this.logger.warn(`❌ RPC fallback failed: ${error}`);
      
      // Final fallback - assume sequence 0 for new accounts
      this.logger.warn('⚠️ All query methods failed, assuming sequence 0 (new account)');
      return 0;
    }
  }

  /**
   * Execute a transaction with sequence coordination
   * Ensures transactions are executed one at a time to prevent sequence conflicts
   */
  async executeSequenced<T>(execution: SequencedPosting<T>): Promise<PostingResult<T>> {
    if (!this.isInitialized) {
      throw new Error('Sequence coordinator not initialized. Call initialize() first.');
    }

    if (this.executionQueue.length >= this.config.maxQueueSize) {
      throw new Error(`Sequence execution queue is full (max: ${this.config.maxQueueSize})`);
    }

    return new Promise((resolve, reject) => {
      this.executionQueue.push({
        execution,
        resolve,
        reject
      });

      this.logger.info(`🔢 Queued transaction for task ${execution.taskId} (queue size: ${this.executionQueue.length})`);

      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the execution queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.logger.info('🚀 Starting sequence coordinator processing');

    while (this.executionQueue.length > 0) {
      const queueItem = this.executionQueue.shift();
      if (!queueItem) {
        break;
      }

      const { execution, resolve, reject } = queueItem;
      const sequence = this.sequenceNumber; // Use current sequence number, don't increment yet
      const startTime = Date.now();

      this.logger.info(`🔢 Executing sequenced transaction #${sequence} for task ${execution.taskId}`);
      this.logger.info(`   🏷️ This transaction will use account sequence: ${sequence}`);
      this.logger.info(`   📝 Memo will include: "seq:${sequence}"`);

      try {
        // Set up timeout
        const timeout = execution.timeout || this.config.defaultTimeoutMs;
        const timeoutPromise = new Promise<never>((_, rejectTimeout) => {
          setTimeout(() => {
            rejectTimeout(new Error(`Transaction timeout after ${timeout}ms`));
          }, timeout);
        });

        // Race between execution and timeout
        const result = await Promise.race([
          execution.postTransaction(sequence),
          timeoutPromise
        ]);

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Only increment sequence number AFTER successful posting
        this.sequenceNumber++;

        const executionResult: PostingResult<any> = {
          taskId: execution.taskId,
          success: true,
          result,
          sequence,
          startTime,
          endTime,
          duration
        };

        this.logger.info(`✅ Sequenced transaction #${sequence} completed for task ${execution.taskId} (${duration}ms)`);
        this.logger.info(`🔢 Account sequence number incremented to ${this.sequenceNumber} after successful posting`);
        this.logger.info(`   ⏭️ Next transaction will use sequence: ${this.sequenceNumber}`);
        resolve(executionResult);

      } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;

        // Check if this is a "DataRequestAlreadyExists" error - this actually means posting succeeded
        if (error instanceof Error && error.message.includes('DataRequestAlreadyExists')) {
          this.logger.warn(`⚠️ DataRequestAlreadyExists error for task ${execution.taskId} - this means posting actually succeeded!`);
          
          // Increment sequence number since the DataRequest was actually posted
          this.sequenceNumber++;
          
          const executionResult: PostingResult<any> = {
            taskId: execution.taskId,
            success: true,
            result: { success: true, drId: 'unknown-but-posted' },
            sequence,
            startTime,
            endTime,
            duration
          };

          this.logger.info(`✅ Treating as success - sequence number incremented to ${this.sequenceNumber}`);
          resolve(executionResult);
        } else {
          // DO NOT increment sequence number on real failure - allow retry with same sequence
          this.logger.error(`❌ Sequenced transaction #${sequence} failed for task ${execution.taskId} (${duration}ms):`, error);
          this.logger.info(`🔢 Account sequence number ${sequence} not incremented due to posting failure`);

          const executionResult: PostingResult<any> = {
            taskId: execution.taskId,
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            sequence,
            startTime,
            endTime,
            duration
          };

          // Check if it's a sequence-related error
          if (error instanceof Error && this.isSequenceError(error.message)) {
            this.logger.warn(`⚠️ Sequence error detected in task ${execution.taskId}: ${error.message}`);
            // For sequence errors, we don't retry automatically - let the caller handle it
          }

          resolve(executionResult); // Resolve with error result instead of rejecting
        }
      }

      // Small delay between transactions to ensure proper sequencing
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessing = false;
    this.logger.info('✅ Sequence coordinator processing completed');
  }

  /**
   * Check if an error is related to sequence number conflicts
   */
  private isSequenceError(errorMessage: string): boolean {
    const sequenceErrorPatterns = [
      'account sequence mismatch',
      'incorrect account sequence',
      'sequence number',
      'nonce too low',
      'sequence too low'
    ];

    return sequenceErrorPatterns.some(pattern => 
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Get current queue statistics
   */
  getStats() {
    return {
      queueSize: this.executionQueue.length,
      isProcessing: this.isProcessing,
      nextSequenceNumber: this.sequenceNumber,
      maxQueueSize: this.config.maxQueueSize,
      currentSequenceNumber: this.sequenceNumber, // Add current sequence for debugging
      isInitialized: this.isInitialized
    };
  }

  /**
   * Get the current sequence number (for debugging)
   */
  getCurrentSequenceNumber(): number {
    return this.sequenceNumber;
  }

  /**
   * Clear the execution queue (for cleanup)
   */
  clear(): void {
    // Reject all pending executions
    while (this.executionQueue.length > 0) {
      const queueItem = this.executionQueue.shift();
      if (queueItem) {
        queueItem.reject(new Error('Sequence coordinator cleared'));
      }
    }

    this.isProcessing = false;
    // Don't reset sequence number on clear - keep the real account sequence
    this.logger.info('🔄 Cosmos sequence coordinator cleared (sequence number preserved)');
  }

  /**
   * Wait for the queue to be empty
   */
  async waitForQueue(): Promise<void> {
    while (this.executionQueue.length > 0 || this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
} 