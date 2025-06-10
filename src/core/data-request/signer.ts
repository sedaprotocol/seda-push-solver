/**
 * SEDA Signer Initialization
 * Handles the creation and setup of SEDA signers
 */

import { buildSigningConfig, Signer } from '@seda-protocol/dev-tools';
import type { SEDAConfig } from '../../types';

/**
 * Initialize a SEDA signer from configuration
 */
export async function initializeSigner(config: SEDAConfig): Promise<Signer> {
  if (!config.mnemonic) {
    throw new Error('Mnemonic is required in SEDA configuration');
  }

  console.log('🔐 Initializing SEDA signing configuration...');
  
  try {
    const signingConfig = buildSigningConfig({
      mnemonic: config.mnemonic,
      rpc: config.rpcEndpoint
      // contract field omitted - will auto-detect or use SEDA_CORE_CONTRACT env var
    });
    
    const signer = await Signer.fromPartial(signingConfig);
    console.log('✅ SEDA signing configuration initialized');
    
    return signer;
  } catch (error) {
    console.error('❌ Failed to initialize signing configuration:', error);
    throw error;
  }
} 