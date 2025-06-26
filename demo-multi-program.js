#!/usr/bin/env node

/**
 * Multi-Program Parallel Execution Demo
 * 
 * This script demonstrates the new multi-program functionality where multiple
 * oracle programs can be executed in parallel within a single scheduler interval.
 */

// Set up environment for demo
process.env.SEDA_ORACLE_PROGRAM_IDS = 'program-1,program-2,program-3';
process.env.SEDA_MNEMONIC = 'demo demo demo demo demo demo demo demo demo demo demo demo demo demo demo demo demo demo demo demo demo demo demo demo';
process.env.SEDA_NETWORK = 'testnet';

// Import the configuration functions
import { getOracleProgramIds, loadSEDAConfig, getSedaNetworkConfig } from './config.js';

console.log('🧪 Multi-Program Parallel Execution Demo');
console.log('=' .repeat(60));

try {
  // Demonstrate parsing multiple program IDs
  console.log('\n📋 1. Multi-Program Configuration:');
  const programIds = getOracleProgramIds();
  console.log(`   Found ${programIds.length} oracle programs:`);
  programIds.forEach((id, index) => {
    console.log(`   ${index + 1}. ${id}`);
  });

  // Demonstrate network configuration with multiple programs
  console.log('\n🌐 2. Network Configuration:');
  const networkConfig = getSedaNetworkConfig('testnet');
  console.log(`   Network: ${networkConfig.name}`);
  console.log(`   RPC: ${networkConfig.rpcEndpoint}`);
  console.log(`   Primary Program ID: ${networkConfig.dataRequest.oracleProgramId}`);
  console.log(`   All Program IDs: [${networkConfig.dataRequest.oracleProgramIds?.join(', ') || 'none'}]`);

  // Demonstrate SEDA config loading
  console.log('\n⚙️  3. SEDA Configuration:');
  const sedaConfig = loadSEDAConfig();
  console.log(`   Network: ${sedaConfig.network}`);
  console.log(`   Primary Oracle Program: ${sedaConfig.oracleProgramId}`);
  console.log(`   Scheduler Interval: ${sedaConfig.scheduler.intervalMs}ms`);

  console.log('\n✅ Multi-Program Configuration Demo Complete!');
  console.log('\n📖 How It Works:');
  console.log('   1. Configure multiple programs: SEDA_ORACLE_PROGRAM_IDS="prog1,prog2,prog3"');
  console.log('   2. Scheduler launches DataRequests for all programs in parallel');
  console.log('   3. Each program executes independently and concurrently');
  console.log('   4. Results from all programs are posted to EVM networks in parallel');
  console.log('   5. Performance is optimized: total time = max(program_times), not sum');

  console.log('\n🚀 Benefits:');
  console.log('   ⚡ Parallel execution reduces overall latency');
  console.log('   🔄 Independent tracking prevents cross-program failures');  
  console.log('   📈 Better resource utilization');
  console.log('   🎯 Scalable to any number of programs');

} catch (error) {
  console.error('\n❌ Demo failed:', error.message);
  console.log('\n💡 To run this demo properly:');
  console.log('   1. Set SEDA_ORACLE_PROGRAM_IDS="program1,program2,program3"');
  console.log('   2. Set other required environment variables');
  console.log('   3. Run: node demo-multi-program.js');
} 