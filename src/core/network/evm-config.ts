/**
 * EVM Chain Configuration
 * Manages configuration for EVM chains that will receive SEDA batch pushes
 */

import type { EVMChainConfig, EVMPusherConfig } from '../../types/evm-types';

/**
 * Default EVM chain configurations
 * These are the supported chains with their default settings
 */
export const DEFAULT_EVM_CHAINS: Record<number, EVMChainConfig> = {
  // Arbitrum One
  42161: {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcEndpoint: 'https://arb1.arbitrum.io/rpc',
    fallbackRpcEndpoints: [
      'https://arbitrum-one.public.blastapi.io',
      'https://endpoints.omniatech.io/v1/arbitrum/one/public'
    ],
    explorerUrl: 'https://arbiscan.io',
    contracts: {
      sedaCore: process.env.ARBITRUM_SEDA_CORE_ADDRESS || '',
      sedaProver: process.env.ARBITRUM_SEDA_PROVER_ADDRESS || ''
    },
    gas: {
      maxGasPrice: BigInt(50_000_000_000), // 50 gwei max
      batchPushGasLimit: 500_000,
      gasPriceMultiplier: 1.1,
      useEIP1559: true
    },
    confirmations: {
      required: 3,
      timeoutMs: 300_000, // 5 minutes
      blockTimeMs: 1_000  // ~1 second blocks
    },
    retry: {
      maxAttempts: 5,
      initialDelayMs: 5_000,
      backoffMultiplier: 2.0,
      maxDelayMs: 60_000
    }
  },

  // Optimism
  10: {
    chainId: 10,
    name: 'Optimism',
    rpcEndpoint: 'https://mainnet.optimism.io',
    fallbackRpcEndpoints: [
      'https://optimism.public.blastapi.io',
      'https://endpoints.omniatech.io/v1/op/mainnet/public'
    ],
    explorerUrl: 'https://optimistic.etherscan.io',
    contracts: {
      sedaCore: process.env.OPTIMISM_SEDA_CORE_ADDRESS || '',
      sedaProver: process.env.OPTIMISM_SEDA_PROVER_ADDRESS || ''
    },
    gas: {
      maxGasPrice: BigInt(20_000_000_000), // 20 gwei max (OP is cheaper)
      batchPushGasLimit: 500_000,
      gasPriceMultiplier: 1.1,
      useEIP1559: true
    },
    confirmations: {
      required: 3,
      timeoutMs: 120_000, // 2 minutes
      blockTimeMs: 2_000  // ~2 second blocks
    },
    retry: {
      maxAttempts: 5,
      initialDelayMs: 3_000,
      backoffMultiplier: 2.0,
      maxDelayMs: 60_000
    }
  },

  // Base
  8453: {
    chainId: 8453,
    name: 'Base',
    rpcEndpoint: 'https://mainnet.base.org',
    fallbackRpcEndpoints: [
      'https://base.public.blastapi.io',
      'https://endpoints.omniatech.io/v1/base/mainnet/public'
    ],
    explorerUrl: 'https://basescan.org',
    contracts: {
      sedaCore: process.env.BASE_SEDA_CORE_ADDRESS || '',
      sedaProver: process.env.BASE_SEDA_PROVER_ADDRESS || ''
    },
    gas: {
      maxGasPrice: BigInt(10_000_000_000), // 10 gwei max
      batchPushGasLimit: 500_000,
      gasPriceMultiplier: 1.1,
      useEIP1559: true
    },
    confirmations: {
      required: 3,
      timeoutMs: 120_000, // 2 minutes
      blockTimeMs: 2_000  // ~2 second blocks
    },
    retry: {
      maxAttempts: 5,
      initialDelayMs: 3_000,
      backoffMultiplier: 2.0,
      maxDelayMs: 60_000
    }
  },

  // Polygon
  137: {
    chainId: 137,
    name: 'Polygon',
    rpcEndpoint: 'https://polygon-rpc.com',
    fallbackRpcEndpoints: [
      'https://polygon.public.blastapi.io',
      'https://rpc.ankr.com/polygon'
    ],
    explorerUrl: 'https://polygonscan.com',
    contracts: {
      sedaCore: process.env.POLYGON_SEDA_CORE_ADDRESS || '',
      sedaProver: process.env.POLYGON_SEDA_PROVER_ADDRESS || ''
    },
    gas: {
      maxGasPrice: BigInt(200_000_000_000), // 200 gwei max (Polygon can be higher)
      batchPushGasLimit: 500_000,
      gasPriceMultiplier: 1.2, // Higher multiplier due to gas volatility
      useEIP1559: true
    },
    confirmations: {
      required: 20, // Higher confirmations for Polygon
      timeoutMs: 600_000, // 10 minutes
      blockTimeMs: 2_500  // ~2.5 second blocks
    },
    retry: {
      maxAttempts: 7, // More retries due to network congestion
      initialDelayMs: 5_000,
      backoffMultiplier: 1.8,
      maxDelayMs: 120_000
    }
  }
};

/**
 * Build EVM pusher configuration from environment variables and defaults
 */
export function buildEVMPusherConfig(): EVMPusherConfig {
  // Get enabled chains from environment
  const enabledChainsEnv = process.env.EVM_ENABLED_CHAINS;
  const enabledChains = enabledChainsEnv 
    ? enabledChainsEnv.split(',').map(id => parseInt(id.trim(), 10))
    : [42161, 10]; // Default to Arbitrum and Optimism

  // Filter chains to only include enabled ones with valid configuration
  const chains: Record<number, EVMChainConfig> = {};
  
  for (const chainId of enabledChains) {
    const defaultConfig = DEFAULT_EVM_CHAINS[chainId];
    if (!defaultConfig) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    // Validate that required contract addresses are configured
    if (!defaultConfig.contracts.sedaCore || !defaultConfig.contracts.sedaProver) {
      throw new Error(
        `Missing contract addresses for chain ${chainId} (${defaultConfig.name}). ` +
        `Please set environment variables for SEDA contract addresses.`
      );
    }

    chains[chainId] = defaultConfig;
  }

  // Build configuration with environment overrides
  return {
    enabledChains,
    chains,
    batchPolling: {
      intervalMs: parseInt(process.env.EVM_BATCH_POLLING_INTERVAL_MS || '10000', 10),
      batchWindow: parseInt(process.env.EVM_BATCH_WINDOW || '10', 10),
      maxBatchAgeMs: parseInt(process.env.EVM_MAX_BATCH_AGE_MS || '3600000', 10) // 1 hour
    },
    concurrency: {
      maxParallelChains: parseInt(process.env.EVM_MAX_PARALLEL_CHAINS || '5', 10),
      maxTransactionsPerChain: parseInt(process.env.EVM_MAX_TX_PER_CHAIN || '3', 10)
    },
    monitoring: {
      enableMetrics: process.env.EVM_ENABLE_METRICS !== 'false',
      healthCheckIntervalMs: parseInt(process.env.EVM_HEALTH_CHECK_INTERVAL_MS || '30000', 10),
      alerts: {
        minSuccessRatePercent: parseInt(process.env.EVM_MIN_SUCCESS_RATE || '90', 10),
        maxAveragePushTimeMs: parseInt(process.env.EVM_MAX_AVG_PUSH_TIME_MS || '120000', 10),
        maxConsecutiveFailures: parseInt(process.env.EVM_MAX_CONSECUTIVE_FAILURES || '5', 10)
      }
    }
  };
}

/**
 * Get configuration for a specific EVM chain
 */
export function getEVMChainConfig(chainId: number): EVMChainConfig {
  const config = DEFAULT_EVM_CHAINS[chainId];
  if (!config) {
    throw new Error(`Unknown EVM chain ID: ${chainId}`);
  }
  
  // Validate contract addresses
  if (!config.contracts.sedaCore || !config.contracts.sedaProver) {
    throw new Error(
      `Missing contract addresses for chain ${chainId}. ` +
      `Please configure SEDA contract addresses in environment variables.`
    );
  }
  
  return config;
}

/**
 * Validate EVM pusher configuration
 */
export function validateEVMPusherConfig(config: EVMPusherConfig): void {
  if (config.enabledChains.length === 0) {
    throw new Error('No EVM chains enabled. Please configure EVM_ENABLED_CHAINS.');
  }

  for (const chainId of config.enabledChains) {
    const chainConfig = config.chains[chainId];
    if (!chainConfig) {
      throw new Error(`Missing configuration for enabled chain ${chainId}`);
    }

    // Validate contract addresses
    if (!chainConfig.contracts.sedaCore || !chainConfig.contracts.sedaProver) {
      throw new Error(
        `Missing contract addresses for chain ${chainId}. ` +
        `Required: SEDA Core and Prover contract addresses.`
      );
    }

    // Validate RPC endpoint
    if (!chainConfig.rpcEndpoint) {
      throw new Error(`Missing RPC endpoint for chain ${chainId}`);
    }

    // Validate gas configuration
    if (chainConfig.gas.maxGasPrice <= 0n) {
      throw new Error(`Invalid max gas price for chain ${chainId}`);
    }

    if (chainConfig.gas.batchPushGasLimit <= 0) {
      throw new Error(`Invalid gas limit for chain ${chainId}`);
    }

    // Validate confirmations
    if (chainConfig.confirmations.required <= 0) {
      throw new Error(`Invalid confirmation requirement for chain ${chainId}`);
    }

    // Validate retry configuration
    if (chainConfig.retry.maxAttempts <= 0) {
      throw new Error(`Invalid retry attempts for chain ${chainId}`);
    }
  }

  // Validate polling configuration
  if (config.batchPolling.intervalMs <= 0) {
    throw new Error('Invalid batch polling interval');
  }

  if (config.batchPolling.batchWindow <= 0) {
    throw new Error('Invalid batch window size');
  }

  // Validate concurrency limits
  if (config.concurrency.maxParallelChains <= 0) {
    throw new Error('Invalid max parallel chains setting');
  }

  console.log('✅ EVM pusher configuration is valid');
}

/**
 * Get all supported chain IDs
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(DEFAULT_EVM_CHAINS).map(id => parseInt(id, 10));
}

/**
 * Get chain name by chain ID
 */
export function getChainName(chainId: number): string {
  const config = DEFAULT_EVM_CHAINS[chainId];
  return config ? config.name : `Unknown Chain ${chainId}`;
}

/**
 * Check if a chain is supported
 */
export function isChainSupported(chainId: number): boolean {
  return chainId in DEFAULT_EVM_CHAINS;
} 