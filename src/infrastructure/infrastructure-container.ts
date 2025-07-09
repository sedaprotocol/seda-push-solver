/**
 * Simple Infrastructure Container
 * Simplified infrastructure service management
 */

import type { LoggingService } from '../services';
import { ProcessService, TimerService, HealthService } from './index';
import { EvmOrchestrator } from '../evm/orchestrator';

/**
 * Simple infrastructure container with concrete implementations
 */
export class InfrastructureContainer {
  public readonly processService: ProcessService;
  public readonly timerService: TimerService;
  public readonly healthService: HealthService;
  private readonly loggingService: LoggingService;

  constructor(loggingService: LoggingService) {
    this.loggingService = loggingService;
    this.timerService = new TimerService(loggingService);
    this.processService = new ProcessService(loggingService);
    this.healthService = new HealthService(loggingService, this.timerService);
  }

  /**
   * Create a production infrastructure container
   */
  static createProduction(loggingService: LoggingService): InfrastructureContainer {
    return new InfrastructureContainer(loggingService);
  }

  /**
   * Shutdown all infrastructure services gracefully
   */
  async shutdown(): Promise<void> {
    try {
      this.loggingService.info('🛑 Starting infrastructure shutdown...');
      
      // Stop health service periodic checks first
      this.healthService.stopPeriodicChecks();
      
      // Shutdown EVM orchestrator if it exists
      try {
        await EvmOrchestrator.shutdownAll();
      } catch (error) {
        this.loggingService.warn('⚠️ EVM orchestrator shutdown error:', error instanceof Error ? error.message : String(error));
      }
      
      // Clear all active timers
      this.timerService.clearAllTimers();
      
      // Stop signal handling
      this.processService.stopSignalHandling();
      
      this.loggingService.info('✅ Infrastructure shutdown completed');
    } catch (error) {
      // Log error but continue shutdown
      this.loggingService.error('❌ Error during infrastructure shutdown:', error instanceof Error ? error : String(error));
    }
  }
} 