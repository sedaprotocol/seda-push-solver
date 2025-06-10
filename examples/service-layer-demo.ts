/**
 * Service Layer Demo
 * Demonstrates how to use the new service layer for dependency injection and testing
 */

import {
  ServiceContainer,
  getServices,
  setServices,
  MockSEDAService,
  MockConfigService,
  LogLevel,
  type IServiceContainer
} from '../src/services';

console.log('🚀 Service Layer Demo\n');

// Example 1: Using production services (default)
console.log('📋 Example 1: Production Services');
const services = getServices();
console.log(`   Config Service: ${services.configService.constructor.name}`);
console.log(`   SEDA Service: ${services.sedaService.constructor.name}`);
console.log(`   Logging Service: ${services.loggingService.constructor.name}`);

// Example 2: Creating a test environment
console.log('\n🧪 Example 2: Test Environment');
const testContainer = ServiceContainer.createTest();

// Configure mock services
const mockConfig = testContainer.configService as MockConfigService;
mockConfig.setMockEnvVar('SEDA_NETWORK', 'testnet');
mockConfig.setMockEnvVar('SEDA_MNEMONIC', 'test mnemonic for demo');

const mockSEDA = testContainer.sedaService as MockSEDAService;
mockSEDA.setMockResult('test-scenario', {
  drId: 'demo-dr-123',
  exitCode: 0,
  result: '0xabcdef'
});

// Switch to test services
setServices(testContainer);
console.log('   Switched to test services');

// Example 3: Using services in application code
console.log('\n⚙️  Example 3: Application Code');
async function simulateDataRequest() {
  const appServices = getServices();
  
  try {
    // Load configuration
    const config = appServices.configService.loadSEDAConfig();
    appServices.loggingService.info(`📋 Loaded config for network: ${config.network}`);
    
    // Create signer
    const signer = await appServices.sedaService.createSigner(config);
    appServices.loggingService.info('🔐 Signer created successfully');
    
    // Simulate DataRequest
    const result = await appServices.sedaService.postAndAwaitDataRequest(
      signer,
      {} as any, // PostDataRequestInput
      {} as any, // GasOptions  
      { timeoutSeconds: 30, pollingIntervalSeconds: 1 }
    );
    
    appServices.loggingService.info(`✅ DataRequest completed: ${result.drId}`);
    return result;
    
  } catch (error) {
    appServices.loggingService.error(`❌ DataRequest failed: ${error}`);
    throw error;
  }
}

// Run the simulation
simulateDataRequest()
  .then(result => {
    console.log(`   Result DR ID: ${result.drId}`);
    console.log(`   Exit Code: ${result.exitCode}`);
  })
  .catch(error => {
    console.error(`   Error: ${error.message}`);
  });

// Example 4: Log level control
console.log('\n📝 Example 4: Log Level Control');
const currentServices = getServices();
currentServices.loggingService.setLogLevel(LogLevel.DEBUG);
currentServices.loggingService.debug('🐛 This debug message will be shown');
currentServices.loggingService.info('ℹ️  This info message will be shown');

currentServices.loggingService.setLogLevel(LogLevel.ERROR);
currentServices.loggingService.debug('🐛 This debug message will be hidden');
currentServices.loggingService.error('❌ This error message will be shown');

console.log('\n🎯 Service Layer Benefits:');
console.log('   ✅ Dependency Injection - Easy to swap implementations');
console.log('   ✅ Testability - Mock services for unit testing');
console.log('   ✅ Centralized Configuration - Single source of truth');
console.log('   ✅ Environment Abstraction - No direct process.env access');
console.log('   ✅ Logging Control - Configurable log levels');

console.log('\n🎉 Service Layer Demo Complete!');

export {}; 