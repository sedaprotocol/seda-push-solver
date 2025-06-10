/**
 * Services Test - Verify the new service layer functionality
 */

import {
  ServiceContainer,
  MockSEDAService,
  MockConfigService,
  MockLoggingService,
  getServices,
  setServices,
  resetToProductionServices,
  LogLevel
} from '../../src/services';

console.log('🧪 Testing Service Layer\n');

// Test service container creation
console.log('✅ Production service container');
const productionContainer = ServiceContainer.createProduction();
console.log('   SEDA Service:', productionContainer.sedaService.constructor.name);
console.log('   Config Service:', productionContainer.configService.constructor.name);
console.log('   Logging Service:', productionContainer.loggingService.constructor.name);

// Test mock service container
console.log('\n✅ Test service container');
const testContainer = ServiceContainer.createTest();
console.log('   SEDA Service:', testContainer.sedaService.constructor.name);
console.log('   Config Service:', testContainer.configService.constructor.name);
console.log('   Logging Service:', testContainer.loggingService.constructor.name);

// Test global service management
console.log('\n✅ Global service management');
const originalServices = getServices();
console.log('   Original services type:', originalServices.constructor.name);

// Switch to test services
setServices(testContainer);
const testServices = getServices();
console.log('   Test services type:', testServices.constructor.name);

// Reset to production
resetToProductionServices();
const resetServices = getServices();
console.log('   Reset services type:', resetServices.constructor.name);

// Test mock service functionality
console.log('\n✅ Mock service functionality');
const mockConfig = new MockConfigService();
mockConfig.setMockEnvVar('TEST_VAR', 'test-value');
console.log('   Mock env var:', mockConfig.getEnvVar('TEST_VAR'));

const mockLogger = new MockLoggingService();
mockLogger.setLogLevel(LogLevel.DEBUG);
mockLogger.info('Test info message');
mockLogger.error('Test error message');
mockLogger.debug('Test debug message');
console.log('   Captured logs:', mockLogger.getLogs().length);
console.log('   Info logs:', mockLogger.getLogsByLevel('info').length);
console.log('   Error logs:', mockLogger.getLogsByLevel('error').length);

// Test mock SEDA service
console.log('\n✅ Mock SEDA service');
const mockSEDA = new MockSEDAService();
const mockConfig2 = {
  rpcEndpoint: 'http://localhost:26657',
  network: 'local' as const,
  mnemonic: 'test mnemonic'
};

mockSEDA.createSigner(mockConfig2).then(signer => {
  console.log('   Mock signer created:', !!signer);
  
  return mockSEDA.postAndAwaitDataRequest(
    signer,
    {} as any, // PostDataRequestInput
    {} as any, // GasOptions
    { timeoutSeconds: 30, pollingIntervalSeconds: 1 }
  );
}).then(result => {
  console.log('   Mock DataRequest result:', result.drId.startsWith('mock-dr-id'));
  console.log('   Mock exit code:', result.exitCode);
}).catch(error => {
  console.error('   Mock service error:', error);
});

console.log('\n🎉 All service layer tests completed!');

export {}; // Make this a module 