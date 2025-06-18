/**
 * Network Configuration Module - DEPRECATED
 * This module has been consolidated into src/config/
 * Please import from '../config' instead
 */

// Re-export from the new consolidated config module
export {
  SEDA_NETWORKS as SEDA_NETWORK_CONFIGS, // Legacy alias
  getSedaNetworkConfig as getNetworkConfig, // Legacy alias
  getSedaRpcEndpoint as getRpcEndpoint, // Legacy alias
  logSedaGasConfiguration as logGasConfiguration, // Legacy alias
  getSedaDataRequestConfig as getDataRequestConfig, // Legacy alias
  validateSedaNetworkConfig as validateDataRequestConfig // Legacy alias
} from '../../config'; 