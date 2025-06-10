/**
 * DataRequest Configuration Functions
 * Utilities for working with DataRequest configurations
 */

import type { SEDADataRequestConfig } from '../../types';
import { getNetworkConfig, SEDA_NETWORK_CONFIGS } from './network-config';

/**
 * Get DataRequest configuration for a specific network
 */
export function getDataRequestConfig(network: keyof typeof SEDA_NETWORK_CONFIGS): SEDADataRequestConfig {
  return getNetworkConfig(network).dataRequest;
}

/**
 * Create a DataRequest configuration with custom overrides
 */
export function createDataRequestConfig(
  network: keyof typeof SEDA_NETWORK_CONFIGS,
  overrides: Partial<SEDADataRequestConfig> = {}
): SEDADataRequestConfig {
  const baseConfig = getDataRequestConfig(network);
  
  return {
    ...baseConfig,
    ...overrides
  };
} 