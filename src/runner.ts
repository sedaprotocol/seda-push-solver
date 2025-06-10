#!/usr/bin/env bun

/**
 * SEDA DataRequest Pusher - Main Runner
 * 
 * This script starts the SEDA DataRequest scheduler to continuously
 * post DataRequests at regular intervals.
 */

import { startScheduler } from './scheduler';

async function main() {
  console.log('🚀 SEDA DataRequest Pusher - Starting Scheduler\n');

  try {
    // Start the scheduler with environment-based configuration
    const scheduler = await startScheduler();

    console.log('\n🎯 Scheduler started successfully!');
    console.log('📋 Use Ctrl+C to stop the scheduler gracefully');
    
    // Keep the process alive
    process.on('beforeExit', () => {
      console.log('📊 Process ending...');
    });

  } catch (error) {
    console.error('❌ Failed to start scheduler:', error);
    
    if (error instanceof Error && error.message.includes('Mnemonic is required')) {
      console.log('\n💡 Setup Instructions:');
      console.log('   1. Set SEDA_MNEMONIC environment variable');
      console.log('   2. Ensure account has sufficient testnet tokens');
      console.log('   3. Oracle Program ID is configured in src/seda-dr-config.ts');
      console.log('\n📖 Environment Variables:');
      console.log('   SEDA_MNEMONIC - Your 24-word mnemonic phrase (required)');
      console.log('   SEDA_NETWORK - Network to use (testnet/mainnet/local)');
      console.log('   SCHEDULER_INTERVAL_SECONDS - Interval between DataRequests (default: 60)');
      console.log('   SCHEDULER_MEMO - Custom memo for DataRequests (optional)');
    }
    
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
main().catch((error) => {
  console.error('❌ Application failed:', error);
  process.exit(1);
}); 