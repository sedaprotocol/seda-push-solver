/**
 * EVM Network Types
 */

export interface EvmGasConfig {
  gasLimit: number;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  useEIP1559: boolean;
}

export interface EvmNetworkConfig {
  name: string;
  displayName: string;
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  gas: EvmGasConfig;
  enabled: boolean;
  explorerUrl?: string;
} 