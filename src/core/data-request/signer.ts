/**
 * SEDA Signer Initialization
 * Handles the creation and setup of SEDA signers
 */

import { buildSigningConfig, Signer } from '@seda-protocol/dev-tools';
import type { SEDAConfig } from '../../types';
import type { ILoggingService } from '../../services';

/**
 * Initialize a SEDA signer from configuration
 */
export async function initializeSigner(config: SEDAConfig, logger?: ILoggingService): Promise<Signer> {
  if (!config.mnemonic) {
    throw new Error('Mnemonic is required in SEDA configuration');
  }

  if (logger) {
    logger.info('\n📝 Setting up SEDA signing configuration...');
  } else {
    console.log('\n📝 Setting up SEDA signing configuration...');
  }
  
  try {
    const signingConfig = buildSigningConfig({
      mnemonic: config.mnemonic,
      rpc: config.rpcEndpoint
      // contract field omitted - will auto-detect or use SEDA_CORE_CONTRACT env var
    });
    
    const signer = await Signer.fromPartial(signingConfig);
    
    if (logger) {
      logger.info('┌─────────────────────────────────────────────────────────────────────┐');
      logger.info('│                      ✅ Signer Ready                                │');
      logger.info('├─────────────────────────────────────────────────────────────────────┤');
      logger.info(`│ RPC Connected: ${config.rpcEndpoint}`);
      logger.info(`│ Account Status: Authorized for transaction signing`);
      logger.info('└─────────────────────────────────────────────────────────────────────┘');
    } else {
      console.log('┌─────────────────────────────────────────────────────────────────────┐');
      console.log('│                      ✅ Signer Ready                                │');
      console.log('├─────────────────────────────────────────────────────────────────────┤');
      console.log(`│ RPC Connected: ${config.rpcEndpoint}`);
      console.log(`│ Account Status: Authorized for transaction signing`);
      console.log('└─────────────────────────────────────────────────────────────────────┘');
    }
    
    return signer;
  } catch (error) {
    if (logger) {
      logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
      logger.info('│                    ❌ Signer Setup Failed                           │');
      logger.info('├─────────────────────────────────────────────────────────────────────┤');
      logger.info(`│ Error: ${(error as Error).message}`);
      logger.info('└─────────────────────────────────────────────────────────────────────┘');
    } else {
      console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
      console.log('│                    ❌ Signer Setup Failed                           │');
      console.log('├─────────────────────────────────────────────────────────────────────┤');
      console.log(`│ Error: ${(error as Error).message}`);
      console.log('└─────────────────────────────────────────────────────────────────────┘');
    }
    throw error;
  }
} 