/**
 * Configuration Types
 */

export interface ConfigSummary {
  seda: {
    network: string;
    rpcEndpoint: string;
    oracleProgramId: string;
    schedulerInterval: number;
  };
  evm: {
    networksConfigured: number;
    networksEnabled: number;
    privateKeyConfigured: boolean;
  };
} 