/**
 * SEDA Push Solver - Root Configuration
 * Re-exports from modular configuration files
 */

// Re-export from modular config files
export { sedaConfig } from './src/config/seda';
export { evmPrivateKey, evmNetworks, getEnabledEvmNetworks, getEvmNetwork } from './src/config/evm';

// Re-export types
export type { EvmNetworkConfig, EvmGasConfig } from './src/types/evm';
export type { SedaConfig } from './src/types/seda';

// Import for validation functions
import type { EvmNetworkConfig } from './src/types/evm';
import { evmPrivateKey, evmNetworks, getEnabledEvmNetworks } from './src/config/evm';
import { sedaConfig } from './src/config/seda';

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

 