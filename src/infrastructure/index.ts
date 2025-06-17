/**
 * Infrastructure Module
 * Centralized exports for all infrastructure services and abstractions
 */

// Export process service
export type { IProcessService, ProcessInfo } from './process-service';
export { ProcessService } from './process-service';

// Export timer service
export type { ITimerService, TimerId } from './timer-service';
export { TimerService } from './timer-service';

// Export health service
export type { 
  IHealthService, 
  HealthStatus, 
  HealthCheckResult, 
  OverallHealth, 
  SystemMetrics,
  HealthCheckFunction
} from './health-service';
export { HealthService } from './health-service';

// Export infrastructure container
export type { IInfrastructureContainer } from './infrastructure-container';
export {
  InfrastructureContainer,
  getInfrastructure,
  setInfrastructure,
  resetInfrastructure
} from './infrastructure-container'; 