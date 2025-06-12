/**
 * Service Container for Dependency Injection
 * Provides centralized service management and easy testing configuration
 * Extended for Phase 2 SEDA Chain Integration and Phase 3 Multi-Chain Push Engine
 */

import type { 
  ISEDAService, 
  IConfigService, 
  ILoggingService,
  IBatchService,
  IDataRequestTracker,
  ISEDAChainService
} from './index';

import { 
  SEDAService, 
  ConfigService, 
  LoggingService,
  BatchService,
  DataRequestTracker,
  SEDAChainService
} from './index';

import type { IEVMPusherService } from '../core/evm-pusher';

/**
 * Extended service container interface with Phase 2 and Phase 3 services
 */
export interface IServiceContainer {
  // Core services (Phase 1)
  sedaService: ISEDAService;
  configService: IConfigService;
  loggingService: ILoggingService;
  
  // Phase 2: SEDA Chain Integration services
  sedaChainService: ISEDAChainService;
  batchService: IBatchService;
  dataRequestTracker: IDataRequestTracker;
  
  // Phase 3: Multi-Chain Push Engine services
  evmPusherService?: IEVMPusherService; // Optional - only available when EVM pusher is enabled
}

/**
 * Production service container with real implementations
 */
export class ServiceContainer implements IServiceContainer {
  public readonly sedaService: ISEDAService;
  public readonly configService: IConfigService;
  public readonly loggingService: ILoggingService;
  public readonly sedaChainService: ISEDAChainService;
  public readonly batchService: IBatchService;
  public readonly dataRequestTracker: IDataRequestTracker;
  public readonly evmPusherService?: IEVMPusherService;

  constructor(
    // Core services
    sedaService?: ISEDAService,
    configService?: IConfigService,
    loggingService?: ILoggingService,
    // Phase 2 services
    sedaChainService?: ISEDAChainService,
    batchService?: IBatchService,
    dataRequestTracker?: IDataRequestTracker,
    // Phase 3 services
    evmPusherService?: IEVMPusherService
  ) {
    // Initialize core services
    this.loggingService = loggingService || new LoggingService();
    this.configService = configService || new ConfigService();
    this.sedaService = sedaService || new SEDAService();
    
    // Initialize Phase 2 services
    this.sedaChainService = sedaChainService || new SEDAChainService(this.loggingService, this.configService);
    this.batchService = batchService || new BatchService(this.loggingService);
    this.dataRequestTracker = dataRequestTracker || new DataRequestTracker(this.loggingService);
    
    // Initialize Phase 3 services (optional)
    this.evmPusherService = evmPusherService;
  }

  /**
   * Create a production service container with default implementations
   */
  static createProduction(): ServiceContainer {
    return new ServiceContainer();
  }

  /**
   * Create a production service container with EVM pusher enabled
   */
  static async createProductionWithEVM(): Promise<ServiceContainer> {
    const container = new ServiceContainer();
    
    // Initialize Phase 2 services
    const sedaConfig = { rpcEndpoint: 'https://rpc.testnet.seda.xyz', chainId: 'seda-1-testnet', network: 'testnet' as const };
    await container.sedaChainService.initialize(sedaConfig);
    await container.batchService.initialize(container.sedaChainService);
    await container.dataRequestTracker.initialize(container.sedaChainService);
    
    // Initialize Phase 3 EVM pusher service
    try {
      const { EVMPusherService } = await import('../core/evm-pusher');
      const evmPusherService = new EVMPusherService(
        container.batchService,
        container.dataRequestTracker,
        container.loggingService
      );
      
      await evmPusherService.initialize();
      
      return new ServiceContainer(
        container.sedaService,
        container.configService,
        container.loggingService,
        container.sedaChainService,
        container.batchService,
        container.dataRequestTracker,
        evmPusherService
      );
    } catch (error) {
      container.loggingService.warn(`⚠️  EVM Pusher Service not available: ${error}`);
      return container;
    }
  }

  /**
   * Create a test service container with mock implementations
   */
  static createTest(
    sedaService?: ISEDAService,
    configService?: IConfigService,
    loggingService?: ILoggingService,
    sedaChainService?: ISEDAChainService,
    batchService?: IBatchService,
    dataRequestTracker?: IDataRequestTracker,
    evmPusherService?: IEVMPusherService
  ): ServiceContainer {
    const { 
      MockSEDAService, 
      MockConfigService, 
      MockLoggingService,
      MockSEDAChainService,
      MockBatchService,
      MockDataRequestTracker
    } = require('./index');
    
    const mockLoggingService = loggingService || new MockLoggingService();
    
    return new ServiceContainer(
      sedaService || new MockSEDAService(),
      configService || new MockConfigService(),
      mockLoggingService,
      sedaChainService || new MockSEDAChainService(mockLoggingService),
      batchService || new MockBatchService(mockLoggingService),
      dataRequestTracker || new MockDataRequestTracker(mockLoggingService),
      evmPusherService
    );
  }

  /**
   * Create a test service container with mock EVM pusher
   */
  static async createTestWithEVM(): Promise<ServiceContainer> {
    const { MockEVMPusherService } = await import('../core/evm-pusher');
    const { 
      MockSEDAService, 
      MockConfigService, 
      MockLoggingService,
      MockSEDAChainService,
      MockBatchService,
      MockDataRequestTracker
    } = require('./index');
    
    const mockLoggingService = new MockLoggingService();
    const mockBatchService = new MockBatchService(mockLoggingService);
    const mockDataRequestTracker = new MockDataRequestTracker(mockLoggingService);
    
    const mockEVMPusherService = new MockEVMPusherService(
      mockBatchService,
      mockDataRequestTracker,
      mockLoggingService
    );
    
    return new ServiceContainer(
      new MockSEDAService(),
      new MockConfigService(),
      mockLoggingService,
      new MockSEDAChainService(mockLoggingService),
      mockBatchService,
      mockDataRequestTracker,
      mockEVMPusherService
    );
  }

  /**
   * Initialize all services in the container
   */
  async initialize(): Promise<void> {
    // Initialize Phase 2 services
    const sedaConfig = { rpcEndpoint: 'https://rpc.testnet.seda.xyz', chainId: 'seda-1-testnet', network: 'testnet' as const };
    await this.sedaChainService.initialize(sedaConfig);
    await this.batchService.initialize(this.sedaChainService);
    await this.dataRequestTracker.initialize(this.sedaChainService);
    
    // Initialize Phase 3 services if available
    if (this.evmPusherService) {
      await this.evmPusherService.initialize();
    }
    
    this.loggingService.info('✅ Service container initialized');
  }

  /**
   * Start all background services
   */
  async start(): Promise<void> {
    // Start Phase 2 services
    await this.dataRequestTracker.startTracking();
    
    // Start Phase 3 services if available
    if (this.evmPusherService) {
      await this.evmPusherService.start();
    }
    
    this.loggingService.info('✅ Background services started');
  }

  /**
   * Stop all background services
   */
  async stop(): Promise<void> {
    // Stop Phase 3 services first
    if (this.evmPusherService) {
      await this.evmPusherService.stop();
    }
    
    // Stop Phase 2 services
    await this.dataRequestTracker.stopTrackingAll();
    
    this.loggingService.info('✅ Background services stopped');
  }

  /**
   * Gracefully shutdown all services
   */
  async shutdown(): Promise<void> {
    // Shutdown Phase 3 services first
    if (this.evmPusherService) {
      await this.evmPusherService.shutdown();
    }
    
    // Shutdown Phase 2 services
    await this.dataRequestTracker.stopTrackingAll();
    
    this.loggingService.info('✅ Service container shutdown complete');
  }

  /**
   * Get health status of all services
   */
  async getHealthStatus(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, 'healthy' | 'degraded' | 'unhealthy'>;
    details: Record<string, any>;
  }> {
    const services: Record<string, 'healthy' | 'degraded' | 'unhealthy'> = {};
    const details: Record<string, any> = {};
    
    // Check Phase 2 services
    try {
      const sedaChainHealth = await this.sedaChainService.getChainHealth();
      services.sedaChainService = sedaChainHealth.connected ? 'healthy' : 'degraded';
      details.sedaChainService = sedaChainHealth;
    } catch (error) {
      services.sedaChainService = 'unhealthy';
      details.sedaChainService = { error: error instanceof Error ? error.message : String(error) };
    }
    
    try {
      const trackerStats = this.dataRequestTracker.getTrackingStatistics();
      services.dataRequestTracker = 'healthy';
      details.dataRequestTracker = trackerStats;
    } catch (error) {
      services.dataRequestTracker = 'unhealthy';
      details.dataRequestTracker = { error: error instanceof Error ? error.message : String(error) };
    }
    
    // Check Phase 3 services if available
    if (this.evmPusherService) {
      try {
        const evmHealth = await this.evmPusherService.getHealthStatus();
        services.evmPusherService = evmHealth.isHealthy ? 'healthy' : 'degraded';
        details.evmPusherService = evmHealth;
      } catch (error) {
        services.evmPusherService = 'unhealthy';
        details.evmPusherService = { error: error instanceof Error ? error.message : String(error) };
      }
    }
    
    // Determine overall health
    const healthyCount = Object.values(services).filter(status => status === 'healthy').length;
    const totalCount = Object.keys(services).length;
    
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyCount === totalCount) {
      overall = 'healthy';
    } else if (healthyCount > 0) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }
    
    return { overall, services, details };
  }
}

/**
 * Global service container instance
 * Can be overridden for testing
 */
let globalServiceContainer: IServiceContainer = ServiceContainer.createProduction();

/**
 * Get the current global service container
 */
export function getServices(): IServiceContainer {
  return globalServiceContainer;
}

/**
 * Set the global service container (useful for testing)
 */
export function setServices(container: IServiceContainer): void {
  globalServiceContainer = container;
}

/**
 * Reset to production services
 */
export function resetToProductionServices(): void {
  globalServiceContainer = ServiceContainer.createProduction();
}

/**
 * Reset to production services with EVM pusher enabled
 */
export async function resetToProductionServicesWithEVM(): Promise<void> {
  globalServiceContainer = await ServiceContainer.createProductionWithEVM();
} 