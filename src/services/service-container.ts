/**
 * Service Container for Dependency Injection
 * Provides centralized service management and easy testing configuration
 */

import type { ISEDAService, IConfigService, ILoggingService } from './index';
import { SEDAService, ConfigService, LoggingService } from './index';

/**
 * Service container interface
 */
export interface IServiceContainer {
  sedaService: ISEDAService;
  configService: IConfigService;
  loggingService: ILoggingService;
}

/**
 * Production service container with real implementations
 */
export class ServiceContainer implements IServiceContainer {
  public readonly sedaService: ISEDAService;
  public readonly configService: IConfigService;
  public readonly loggingService: ILoggingService;

  constructor(
    sedaService?: ISEDAService,
    configService?: IConfigService,
    loggingService?: ILoggingService
  ) {
    this.sedaService = sedaService || new SEDAService();
    this.configService = configService || new ConfigService();
    this.loggingService = loggingService || new LoggingService();
  }

  /**
   * Create a production service container with default implementations
   */
  static createProduction(): ServiceContainer {
    return new ServiceContainer();
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