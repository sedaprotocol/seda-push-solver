/**
 * SEDA Configuration Loader
 * Updated to use centralized root configuration
 */

import type { SedaConfig } from '../../types';

/**
 * Load SEDA configuration from environment variables
 * Now uses the centralized root configuration
 */
export function loadSEDAConfig(): SedaConfig {
  // Use the centralized config
  const { sedaConfig } = require('../../../config');
  return sedaConfig;
} 