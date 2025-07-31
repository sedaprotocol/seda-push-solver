/**
 * SEDA Signer Initialization
 * Handles the creation and setup of SEDA signers
 */

import { Signer, buildSigningConfig } from "@seda-protocol/dev-tools";
import type { LoggingServiceInterface } from "../../services";
import type { SedaConfig } from "../../types";

/**
 * Initialize a SEDA signer from configuration
 */
export async function initializeSigner(config: SedaConfig, logger: LoggingServiceInterface): Promise<Signer> {
	if (!config.mnemonic) {
		throw new Error("Mnemonic is required in SEDA configuration");
	}

	logger.info("\n📝 Setting up SEDA signing configuration...");

	try {
		const signingConfig = buildSigningConfig({
			mnemonic: config.mnemonic,
			rpc: config.rpcEndpoint,
			// contract field omitted - will auto-detect or use SEDA_CORE_CONTRACT env var
		});

		const signer = await Signer.fromPartial(signingConfig);

		logger.info("┌─────────────────────────────────────────────────────────────────────┐");
		logger.info("│                      ✅ Signer Ready                                │");
		logger.info("├─────────────────────────────────────────────────────────────────────┤");
		logger.info(`│ RPC Connected: ${config.rpcEndpoint}`);
		logger.info(`│ Account Status: Authorized for transaction signing`);
		logger.info("└─────────────────────────────────────────────────────────────────────┘");

		return signer;
	} catch (error) {
		logger.error("\n┌─────────────────────────────────────────────────────────────────────┐");
		logger.error("│                    ❌ Signer Setup Failed                           │");
		logger.error("├─────────────────────────────────────────────────────────────────────┤");
		logger.error(`│ Error: ${(error as Error).message}`);
		logger.error("└─────────────────────────────────────────────────────────────────────┘");
		throw error;
	}
}
