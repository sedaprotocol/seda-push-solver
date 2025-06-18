/**
 * Services Module
 * Centralized exports for all service interfaces and implementations
 */

// Export SEDA service
export type { SedaServiceInterface } from './seda-service';
export { SEDAService } from './seda-service';

// Export configuration service
export type { ConfigServiceInterface } from './config-service';
export { ConfigService } from './config-service';

// Export logging service
export type { LoggingServiceInterface } from './logging-service';
export { LoggingService, LogLevel } from './logging-service';

// Export service container
export {
  ServiceContainer,
  DEFAULT_SERVICES
} from './service-container';

// Testing utilities (not for production use)
import { ServiceContainer } from './service-container';
let globalServices: ServiceContainer | null = null;

export function getServices(): ServiceContainer {
  if (!globalServices) {
    globalServices = ServiceContainer.createProduction();
  }
  return globalServices;
}

export function setServices(container: ServiceContainer): void {
  globalServices = container;
}

export function resetToProductionServices(): void {
  globalServices = ServiceContainer.createProduction();
} 