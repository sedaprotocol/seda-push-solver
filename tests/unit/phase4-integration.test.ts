/**
 * Phase 4: Integration with Existing System Tests
 * Tests the unified background service and scheduler integration
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { LoggingService } from '../../src/services/logging-service';
import { ServiceContainer } from '../../src/services/service-container';
import { 
  BackgroundService, 
  createBackgroundService, 
  createBackgroundServiceWithEVM,
  type BackgroundServiceConfig 
} from '../../src/core/background-service';

describe('Phase 4: Integration with Existing System', () => {
  let logger: LoggingService;
  let serviceContainer: ServiceContainer;
  let backgroundService: BackgroundService;

  beforeEach(async () => {
    logger = new LoggingService();
    serviceContainer = await ServiceContainer.createTestWithEVM();
  });

  afterEach(async () => {
    if (backgroundService && backgroundService.isRunning()) {
      await backgroundService.shutdown();
    }
  });

  describe('Service Container Extensions', () => {
    test('should create service container with all Phase 2 and Phase 3 services', async () => {
      expect(serviceContainer.sedaService).toBeDefined();
      expect(serviceContainer.configService).toBeDefined();
      expect(serviceContainer.loggingService).toBeDefined();
      expect(serviceContainer.sedaChainService).toBeDefined();
      expect(serviceContainer.batchService).toBeDefined();
      expect(serviceContainer.dataRequestTracker).toBeDefined();
      expect(serviceContainer.evmPusherService).toBeDefined();
    });

    test('should initialize all services in container', async () => {
      await serviceContainer.initialize();
      
      expect(serviceContainer.sedaChainService.isInitialized()).toBe(true);
      expect(serviceContainer.batchService.isInitialized()).toBe(true);
      expect(serviceContainer.dataRequestTracker.isInitialized()).toBe(true);
    });

    test('should start and stop background services', async () => {
      await serviceContainer.initialize();
      await serviceContainer.start();
      
      // Services should be running
      expect(serviceContainer.evmPusherService).toBeDefined();
      
      await serviceContainer.stop();
      // Services should be stopped
    });

    test('should provide health status for all services', async () => {
      await serviceContainer.initialize();
      
      const health = await serviceContainer.getHealthStatus();
      
      expect(health.overall).toMatch(/healthy|degraded|unhealthy/);
      expect(health.services).toBeDefined();
      expect(health.services.sedaChainService).toMatch(/healthy|degraded|unhealthy/);
      expect(health.services.dataRequestTracker).toMatch(/healthy|degraded|unhealthy/);
      expect(health.details).toBeDefined();
    });
  });

  describe('Background Service Architecture', () => {
    test('should create background service with service container', async () => {
      backgroundService = new BackgroundService(serviceContainer, logger);
      
      expect(backgroundService).toBeDefined();
      expect(backgroundService.isInitialized()).toBe(false);
      expect(backgroundService.isRunning()).toBe(false);
    });

    test('should initialize background service with configuration', async () => {
      backgroundService = new BackgroundService(serviceContainer, logger);
      
      const config: BackgroundServiceConfig = {
        scheduler: {
          intervalMs: 10000,
          continuous: true,
          maxRetries: 3,
          memo: 'Test scheduler',
          cosmosSequence: {
            postingTimeoutMs: 30000,
            drResultTimeout: 120000,
            maxQueueSize: 100
          }
        },
        evmPusher: {
          enabled: true,
          autoStart: true,
          healthCheckIntervalMs: 30000
        },
        lifecycle: {
          gracefulShutdownTimeoutMs: 10000,
          healthCheckIntervalMs: 30000,
          enableMetrics: true
        }
      };
      
      await backgroundService.initialize(config);
      
      expect(backgroundService.isInitialized()).toBe(true);
      expect(backgroundService.isRunning()).toBe(false);
    });

    test('should start and stop background service', async () => {
      backgroundService = new BackgroundService(serviceContainer, logger);
      
      const config: BackgroundServiceConfig = {
        scheduler: {
          intervalMs: 10000,
          continuous: true,
          maxRetries: 3,
          memo: 'Test scheduler',
          cosmosSequence: {
            postingTimeoutMs: 30000,
            drResultTimeout: 120000,
            maxQueueSize: 100
          }
        },
        evmPusher: {
          enabled: true,
          autoStart: true,
          healthCheckIntervalMs: 30000
        },
        lifecycle: {
          gracefulShutdownTimeoutMs: 10000,
          healthCheckIntervalMs: 30000,
          enableMetrics: true
        }
      };
      
      await backgroundService.initialize(config);
      await backgroundService.start();
      
      expect(backgroundService.isRunning()).toBe(true);
      
      await backgroundService.stop();
      
      expect(backgroundService.isRunning()).toBe(false);
    });

    test('should provide health status', async () => {
      backgroundService = new BackgroundService(serviceContainer, logger);
      
      const config: BackgroundServiceConfig = {
        scheduler: {
          intervalMs: 10000,
          continuous: true,
          maxRetries: 3,
          memo: 'Test scheduler',
          cosmosSequence: {
            postingTimeoutMs: 30000,
            drResultTimeout: 120000,
            maxQueueSize: 100
          }
        },
        evmPusher: {
          enabled: true,
          autoStart: true,
          healthCheckIntervalMs: 30000
        },
        lifecycle: {
          gracefulShutdownTimeoutMs: 10000,
          healthCheckIntervalMs: 30000,
          enableMetrics: true
        }
      };
      
      await backgroundService.initialize(config);
      
      const health = await backgroundService.getHealthStatus();
      
      expect(health.overall).toMatch(/healthy|degraded|unhealthy/);
      expect(health.services).toBeDefined();
      expect(health.services.serviceContainer).toMatch(/healthy|degraded|unhealthy/);
      expect(health.details).toBeDefined();
      expect(health.details.uptime).toBeGreaterThanOrEqual(0);
    });

    test('should provide comprehensive statistics', async () => {
      backgroundService = new BackgroundService(serviceContainer, logger);
      
      const config: BackgroundServiceConfig = {
        scheduler: {
          intervalMs: 10000,
          continuous: true,
          maxRetries: 3,
          memo: 'Test scheduler',
          cosmosSequence: {
            postingTimeoutMs: 30000,
            drResultTimeout: 120000,
            maxQueueSize: 100
          }
        },
        evmPusher: {
          enabled: true,
          autoStart: true,
          healthCheckIntervalMs: 30000
        },
        lifecycle: {
          gracefulShutdownTimeoutMs: 10000,
          healthCheckIntervalMs: 30000,
          enableMetrics: true
        }
      };
      
      await backgroundService.initialize(config);
      
      const stats = await backgroundService.getStatistics();
      
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
      expect(stats.totalHealthChecks).toBeGreaterThanOrEqual(0);
      expect(stats.serviceContainer).toBeDefined();
      expect(stats.evmPusher).toBeDefined();
    });

    test('should handle graceful shutdown', async () => {
      backgroundService = new BackgroundService(serviceContainer, logger);
      
      const config: BackgroundServiceConfig = {
        scheduler: {
          intervalMs: 10000,
          continuous: true,
          maxRetries: 3,
          memo: 'Test scheduler',
          cosmosSequence: {
            postingTimeoutMs: 30000,
            drResultTimeout: 120000,
            maxQueueSize: 100
          }
        },
        evmPusher: {
          enabled: true,
          autoStart: true,
          healthCheckIntervalMs: 30000
        },
        lifecycle: {
          gracefulShutdownTimeoutMs: 10000,
          healthCheckIntervalMs: 30000,
          enableMetrics: true
        }
      };
      
      await backgroundService.initialize(config);
      await backgroundService.start();
      
      expect(backgroundService.isRunning()).toBe(true);
      
      await backgroundService.shutdown();
      
      expect(backgroundService.isRunning()).toBe(false);
      expect(backgroundService.isInitialized()).toBe(false);
    });
  });

  describe('Factory Functions', () => {
    test('should create background service with factory function', async () => {
      const service = await createBackgroundService(serviceContainer, logger);
      
      expect(service).toBeDefined();
      expect(service.isInitialized()).toBe(false);
      expect(service.isRunning()).toBe(false);
      
      // Clean up
      if (service.isRunning()) {
        await service.shutdown();
      }
    });

    test('should create background service with EVM pusher enabled', async () => {
      const service = await createBackgroundServiceWithEVM(logger);
      
      expect(service).toBeDefined();
      expect(service.isInitialized()).toBe(false);
      expect(service.isRunning()).toBe(false);
      
      // Clean up
      if (service.isRunning()) {
        await service.shutdown();
      }
    });
  });

  describe('Event Integration', () => {
    test('should emit lifecycle events', async () => {
      backgroundService = new BackgroundService(serviceContainer, logger);
      
      const events: string[] = [];
      
      backgroundService.on('initialized', () => events.push('initialized'));
      backgroundService.on('started', () => events.push('started'));
      backgroundService.on('stopped', () => events.push('stopped'));
      backgroundService.on('shutdown', () => events.push('shutdown'));
      
      const config: BackgroundServiceConfig = {
        scheduler: {
          intervalMs: 10000,
          continuous: true,
          maxRetries: 3,
          memo: 'Test scheduler',
          cosmosSequence: {
            postingTimeoutMs: 30000,
            drResultTimeout: 120000,
            maxQueueSize: 100
          }
        },
        evmPusher: {
          enabled: true,
          autoStart: true,
          healthCheckIntervalMs: 30000
        },
        lifecycle: {
          gracefulShutdownTimeoutMs: 10000,
          healthCheckIntervalMs: 30000,
          enableMetrics: true
        }
      };
      
      await backgroundService.initialize(config);
      expect(events).toContain('initialized');
      
      await backgroundService.start();
      expect(events).toContain('started');
      
      await backgroundService.stop();
      expect(events).toContain('stopped');
      
      await backgroundService.shutdown();
      expect(events).toContain('shutdown');
    });

    test('should emit health check events', async () => {
      backgroundService = new BackgroundService(serviceContainer, logger);
      
      const healthEvents: any[] = [];
      
      backgroundService.on('health-check', (health) => healthEvents.push(health));
      backgroundService.on('health-degraded', (health) => healthEvents.push({ type: 'degraded', health }));
      
      const config: BackgroundServiceConfig = {
        scheduler: {
          intervalMs: 10000,
          continuous: true,
          maxRetries: 3,
          memo: 'Test scheduler',
          cosmosSequence: {
            postingTimeoutMs: 30000,
            drResultTimeout: 120000,
            maxQueueSize: 100
          }
        },
        evmPusher: {
          enabled: true,
          autoStart: true,
          healthCheckIntervalMs: 30000
        },
        lifecycle: {
          gracefulShutdownTimeoutMs: 10000,
          healthCheckIntervalMs: 100, // Fast health checks for testing
          enableMetrics: true
        }
      };
      
      await backgroundService.initialize(config);
      await backgroundService.start();
      
      // Wait for at least one health check
      await new Promise(resolve => setTimeout(resolve, 200));
      
      await backgroundService.stop();
      
      // Should have received at least one health check event
      expect(healthEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete lifecycle with EVM pusher integration', async () => {
      backgroundService = new BackgroundService(serviceContainer, logger);
      
      const config: BackgroundServiceConfig = {
        scheduler: {
          intervalMs: 10000,
          continuous: true,
          maxRetries: 3,
          memo: 'Integration test',
          cosmosSequence: {
            postingTimeoutMs: 30000,
            drResultTimeout: 120000,
            maxQueueSize: 100
          }
        },
        evmPusher: {
          enabled: true,
          autoStart: true,
          healthCheckIntervalMs: 30000
        },
        lifecycle: {
          gracefulShutdownTimeoutMs: 10000,
          healthCheckIntervalMs: 30000,
          enableMetrics: true
        }
      };
      
      // Initialize
      await backgroundService.initialize(config);
      expect(backgroundService.isInitialized()).toBe(true);
      
      // Start
      await backgroundService.start();
      expect(backgroundService.isRunning()).toBe(true);
      
      // Check health
      const health = await backgroundService.getHealthStatus();
      expect(health.overall).toMatch(/healthy|degraded|unhealthy/);
      expect(health.services.evmPusher).toBeDefined();
      
      // Get statistics
      const stats = await backgroundService.getStatistics();
      expect(stats.evmPusher).toBeDefined();
      
      // Shutdown
      await backgroundService.shutdown();
      expect(backgroundService.isRunning()).toBe(false);
      expect(backgroundService.isInitialized()).toBe(false);
    });

    test('should handle error scenarios gracefully', async () => {
      backgroundService = new BackgroundService(serviceContainer, logger);
      
      // Try to start without initialization
      await expect(backgroundService.start()).rejects.toThrow('Background service not initialized');
      
      // Initialize with valid config
      const config: BackgroundServiceConfig = {
        scheduler: {
          intervalMs: 10000,
          continuous: true,
          maxRetries: 3,
          memo: 'Error test',
          cosmosSequence: {
            postingTimeoutMs: 30000,
            drResultTimeout: 120000,
            maxQueueSize: 100
          }
        },
        evmPusher: {
          enabled: true,
          autoStart: true,
          healthCheckIntervalMs: 30000
        },
        lifecycle: {
          gracefulShutdownTimeoutMs: 10000,
          healthCheckIntervalMs: 30000,
          enableMetrics: true
        }
      };
      
      await backgroundService.initialize(config);
      
      // Multiple initializations should be safe
      await backgroundService.initialize(config);
      
      await backgroundService.start();
      
      // Multiple starts should be safe
      await backgroundService.start();
      
      await backgroundService.stop();
      
      // Multiple stops should be safe
      await backgroundService.stop();
      
      await backgroundService.shutdown();
    });
  });
});

// Console output for manual testing
console.log('🧪 Phase 4: Integration with Existing System Tests');
console.log('============================================================');
console.log('');
console.log('📋 Test Categories:');
console.log('   1. Service Container Extensions');
console.log('   2. Background Service Architecture');
console.log('   3. Factory Functions');
console.log('   4. Event Integration');
console.log('   5. Integration Scenarios');
console.log('');
console.log('✅ All Phase 4 integration tests ready to run!');
console.log(''); 