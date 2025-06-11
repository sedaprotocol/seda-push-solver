/**
 * SEDA Signer Initialization
 * Handles the creation and setup of SEDA signers
 */

import { buildSigningConfig, Signer } from '@seda-protocol/dev-tools';
import type { SEDAConfig } from '../../types';
import type { ILoggingService } from '../../services';

/**
 * Simple logging utility to avoid code duplication
 */
function log(logger: ILoggingService | undefined, message: string, ...args: any[]): void {
  if (logger) {
    logger.info(message, ...args);
  } else {
    console.log(message, ...args);
  }
}

/**
 * Initialize a SEDA signer from configuration
 */
export async function initializeSigner(config: SEDAConfig, logger?: ILoggingService): Promise<Signer> {
  if (!config.mnemonic) {
    throw new Error('Mnemonic is required in SEDA configuration');
  }

  log(logger, '\n📝 Setting up SEDA signing configuration...');
  
  try {
    const signingConfig = buildSigningConfig({
      mnemonic: config.mnemonic,
      rpc: config.rpcEndpoint
      // contract field omitted - will auto-detect or use SEDA_CORE_CONTRACT env var
    });
    
    const signer = await Signer.fromPartial(signingConfig);
    
    log(logger, '┌─────────────────────────────────────────────────────────────────────┐');
    log(logger, '│                      ✅ Signer Ready                                │');
    log(logger, '├─────────────────────────────────────────────────────────────────────┤');
    log(logger, `│ RPC Connected: ${config.rpcEndpoint}`);
    log(logger, `│ Account Status: Authorized for transaction signing`);
    log(logger, '└─────────────────────────────────────────────────────────────────────┘');
    
    return signer;
  } catch (error) {
    log(logger, '\n┌─────────────────────────────────────────────────────────────────────┐');
    log(logger, '│                    ❌ Signer Setup Failed                           │');
    log(logger, '├─────────────────────────────────────────────────────────────────────┤');
    log(logger, `│ Error: ${(error as Error).message}`);
    log(logger, '└─────────────────────────────────────────────────────────────────────┘');
    throw error;
  }
} 