/**
 * SEDA Network and DataRequest Configuration
 * Backward compatibility layer - re-exports from core network modules
 */

// Re-export all network configuration functionality from core modules
export {
  SEDA_NETWORK_CONFIGS,
  getNetworkConfig,
  getRpcEndpoint,
  getDataRequestConfig,
  createDataRequestConfig,
  validateDataRequestConfig
} from './core/network';

// Import for legacy exports
import { SEDA_NETWORK_CONFIGS } from './core/network';

// Legacy exports for backward compatibility
export const SEDA_DR_CONFIGS = Object.fromEntries(
  Object.entries(SEDA_NETWORK_CONFIGS).map(([key, value]) => [key, value.dataRequest])
);

export const SEDA_NETWORKS = Object.fromEntries(
  Object.entries(SEDA_NETWORK_CONFIGS).map(([key, value]) => [key, {
    rpcEndpoint: value.rpcEndpoint,
    network: value.network
  }])
); 