#!/usr/bin/env bun

/**
 * SEDA DataRequest Pusher Demo
 * 
 * This demo shows how to use the SEDA DataRequest functionality
 * to post generic DataRequests to the SEDA network.
 */

import { loadSEDAConfig, SEDADataRequestBuilder } from '../src/push-solver';

async function runDemo() {
  console.log('🚀 SEDA DataRequest Pusher Demo\n');
  console.log('This demo will show you how to post DataRequests to SEDA network');
  console.log('='.repeat(60));

  try {
    // Step 1: Load Configuration
    console.log('\n📋 Step 1: Loading SEDA Configuration...');
    const config = loadSEDAConfig();
    
    console.log('✅ Configuration loaded successfully');
    console.log(`   🌐 Network: ${config.network}`);
    console.log(`   🔗 RPC: ${config.rpcEndpoint}`);
    console.log(`   🔑 Has Mnemonic: ${config.mnemonic ? 'Yes' : 'No'}`);

    if (!config.mnemonic) {
      console.log('\n⚠️  Demo requires SEDA_MNEMONIC environment variable');
      console.log('   Please set it with your 24-word mnemonic phrase');
      console.log('   Example: export SEDA_MNEMONIC="word1 word2 ... word24"');
      return;
    }

    // Step 2: Create and Initialize Builder
    console.log('\n🔧 Step 2: Creating DataRequest Builder...');
    const builder = new SEDADataRequestBuilder(config);
    
    console.log('✅ Builder created successfully');
    console.log('🔐 Initializing signer...');
    
    await builder.initialize();
    console.log('✅ Builder initialized and ready');

    // Step 3: Post a DataRequest
    console.log('\n📤 Step 3: Posting DataRequest...');
    console.log('⏱️  This may take 30-60 seconds...');
    
    const result = await builder.postDataRequest({
      memo: 'Demo DataRequest from SEDA pusher'
    });

    console.log('\n🎉 DataRequest completed successfully!');
    console.log('📊 Results:');
    console.log(`   🆔 DR ID: ${result.drId}`);
    console.log(`   🔢 Exit Code: ${result.exitCode}`);
    console.log(`   🏗️  Block Height: ${result.blockHeight}`);
    console.log(`   ⛽ Gas Used: ${result.gasUsed}`);
    console.log(`   📄 Result: ${result.result || 'No result data'}`);

    // Step 4: Explain the Results
    console.log('\n📖 Understanding the Results:');
    console.log('   • DR ID: Unique identifier for your DataRequest');
    console.log('   • Exit Code: 0 = success, others = various error conditions');
    console.log('   • Block Height: The blockchain block where the result was recorded');
    console.log('   • Gas Used: Amount of gas consumed by the oracle execution');
    console.log('   • Result: The output data from the oracle program');

    console.log('\n🎯 Next Steps:');
    console.log('   1. Try posting more DataRequests using the builder');
    console.log('   2. Use the scheduler to post DataRequests automatically');
    console.log('   3. Check your DataRequest results on the SEDA explorer');
    console.log('   4. Run: bun start - to start the continuous scheduler');

  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Mnemonic is required')) {
        console.log('\n💡 Setup Instructions:');
        console.log('   1. Set SEDA_MNEMONIC environment variable with your mnemonic');
        console.log('   2. Ensure the account has sufficient testnet tokens');
        console.log('   3. Oracle program ID is configured in src/seda-dr-config.ts');
      } else if (error.message.includes('insufficient funds')) {
        console.log('\n💰 Fund your account:');
        console.log('   1. Get testnet tokens from SEDA faucet');
        console.log('   2. Make sure your account address has enough balance');
      }
    }
    
    throw error;
  }
}

// Run the demo
runDemo().catch(error => {
  console.error('💥 Demo script failed:', error);
  process.exit(1);
});