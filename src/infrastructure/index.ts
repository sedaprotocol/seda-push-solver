/**
 * Infrastructure Module
 * Centralized exports for all infrastructure services and abstractions
 */

// Export process service
export type { ProcessServiceInterface, ProcessInfo } from './process-service';
export { ProcessService } from './process-service';

// Export timer service
export type { TimerServiceInterface, TimerId } from './timer-service';
export { TimerService } from './timer-service';

// Export health service
export type { 
  HealthServiceInterface, 
  HealthStatus, 
  HealthCheckResult, 
  OverallHealth, 
  SystemMetrics,
  HealthCheckFunction
} from './health-service';
export { HealthService } from './health-service';

// Export infrastructure container
export { InfrastructureContainer } from './infrastructure-container';

// Testing utilities (not for production use)
import { InfrastructureContainer } from './infrastructure-container';
let globalInfrastructure: InfrastructureContainer | null = null;

export function getInfrastructure(): InfrastructureContainer {
  if (!globalInfrastructure) {
    throw new Error('Infrastructure container not initialized. Call setInfrastructure() first.');
  }
  return globalInfrastructure;
}

export function setInfrastructure(container: InfrastructureContainer): void {
  globalInfrastructure = container;
}

export function resetInfrastructure(): void {
  globalInfrastructure = null;
} 