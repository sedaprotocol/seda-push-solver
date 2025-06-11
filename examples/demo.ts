#!/usr/bin/env bun

/**
 * SEDA DataRequest Pusher Demo
 * 
 * This demo shows how to use the SEDA DataRequest functionality
 * to post generic DataRequests to the SEDA network.
 */

import { loadSEDAConfig, SEDADataRequestBuilder } from '../src';
import { ServiceContainer } from '../src/services';

async function runDemo() {
  // Initialize logging service
  const services = ServiceContainer.createProduction();
  const logger = services.loggingService;

  logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
  logger.info('│                   🚀 SEDA DataRequest Demo                          │');
  logger.info('│              Demonstrating Oracle Network Integration              │');
  logger.info('└─────────────────────────────────────────────────────────────────────┘');

  try {
    // Step 1: Load Configuration
    logger.info('\n📋 Step 1: Loading SEDA Configuration...');
    const config = loadSEDAConfig();
    
    logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
    logger.info('│                       ✅ Configuration Loaded                       │');
    logger.info('├─────────────────────────────────────────────────────────────────────┤');
    logger.info(`│ Network: ${config.network.toUpperCase()}`);
    logger.info(`│ RPC Endpoint: ${config.rpcEndpoint}`);
    logger.info(`│ Has Mnemonic: ${config.mnemonic ? 'Yes' : 'No'}`);
    logger.info('└─────────────────────────────────────────────────────────────────────┘');

    if (!config.mnemonic) {
      logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
      logger.info('│                       ⚠️  Setup Required                            │');
      logger.info('├─────────────────────────────────────────────────────────────────────┤');
      logger.info('│ Missing           │ SEDA_MNEMONIC environment variable             │');
      logger.info('│ Required          │ Your 24-word mnemonic phrase                   │');
      logger.info('│ Example           │ export SEDA_MNEMONIC="word1 word2 ... word24"  │');
      logger.info('└─────────────────────────────────────────────────────────────────────┘');
      return;
    }

    // Step 2: Create and Initialize Builder
    logger.info('\n🔧 Step 2: Creating DataRequest Builder...');
    const builder = new SEDADataRequestBuilder(config, logger);
    logger.info('✅ Builder created successfully');
    
    await builder.initialize();

    // Step 3: Post a DataRequest
    logger.info('\n📤 Step 3: Posting DataRequest...');
    logger.info('⏱️  This may take 30-60 seconds to complete...');
    
    const result = await builder.postDataRequest({
      memo: 'Demo DataRequest from SEDA pusher'
    });

    // Step 4: Show Results & Explanation
    logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
    logger.info('│                      🎉 Demo Completed!                            │');
    logger.info('├─────────────────────────────────────────────────────────────────────┤');
    logger.info('│                        📖 Understanding Results                     │');
    logger.info('├─────────────────────────────────────────────────────────────────────┤');
    logger.info('│ DR ID             │ Unique identifier for your DataRequest         │');
    logger.info('│ Exit Code         │ 0 = success, others = error conditions         │');
    logger.info('│ Block Height      │ Blockchain block with recorded result          │');
    logger.info('│ Gas Used          │ Computational cost of oracle execution         │');
    logger.info('│ Result            │ Output data from the oracle program            │');
    logger.info('└─────────────────────────────────────────────────────────────────────┘');

    logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
    logger.info('│                          🎯 Next Steps                              │');
    logger.info('├─────────────────────────────────────────────────────────────────────┤');
    logger.info('│ 1. More Requests  │ Try posting additional DataRequests            │');
    logger.info('│ 2. Use Scheduler  │ Post DataRequests automatically (bun start)   │');
    logger.info('│ 3. Check Explorer │ View results on SEDA blockchain explorer      │');
    logger.info('│ 4. Customize      │ Modify oracle program and configuration       │');
    logger.info('└─────────────────────────────────────────────────────────────────────┘');

  } catch (error) {
    logger.error('\n┌─────────────────────────────────────────────────────────────────────┐');
    logger.error('│                         ❌ Demo Failed                              │');
    logger.error('└─────────────────────────────────────────────────────────────────────┘');
    
    if (error instanceof Error) {
      if (error.message.includes('Mnemonic is required')) {
        logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
        logger.info('│                      💡 Setup Instructions                          │');
        logger.info('├─────────────────────────────────────────────────────────────────────┤');
        logger.info('│ 1. Mnemonic       │ Set SEDA_MNEMONIC environment variable         │');
        logger.info('│ 2. Tokens         │ Ensure account has sufficient testnet tokens   │');
        logger.info('│ 3. Configuration  │ Check oracle program ID in network config      │');
        logger.info('└─────────────────────────────────────────────────────────────────────┘');
      } else if (error.message.includes('insufficient funds')) {
        logger.info('\n┌─────────────────────────────────────────────────────────────────────┐');
        logger.info('│                       💰 Fund Your Account                          │');
        logger.info('├─────────────────────────────────────────────────────────────────────┤');
        logger.info('│ 1. Faucet         │ Get testnet tokens from SEDA faucet            │');
        logger.info('│ 2. Balance        │ Verify account has enough token balance         │');
        logger.info('│ 3. Gas Costs      │ Ensure sufficient funds for transaction fees   │');
        logger.info('└─────────────────────────────────────────────────────────────────────┘');
      } else {
        logger.error(`\n❌ Error: ${error.message}`);
      }
    }
    
    throw error;
  }
}

// Run the demo
runDemo().catch(error => {
  // Create logging service for error handling
  const services = ServiceContainer.createProduction();
  const logger = services.loggingService;
  logger.error('💥 Demo script failed:', error);
  process.exit(1);
});