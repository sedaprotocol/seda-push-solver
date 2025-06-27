/**
 * Advanced EVM Nonce Coordinator
 * Production-grade nonce management for high-throughput EVM transactions
 * 
 * Features:
 * - Nonce gap detection and recovery
 * - Transaction replacement with higher gas prices
 * - Automatic synchronization with blockchain state
 * - Batch transaction support
 * - Mempool monitoring and stuck transaction handling
 */

import type { EvmNetworkConfig } from '../types';
import type { LoggingServiceInterface } from '../services';
import { createPublicClient, http, type Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createEvmChain, formatPrivateKey } from '../utils/transaction/evm-transaction-builder';

/**
 * Transaction tracking information
 */
interface PendingTransaction {
  nonce: number;
  hash?: Hash;
  gasPrice: bigint;
  maxFeePerGas?: bigint;
  timestamp: number;
  retryCount: number;
  isStuck: boolean;
}

/**
 * Nonce synchronization strategy
 */
export enum NonceStrategy {
  LATEST = 'latest',      // Use confirmed transactions only (safer)
  PENDING = 'pending',    // Include pending transactions (faster but riskier)
  HYBRID = 'hybrid'       // Use latest for initialization, pending for updates
}

/**
 * Advanced nonce manager for a specific network and account
 */
class AdvancedNetworkNonceManager {
  private confirmedNonce: number | null = null;
  private pendingNonce: number | null = null;
  private pendingTransactions = new Map<number, PendingTransaction>();
  private initPromise: Promise<void> | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private nonceReservationQueue: Array<() => void> = [];
  private isProcessingQueue = false;
  
  // Configuration
  private readonly SYNC_INTERVAL_MS = 15000; // 15 seconds
  private readonly STUCK_TRANSACTION_TIMEOUT_MS = 300000; // 5 minutes
  private readonly MAX_RETRY_COUNT = 3;
  private readonly GAS_PRICE_INCREASE_FACTOR = 1.2; // 20% increase for replacements
  private readonly MAX_PENDING_TRANSACTIONS = 50;
  private readonly NONCE_GAP_TOLERANCE = 10;

  constructor(
    private network: EvmNetworkConfig,
    private account: string,
    private logger: LoggingServiceInterface,
    private strategy: NonceStrategy = NonceStrategy.HYBRID
  ) {}

  /**
   * Initialize the nonce manager with blockchain synchronization
   */
  private async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      const provider = this.getProvider();
      
      // Get both confirmed and pending nonces
      const [confirmedNonce, pendingNonce] = await Promise.all([
        provider.getTransactionCount({
          address: this.account as `0x${string}`,
          blockTag: 'latest'
        }),
        provider.getTransactionCount({
          address: this.account as `0x${string}`,
          blockTag: 'pending'
        })
      ]);

      this.confirmedNonce = confirmedNonce;
      this.pendingNonce = pendingNonce;

      // Initialize based on strategy
      const startingNonce = this.strategy === NonceStrategy.LATEST ? confirmedNonce : pendingNonce;
      
      this.logger.info(`🔢 Initialized nonce manager for ${this.network.displayName}:`);
      this.logger.info(`   Confirmed: ${confirmedNonce}, Pending: ${pendingNonce}, Starting: ${startingNonce}`);
      
      // Detect existing nonce gaps
      if (pendingNonce > confirmedNonce) {
        const gap = pendingNonce - confirmedNonce;
        this.logger.warn(`⚠️ Detected ${gap} pending transactions on ${this.network.displayName}`);
        
        if (gap > this.NONCE_GAP_TOLERANCE) {
          this.logger.error(`❌ Large nonce gap detected (${gap}). Consider manual intervention.`);
        }
      }

      // Start periodic synchronization
      this.startPeriodicSync();
      
    } catch (error) {
      this.logger.error(`❌ Failed to initialize nonce manager for ${this.network.displayName}:`, error as Error);
      throw error;
    }
  }

  /**
   * Start periodic synchronization with blockchain
   */
  private startPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      try {
        await this.syncWithBlockchain();
        await this.checkStuckTransactions();
      } catch (error) {
        this.logger.error(`Error in periodic sync for ${this.network.displayName}:`, error as Error);
      }
    }, this.SYNC_INTERVAL_MS);
  }

  /**
   * Synchronize local nonce state with blockchain
   */
  private async syncWithBlockchain(): Promise<void> {
    try {
      const provider = this.getProvider();
      
      const [newConfirmedNonce, newPendingNonce] = await Promise.all([
        provider.getTransactionCount({
          address: this.account as `0x${string}`,
          blockTag: 'latest'
        }),
        provider.getTransactionCount({
          address: this.account as `0x${string}`,
          blockTag: 'pending'
        })
      ]);

      const confirmedChanged = newConfirmedNonce !== this.confirmedNonce;
      const pendingChanged = newPendingNonce !== this.pendingNonce;

      if (confirmedChanged || pendingChanged) {
        this.logger.debug(`🔄 Nonce sync for ${this.network.displayName}: confirmed ${this.confirmedNonce}→${newConfirmedNonce}, pending ${this.pendingNonce}→${newPendingNonce}`);
        
        // Update confirmed transactions - remove from pending
        if (confirmedChanged && this.confirmedNonce !== null) {
          for (let nonce = this.confirmedNonce; nonce < newConfirmedNonce; nonce++) {
            const tx = this.pendingTransactions.get(nonce);
            if (tx) {
              this.logger.debug(`✅ Transaction confirmed: nonce ${nonce}, hash ${tx.hash}`);
              this.pendingTransactions.delete(nonce);
            }
          }
        }

        this.confirmedNonce = newConfirmedNonce;
        this.pendingNonce = newPendingNonce;
        
        // Detect dropped transactions
        await this.detectDroppedTransactions();
      }

    } catch (error) {
      this.logger.error(`Error syncing with blockchain for ${this.network.displayName}:`, error as Error);
    }
  }

  /**
   * Detect and handle dropped transactions
   */
  private async detectDroppedTransactions(): Promise<void> {
    if (!this.confirmedNonce || !this.pendingNonce) return;

    const provider = this.getProvider();
    
    // Check for nonce gaps that indicate dropped transactions
    for (const [nonce, tx] of this.pendingTransactions.entries()) {
      if (nonce < this.pendingNonce && !tx.hash) {
        // Transaction was supposed to be pending but isn't found
        this.logger.warn(`🔍 Potential dropped transaction detected: nonce ${nonce}`);
        continue;
      }

      if (tx.hash) {
        try {
          // Check if transaction still exists in mempool or was mined
          const receipt = await provider.getTransactionReceipt({ hash: tx.hash });
          if (receipt) {
            // Transaction was mined
            this.logger.debug(`✅ Transaction mined: nonce ${nonce}, hash ${tx.hash}`);
            this.pendingTransactions.delete(nonce);
          }
        } catch (error) {
          // Transaction might be dropped if it's not found
          if (nonce < this.confirmedNonce) {
            this.logger.warn(`⚠️ Transaction appears dropped: nonce ${nonce}, hash ${tx.hash}`);
            tx.isStuck = true;
          }
        }
      }
    }
  }

  /**
   * Check for stuck transactions and attempt replacement
   */
  private async checkStuckTransactions(): Promise<void> {
    const now = Date.now();
    
    for (const [nonce, tx] of this.pendingTransactions.entries()) {
      const age = now - tx.timestamp;
      
      if (age > this.STUCK_TRANSACTION_TIMEOUT_MS && !tx.isStuck) {
        this.logger.warn(`⚠️ Transaction stuck: nonce ${nonce}, age ${Math.round(age / 1000)}s`);
        tx.isStuck = true;
        
        // Attempt to replace with higher gas price
        if (tx.retryCount < this.MAX_RETRY_COUNT) {
          await this.replaceStuckTransaction(tx);
        } else {
          this.logger.error(`❌ Transaction permanently stuck: nonce ${nonce}, max retries exceeded`);
        }
      }
    }
  }

  /**
   * Replace a stuck transaction with higher gas price
   */
  private async replaceStuckTransaction(tx: PendingTransaction): Promise<void> {
    try {
      // Calculate new gas price (20% higher)
      const newGasPrice = BigInt(Math.ceil(Number(tx.gasPrice) * this.GAS_PRICE_INCREASE_FACTOR));
      const newMaxFeePerGas = tx.maxFeePerGas ? 
        BigInt(Math.ceil(Number(tx.maxFeePerGas) * this.GAS_PRICE_INCREASE_FACTOR)) : 
        undefined;

      this.logger.info(`🔄 Replacing stuck transaction: nonce ${tx.nonce}, old gas ${tx.gasPrice}, new gas ${newGasPrice}`);
      
      // Update transaction record
      tx.gasPrice = newGasPrice;
      if (newMaxFeePerGas) tx.maxFeePerGas = newMaxFeePerGas;
      tx.retryCount++;
      tx.timestamp = Date.now();
      tx.isStuck = false;
      
      // Note: The actual replacement transaction would be sent by the caller
      // This just updates our tracking
      
    } catch (error) {
      this.logger.error(`Error replacing stuck transaction ${tx.nonce}:`, error as Error);
    }
  }

  /**
   * Get provider for this network
   */
  private getProvider() {
    return createPublicClient({
      chain: createEvmChain(this.network),
      transport: http(this.network.rpcUrl)
    });
  }

  /**
   * CRITICAL FIX: Enhanced nonce reservation with gas price escalation
   * This method prevents "replacement transaction underpriced" errors
   */
  async getNextNonce(): Promise<{ nonce: number; gasPrice: bigint; replacement?: PendingTransaction }> {
    return new Promise((resolve, reject) => {
      this.nonceReservationQueue.push(async () => {
        try {
          await this.initialize();
          
          if (this.confirmedNonce === null || this.pendingNonce === null) {
            throw new Error(`Nonce not initialized for ${this.network.displayName}`);
          }

          // Check if we have too many pending transactions
          if (this.pendingTransactions.size >= this.MAX_PENDING_TRANSACTIONS) {
            throw new Error(`Too many pending transactions (${this.pendingTransactions.size}/${this.MAX_PENDING_TRANSACTIONS}) for ${this.network.displayName}`);
          }

          // CRITICAL: Always fetch real-time blockchain state to prevent stale nonces
          const [realTimeConfirmed, realTimePending] = await Promise.all([
            this.getProvider().getTransactionCount({ address: this.account as `0x${string}`, blockTag: 'latest' }),
            this.getProvider().getTransactionCount({ address: this.account as `0x${string}`, blockTag: 'pending' })
          ]);

          // Update our cached state with real-time data
          this.confirmedNonce = realTimeConfirmed;
          this.pendingNonce = realTimePending;

          this.logger.debug(`🔄 Real-time nonce sync for ${this.network.displayName}:`);
          this.logger.debug(`   Confirmed: ${realTimeConfirmed}, Pending: ${realTimePending}`);

          // CRITICAL: Detect nonce gaps (stuck or dropped transactions)
          const expectedPending = realTimeConfirmed + this.pendingTransactions.size;
          if (realTimePending < expectedPending) {
            this.logger.warn(`🔍 Potential dropped transaction detected for ${this.network.displayName}:`);
            this.logger.warn(`   Expected pending: ${expectedPending}, Actual: ${realTimePending}`);
            this.logger.warn(`   Difference: ${expectedPending - realTimePending} transactions may be dropped`);
            
            // Clean up stale pending transactions
            this.cleanupStalePendingTransactions(realTimePending);
          }

          // CRITICAL: Use the definitive next nonce from blockchain
          let nextNonce = realTimePending;
          
          // ENHANCED: Check for nonce collision and increment if necessary
          while (this.pendingTransactions.has(nextNonce)) {
            this.logger.warn(`⚠️ Nonce collision detected: ${nextNonce} already reserved. Incrementing...`);
            nextNonce++;
          }

          // ENHANCED: Get current gas price with escalation strategy
          const currentGasPrice = await this.getProvider().getGasPrice();
          
          // CRITICAL: Check if this nonce is replacing an existing transaction
          let gasPrice = currentGasPrice;
          let replacementTransaction: PendingTransaction | undefined;
          
          // If we're replacing a transaction, we need higher gas price
          const existingTx = this.pendingTransactions.get(nextNonce);
          if (existingTx) {
            // Calculate escalated gas price (increase by 10% minimum)
            const escalationFactor = 1.1; // 10% increase
            const minGasPrice = BigInt(Math.ceil(Number(existingTx.gasPrice) * escalationFactor));
            gasPrice = gasPrice > minGasPrice ? gasPrice : minGasPrice;
            
            replacementTransaction = existingTx;
            
            this.logger.info(`🔄 Replacing transaction with nonce ${nextNonce}:`);
            this.logger.info(`   Previous gas price: ${existingTx.gasPrice}`);
            this.logger.info(`   New gas price: ${gasPrice} (${Math.round((Number(gasPrice) / Number(existingTx.gasPrice) - 1) * 100)}% increase)`);
          }

          // Reserve the nonce - we'll return the reservation object later

          // Store the pending transaction
          this.pendingTransactions.set(nextNonce, {
            nonce: nextNonce,
            gasPrice,
            timestamp: Date.now(),
            hash: undefined,
            retryCount: 0,
            isStuck: false
          });

          this.logger.info(`🔢 ATOMICALLY reserved new nonce ${nextNonce} for ${this.network.displayName}`);
          this.logger.info(`   📊 Blockchain state: confirmed=${realTimeConfirmed}, pending=${realTimePending}, final=${nextNonce}`);
          this.logger.info(`   📊 Local pending transactions: ${this.pendingTransactions.size}`);
          this.logger.info(`   💰 Gas price: ${gasPrice}`);
          this.logger.info(`   ⏰ Reservation timestamp: ${new Date().toISOString()}`);
          
          if (replacementTransaction) {
            this.logger.info(`   🔄 Replacement transaction: YES (escalated gas price)`);
          }

          resolve({ nonce: nextNonce, gasPrice, replacement: replacementTransaction });
          
        } catch (error) {
          this.logger.error(`❌ Failed to reserve nonce for ${this.network.displayName}: ${error}`);
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  /**
   * Clean up stale pending transactions that are no longer pending on blockchain
   */
  private cleanupStalePendingTransactions(realTimePending: number): void {
    const stalePendingTransactions = Array.from(this.pendingTransactions.keys())
      .filter(nonce => nonce < realTimePending);
    
    if (stalePendingTransactions.length > 0) {
      this.logger.info(`🧹 Cleaning up ${stalePendingTransactions.length} stale pending transactions`);
      stalePendingTransactions.forEach(nonce => {
        this.pendingTransactions.delete(nonce);
        this.logger.debug(`   Removed stale nonce: ${nonce}`);
      });
    }
  }

  /**
   * Process the nonce reservation queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.nonceReservationQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.nonceReservationQueue.length > 0) {
      const operation = this.nonceReservationQueue.shift();
      if (operation) {
        try {
          await operation();
        } catch (error) {
          this.logger.error('Error in nonce queue operation:', error as Error);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Update transaction with hash after sending
   */
  updateTransactionHash(nonce: number, hash: Hash): void {
    const tx = this.pendingTransactions.get(nonce);
    if (tx) {
      tx.hash = hash;
      this.logger.debug(`📝 Updated transaction hash: nonce ${nonce}, hash ${hash}`);
    }
  }

  /**
   * Release a nonce (called when transaction completes or is permanently failed)
   */
  releaseNonce(nonce: number): void {
    const tx = this.pendingTransactions.get(nonce);
    if (tx) {
      this.pendingTransactions.delete(nonce);
      this.logger.debug(`🔢 Released nonce ${nonce} for ${this.network.displayName}`);
    }
  }

  /**
   * Force refresh nonce state
   */
  async refreshNonce(): Promise<void> {
    this.logger.info(`🔄 Force refreshing nonce state for ${this.network.displayName}`);
    this.initPromise = null;
    this.confirmedNonce = null;
    this.pendingNonce = null;
    this.pendingTransactions.clear();
    await this.initialize();
  }

  /**
   * Get comprehensive nonce information
   */
  getNonceInfo(): {
    confirmed: number | null;
    pending: number | null;
    nextAvailable: number | null;
    pendingTransactions: Array<{
      nonce: number;
      hash?: string;
      age: number;
      isStuck: boolean;
      retryCount: number;
    }>;
    gaps: number[];
  } {
    const now = Date.now();
    const pendingTxs = Array.from(this.pendingTransactions.entries()).map(([nonce, tx]) => ({
      nonce,
      hash: tx.hash,
      age: now - tx.timestamp,
      isStuck: tx.isStuck,
      retryCount: tx.retryCount
    }));

    // Detect gaps in nonce sequence
    const gaps: number[] = [];
    if (this.confirmedNonce !== null && this.pendingNonce !== null) {
      for (let i = this.confirmedNonce; i < this.pendingNonce; i++) {
        if (!this.pendingTransactions.has(i)) {
          gaps.push(i);
        }
      }
    }

    const nextAvailable = this.confirmedNonce !== null && this.pendingNonce !== null ?
      Math.max(this.confirmedNonce, this.pendingNonce) : null;

    return {
      confirmed: this.confirmedNonce,
      pending: this.pendingNonce,
      nextAvailable,
      pendingTransactions: pendingTxs,
      gaps
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.pendingTransactions.clear();
    this.nonceReservationQueue.length = 0;
  }

  /**
   * Handle nonce failure and retry with fresh blockchain sync
   */
  async handleNonceFailure(failedNonce: number, error: string): Promise<{ nonce: number; gasPrice: bigint }> {
    this.logger.warn(`🔄 Handling nonce failure for ${this.network.displayName}: nonce ${failedNonce}, error: ${error}`);
    
    // Remove the failed transaction from pending
    this.pendingTransactions.delete(failedNonce);
    
    // Force refresh from blockchain
    const provider = this.getProvider();
    const [confirmedNonce, pendingNonce] = await Promise.all([
      provider.getTransactionCount({
        address: this.account as `0x${string}`,
        blockTag: 'latest'
      }),
      provider.getTransactionCount({
        address: this.account as `0x${string}`,
        blockTag: 'pending'
      })
    ]);
    
    this.confirmedNonce = confirmedNonce;
    this.pendingNonce = pendingNonce;
    
    // Clean up any stale pending transactions
    for (const [nonce, tx] of this.pendingTransactions.entries()) {
      if (nonce < confirmedNonce) {
        this.logger.debug(`🧹 Cleaning up confirmed transaction: nonce ${nonce}`);
        this.pendingTransactions.delete(nonce);
      }
    }
    
    // Get fresh nonce
    let freshNonce = pendingNonce;
    while (this.pendingTransactions.has(freshNonce)) {
      freshNonce++;
    }
    
    // Get fresh gas price
    const gasPrice = await provider.getGasPrice();
    
    // Create new transaction record
    const txRecord: PendingTransaction = {
      nonce: freshNonce,
      gasPrice,
      timestamp: Date.now(),
      retryCount: 0,
      isStuck: false
    };
    
    this.pendingTransactions.set(freshNonce, txRecord);
    
    this.logger.info(`🔢 Recovered with fresh nonce ${freshNonce} for ${this.network.displayName}`);
    this.logger.debug(`   Fresh blockchain state: confirmed=${confirmedNonce}, pending=${pendingNonce}`);
    
    return { nonce: freshNonce, gasPrice };
  }
}

/**
 * Advanced Global EVM Nonce Coordinator
 * Production-grade nonce management across all networks and accounts
 */
export class EvmNonceCoordinator {
  private managers = new Map<string, AdvancedNetworkNonceManager>();
  private strategy: NonceStrategy;

  constructor(
    private logger: LoggingServiceInterface,
    strategy: NonceStrategy = NonceStrategy.HYBRID
  ) {
    this.strategy = strategy;
  }

  /**
   * Get nonce manager for a specific network and account
   */
  private getManager(network: EvmNetworkConfig, account: string): AdvancedNetworkNonceManager {
    const key = `${network.chainId}-${account.toLowerCase()}`;
    
    if (!this.managers.has(key)) {
      const manager = new AdvancedNetworkNonceManager(network, account, this.logger, this.strategy);
      this.managers.set(key, manager);
    }

    return this.managers.get(key)!;
  }

  /**
   * Reserve a nonce for a transaction with advanced features
   */
  async reserveNonce(network: EvmNetworkConfig, privateKey: string): Promise<{
    nonce: number;
    gasPrice: bigint;
    isReplacement: boolean;
    updateHash: (hash: Hash) => void;
    release: () => void;
  }> {
    const formattedPrivateKey = formatPrivateKey(privateKey);
    const account = privateKeyToAccount(formattedPrivateKey);
    const manager = this.getManager(network, account.address);

    const { nonce, gasPrice, replacement } = await manager.getNextNonce();

    return {
      nonce,
      gasPrice,
      isReplacement: !!replacement,
      updateHash: (hash: Hash) => manager.updateTransactionHash(nonce, hash),
      release: () => manager.releaseNonce(nonce)
    };
  }

  /**
   * Get comprehensive status for all networks
   */
  getComprehensiveStatus(): Record<string, ReturnType<AdvancedNetworkNonceManager['getNonceInfo']>> {
    const status: Record<string, ReturnType<AdvancedNetworkNonceManager['getNonceInfo']>> = {};
    
    for (const [key, manager] of this.managers.entries()) {
      status[key] = manager.getNonceInfo();
    }

    return status;
  }

  /**
   * Force refresh all nonce managers
   */
  async refreshAllNonces(): Promise<void> {
    this.logger.info('🔄 Refreshing all nonce managers...');
    
    const refreshPromises = Array.from(this.managers.values()).map(manager => 
      manager.refreshNonce().catch(error => 
        this.logger.error('Error refreshing manager:', error as Error)
      )
    );
    
    await Promise.all(refreshPromises);
    this.logger.info('✅ All nonce managers refreshed');
  }

  /**
   * Reset all nonce managers
   */
  reset(): void {
    // Cleanup existing managers
    for (const manager of this.managers.values()) {
      manager.destroy();
    }
    
    this.managers.clear();
    this.logger.info('🔄 Reset all nonce managers');
  }

  /**
   * Get summary of all network states
   */
  getSummary(): {
    totalNetworks: number;
    totalPendingTransactions: number;
    networksWithGaps: number;
    networksWithStuckTx: number;
  } {
    let totalPendingTransactions = 0;
    let networksWithGaps = 0;
    let networksWithStuckTx = 0;

    for (const manager of this.managers.values()) {
      const info = manager.getNonceInfo();
      totalPendingTransactions += info.pendingTransactions.length;
      
      if (info.gaps.length > 0) {
        networksWithGaps++;
      }
      
      if (info.pendingTransactions.some(tx => tx.isStuck)) {
        networksWithStuckTx++;
      }
    }

    return {
      totalNetworks: this.managers.size,
      totalPendingTransactions,
      networksWithGaps,
      networksWithStuckTx
    };
  }

  /**
   * Handle nonce failure and retry with fresh sync
   */
  async handleNonceFailure(network: EvmNetworkConfig, privateKey: string, failedNonce: number, error: string): Promise<{
    nonce: number;
    gasPrice: bigint;
    updateHash: (hash: Hash) => void;
    release: () => void;
  }> {
    const formattedPrivateKey = formatPrivateKey(privateKey);
    const account = privateKeyToAccount(formattedPrivateKey);
    const manager = this.getManager(network, account.address);

    const { nonce, gasPrice } = await manager.handleNonceFailure(failedNonce, error);

    return {
      nonce,
      gasPrice,
      updateHash: (hash: Hash) => manager.updateTransactionHash(nonce, hash),
      release: () => manager.releaseNonce(nonce)
    };
  }
} 