/**
 * Infrastructure Container for Dependency Injection
 * Provides centralized infrastructure service management and easy testing configuration
 */

import type { ILoggingService } from '../services';
import type { IProcessService, ITimerService, IHealthService } from './index';
import { ProcessService, TimerService, HealthService } from './index';

/**
 * Infrastructure container interface
 */
export interface IInfrastructureContainer {
  processService: IProcessService;
  timerService: ITimerService;
  healthService: IHealthService;
}

/**
 * Production infrastructure container with real implementations
 */
export class InfrastructureContainer implements IInfrastructureContainer {
  public readonly processService: IProcessService;
  public readonly timerService: ITimerService;
  public readonly healthService: IHealthService;

  constructor(
    loggingService: ILoggingService,
    processService?: IProcessService,
    timerService?: ITimerService,
    healthService?: IHealthService
  ) {
    this.timerService = timerService || new TimerService();
    this.processService = processService || new ProcessService(loggingService);
    this.healthService = healthService || new HealthService(loggingService, this.timerService);
  }

  /**
   * Create a production infrastructure container with default implementations
   */
  static createProduction(loggingService: ILoggingService): InfrastructureContainer {
    return new InfrastructureContainer(loggingService);
  }


}

/**
 * Global infrastructure container instance
 * Can be overridden for testing
 */
let globalInfrastructureContainer: IInfrastructureContainer | null = null;

/**
 * Get the current global infrastructure container
 */
export function getInfrastructure(): IInfrastructureContainer {
  if (!globalInfrastructureContainer) {
    throw new Error('Infrastructure container not initialized. Call setInfrastructure() first.');
  }
  return globalInfrastructureContainer;
}

/**
 * Set the global infrastructure container
 */
export function setInfrastructure(container: IInfrastructureContainer): void {
  globalInfrastructureContainer = container;
}

/**
 * Reset infrastructure container (useful for testing)
 */
export function resetInfrastructure(): void {
  globalInfrastructureContainer = null;
} 