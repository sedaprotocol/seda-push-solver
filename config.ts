/**
 * SEDA Push Solver - Root Configuration
 * Consolidated configuration for SEDA network and EVM chains
 * 
 * Required Environment Variables:
 * - SEDA_MNEMONIC: 24-word mnemonic phrase for SEDA network access
 * - SEDA_ORACLE_PROGRAM_ID: Oracle program ID for DataRequest execution
 * - EVM_PRIVATE_KEY: Single private key for posting to all EVM chains
 * - SEDA_NETWORK: Network to connect to (testnet/mainnet/local)
 * - SEDA_RPC_ENDPOINT: Custom RPC endpoint (optional, uses network defaults)
 * - SCHEDULER_INTERVAL_MS: Interval between DataRequest posts in milliseconds
 * - SCHEDULER_CONTINUOUS: Whether to run continuously (true/false)
 * - SCHEDULER_MAX_RETRIES: Maximum retry attempts for failed operations
 * - SCHEDULER_MEMO: Custom memo for DataRequest transactions
 * - COSMOS_POSTING_TIMEOUT_MS: Timeout for transaction posting
 * - COSMOS_MAX_QUEUE_SIZE: Maximum queue size for sequence coordination
 * - SEDA_DR_TIMEOUT_SECONDS: DataRequest execution timeout
 * - SEDA_DR_POLLING_INTERVAL_SECONDS: Polling interval for DataRequest results
 * - LOG_LEVEL: Logging level (info/debug/warn/error)
 * 
 * EVM Network Environment Variables (per network):
 * - <NETWORK_PREFIX>_RPC_URL: RPC endpoint for the EVM network
 * - <NETWORK_PREFIX>_CONTRACT_ADDRESS: Smart contract address for result posting
 * - <NETWORK_PREFIX>_CHAIN_ID: Chain ID of the EVM network
 * - <NETWORK_PREFIX>_GAS_LIMIT: Gas limit for transactions
 * - <NETWORK_PREFIX>_GAS_PRICE: Gas price in wei (optional)
 * - <NETWORK_PREFIX>_MAX_FEE_PER_GAS: Max fee per gas for EIP-1559 (optional)
 * - <NETWORK_PREFIX>_MAX_PRIORITY_FEE_PER_GAS: Max priority fee per gas for EIP-1559 (optional)
 * 
 * Example: BASE_RPC_URL, BASE_CONTRACT_ADDRESS, BASE_CHAIN_ID, BASE_GAS_LIMIT
 */

// Import types from centralized location
import type { EvmGasConfig, EvmNetworkConfig } from './src/types/evm-types';
import type { SedaConfig, ConfigSummary } from './src/types/config-types';

// Re-export types for external consumption
export type { EvmNetworkConfig, EvmGasConfig };



/**
 * Validate required environment variables at startup
 */
function validateEnvironment(): void {
  const required = [
    'SEDA_MNEMONIC',
    'SEDA_ORACLE_PROGRAM_ID'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    // In test environment, just log a warning instead of throwing
    if (process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test') {
      console.warn(`Warning: Missing environment variables for testing: ${missing.join(', ')}`);
      return;
    }
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Get network-specific default RPC endpoints
 */
function getDefaultRpcEndpoint(network: string): string {
  const endpoints = {
    testnet: 'https://rpc.testnet.seda.xyz',
    mainnet: 'https://rpc.mainnet.seda.xyz',
    local: 'http://localhost:26657'
  };
  
  return endpoints[network as keyof typeof endpoints] || endpoints.testnet;
}

/**
 * Parse gas configuration for a network
 */
function parseGasConfig(prefix: string): EvmGasConfig {
  const gasLimit = parseInt(process.env[`${prefix}_GAS_LIMIT`] || '500000');
  const gasPrice = process.env[`${prefix}_GAS_PRICE`];
  const maxFeePerGas = process.env[`${prefix}_MAX_FEE_PER_GAS`];
  const maxPriorityFeePerGas = process.env[`${prefix}_MAX_PRIORITY_FEE_PER_GAS`];
  
  // Use EIP-1559 if either maxFeePerGas or maxPriorityFeePerGas is provided
  const useEIP1559 = !!(maxFeePerGas || maxPriorityFeePerGas);
  
  return {
    gasLimit,
    gasPrice,
    maxFeePerGas,
    maxPriorityFeePerGas,
    useEIP1559
  };
}

/**
 * Load SEDA configuration from environment variables
 */
export const sedaConfig: SedaConfig = (() => {
  validateEnvironment();
  
  const network = (process.env.SEDA_NETWORK || 'testnet') as SedaConfig['network'];
  
  return {
    network,
    rpcEndpoint: process.env.SEDA_RPC_ENDPOINT || getDefaultRpcEndpoint(network),
    mnemonic: process.env.SEDA_MNEMONIC || '',
    oracleProgramId: process.env.SEDA_ORACLE_PROGRAM_ID || '',
    drTimeoutSeconds: parseInt(process.env.SEDA_DR_TIMEOUT_SECONDS || '120'),
    drPollingIntervalSeconds: parseInt(process.env.SEDA_DR_POLLING_INTERVAL_SECONDS || '5'),
    scheduler: {
      intervalMs: parseInt(process.env.SCHEDULER_INTERVAL_MS || '15000'),
      continuous: process.env.SCHEDULER_CONTINUOUS !== 'false',
      maxRetries: parseInt(process.env.SCHEDULER_MAX_RETRIES || '3'),
      memo: process.env.SCHEDULER_MEMO || 'SEDA DataRequest'
    },
    cosmos: {
      postingTimeoutMs: parseInt(process.env.COSMOS_POSTING_TIMEOUT_MS || '20000'),
      maxQueueSize: parseInt(process.env.COSMOS_MAX_QUEUE_SIZE || '100')
    },
    logging: {
      level: (process.env.LOG_LEVEL || 'info') as SedaConfig['logging']['level']
    }
  };
})();

/**
 * Single private key for all EVM networks
 */
export const evmPrivateKey: string = process.env.EVM_PRIVATE_KEY || '';

/**
 * Load EVM network configurations from environment variables
 * Automatically discovers networks based on environment variable patterns
 */
export const evmNetworks: EvmNetworkConfig[] = (() => {
  const networks: EvmNetworkConfig[] = [];
  
  // Define known network prefixes and their display names
  const knownNetworks = {
    BASE: 'Base',
    ETHEREUM: 'Ethereum',
    POLYGON: 'Polygon',
    ARBITRUM: 'Arbitrum',
    OPTIMISM: 'Optimism',
    SEPOLIA: 'Sepolia Testnet',
    GOERLI: 'Goerli Testnet'
  };
  
  // Scan environment variables for network configurations
  for (const [prefix, displayName] of Object.entries(knownNetworks)) {
    const rpcUrl = process.env[`${prefix}_RPC_URL`];
    const contractAddress = process.env[`${prefix}_CONTRACT_ADDRESS`];
    const chainId = process.env[`${prefix}_CHAIN_ID`];
    
    // Only include networks that have essential configuration
    if (rpcUrl && contractAddress && chainId) {
      const gas = parseGasConfig(prefix);
      
      networks.push({
        name: prefix.toLowerCase(),
        displayName,
        rpcUrl,
        chainId: parseInt(chainId),
        contractAddress,
        gas,
        enabled: process.env[`${prefix}_ENABLED`] !== 'false'
      });
    }
  }
  
  return networks;
})();

/**
 * Get enabled EVM networks only
 */
export function getEnabledEvmNetworks(): EvmNetworkConfig[] {
  return evmNetworks.filter(network => network.enabled);
}

/**
 * Get EVM network by name
 */
export function getEvmNetwork(name: string): EvmNetworkConfig | undefined {
  return evmNetworks.find(network => network.name === name);
}

/**
 * Validate EVM network configuration
 */
export function validateEvmNetwork(network: EvmNetworkConfig): void {
  if (!network.rpcUrl) {
    throw new Error(`EVM network ${network.name}: RPC URL is required`);
  }
  
  if (!network.contractAddress) {
    throw new Error(`EVM network ${network.name}: Contract address is required`);
  }
  
  if (!network.chainId || network.chainId <= 0) {
    throw new Error(`EVM network ${network.name}: Valid chain ID is required`);
  }
  
  if (!evmPrivateKey) {
    throw new Error('EVM_PRIVATE_KEY environment variable is required for EVM network operations');
  }
}

/**
 * Validate all enabled EVM networks
 */
export function validateAllEvmNetworks(): void {
  const enabledNetworks = getEnabledEvmNetworks();
  
  for (const network of enabledNetworks) {
    validateEvmNetwork(network);
  }
}

/**
 * Get configuration summary (for logging by external service)
 */
export function getConfigSummary(): ConfigSummary {
  const enabledNetworks = getEnabledEvmNetworks();
  
  return {
    seda: {
      network: sedaConfig.network,
      rpcEndpoint: sedaConfig.rpcEndpoint,
      schedulerIntervalMs: sedaConfig.scheduler.intervalMs,
      continuousMode: sedaConfig.scheduler.continuous,
      maxRetries: sedaConfig.scheduler.maxRetries,
    },
    evm: {
      privateKeyConfigured: !!evmPrivateKey,
      networksFound: evmNetworks.length,
      networksEnabled: enabledNetworks.length,
      enabledNetworks: enabledNetworks.map(network => ({
        name: network.name,
        displayName: network.displayName,
        chainId: network.chainId,
        gasType: network.gas.useEIP1559 ? 'EIP-1559' : 'Legacy'
      }))
    }
  };
} 