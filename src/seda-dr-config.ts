/**
 * Legacy SEDA DataRequest Configuration Exports
 * Maintained for backward compatibility - imports from core modules
 */

import type { NetworkConfig, NetworkType } from './types';

// Legacy exports - import from core modules for backward compatibility
export { 
  SEDA_NETWORK_CONFIGS,
  getNetworkConfig,
  getDataRequestConfig,
  validateDataRequestConfig
} from './core/network';

// Legacy interface that includes network field for backward compatibility
interface LegacyNetworkConfig extends NetworkConfig {
  network: NetworkType;
}

// Transform network configs to legacy format (add network field for compatibility)
import { SEDA_NETWORK_CONFIGS } from './core/network';

const transformedConfigs: Record<string, LegacyNetworkConfig> = Object.fromEntries(
  Object.entries(SEDA_NETWORK_CONFIGS).map(([key, value]) => [
    key,
    {
      ...value,
      network: value.name as NetworkType
    }
  ])
);

export { transformedConfigs as SEDA_DR_CONFIGS };

export const SEDA_NETWORKS = Object.fromEntries(
  Object.entries(SEDA_NETWORK_CONFIGS).map(([key, value]) => [key, {
    rpcEndpoint: value.rpcEndpoint,
    network: value.name,
    mnemonic: undefined // This will be loaded from environment
  }])
); 