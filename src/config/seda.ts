/**
 * SEDA Network Configuration
 */

import { validateEnvironment, getEnvVar, getEnvVarInt, getEnvVarBool } from './environment';
import type { SedaConfig } from '../types';

validateEnvironment();

function getDefaultRpcEndpoint(network: string): string {
  const endpoints = {
    testnet: 'https://rpc.testnet.seda.xyz',
    mainnet: 'https://rpc.mainnet.seda.xyz',
    local: 'http://localhost:26657'
  };
  
  return endpoints[network as keyof typeof endpoints] || endpoints.testnet;
}

export const sedaConfig: SedaConfig = {
  network: getEnvVar('SEDA_NETWORK', 'testnet') as SedaConfig['network'],
  rpcEndpoint: getEnvVar('SEDA_RPC_ENDPOINT') || getDefaultRpcEndpoint(getEnvVar('SEDA_NETWORK', 'testnet')),
  mnemonic: getEnvVar('SEDA_MNEMONIC', ''),
  oracleProgramId: getEnvVar('SEDA_ORACLE_PROGRAM_ID', ''),
  drTimeoutSeconds: getEnvVarInt('SEDA_DR_TIMEOUT_SECONDS', 120),
  drPollingIntervalSeconds: getEnvVarInt('SEDA_DR_POLLING_INTERVAL_SECONDS', 5),
  scheduler: {
    intervalMs: getEnvVarInt('SCHEDULER_INTERVAL_MS', 15000),
    continuous: getEnvVarBool('SCHEDULER_CONTINUOUS', true),
    maxRetries: getEnvVarInt('SCHEDULER_MAX_RETRIES', 3),
    memo: getEnvVar('SCHEDULER_MEMO', 'SEDA DataRequest')
  },
  cosmos: {
    postingTimeoutMs: getEnvVarInt('COSMOS_POSTING_TIMEOUT_MS', 20000),
    maxQueueSize: getEnvVarInt('COSMOS_MAX_QUEUE_SIZE', 100)
  },
  logging: {
    level: getEnvVar('LOG_LEVEL', 'info') as SedaConfig['logging']['level']
  }
}; 