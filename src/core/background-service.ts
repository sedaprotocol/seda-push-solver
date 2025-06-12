/**
 * Background Service Architecture for Phase 4
 * Unified service that manages both DataRequest scheduler and EVM pusher
 */

import { EventEmitter } from 'events';
import type { ILoggingService } from '../services/logging-service';
import type { IServiceContainer, ServiceContainer } from '../services/service-container';
import type { IEVMPusherService } from './evm-pusher';
import type { SchedulerConfig } from '../types';

/**
 * Background service configuration
 */
export interface BackgroundServiceConfig {
  // Scheduler configuration
  scheduler: SchedulerConfig;
  
  // EVM pusher configuration
  evmPusher: {
    enabled: boolean;
    autoStart: boolean;
    healthCheckIntervalMs: number;
  };
  
  // Service lifecycle configuration
  lifecycle: {
    gracefulShutdownTimeoutMs: number;
    healthCheckIntervalMs: number;
    enableMetrics: boolean;
  };
}

/**
 * Background service health status
 */
export interface BackgroundServiceHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    scheduler?: 'healthy' | 'degraded' | 'unhealthy';
    evmPusher?: 'healthy' | 'degraded' | 'unhealthy';
    serviceContainer: 'healthy' | 'degraded' | 'unhealthy';
  };
  details: {
    uptime: number;
    lastHealthCheck: number;
    serviceContainer: any;
    scheduler?: any;
    evmPusher?: any;
  };
}

/**
 * Background service statistics
 */
export interface BackgroundServiceStatistics {
  uptime: number;
  totalHealthChecks: number;
  lastHealthCheck: number;
  serviceContainer: any;
  scheduler?: any;
  evmPusher?: any;
}

/**
 * Interface for the unified background service
 */
export interface IBackgroundService {
  /**
   * Initialize the background service
   */
  initialize(config: BackgroundServiceConfig): Promise<void>;
  
  /**
   * Start all background services
   */
  start(): Promise<void>;
  
  /**
   * Stop all background services
   */
  stop(): Promise<void>;
  
  /**
   * Gracefully shutdown all services
   */
  shutdown(): Promise<void>;
  
  /**
   * Get health status of all services
   */
  getHealthStatus(): Promise<BackgroundServiceHealth>;
  
  /**
   * Get comprehensive statistics
   */
  getStatistics(): Promise<BackgroundServiceStatistics>;
  
  /**
   * Check if service is running
   */
  isRunning(): boolean;
  
  /**
   * Check if service is initialized
   */
  isInitialized(): boolean;
}

/**
 * Production implementation of unified background service
 */
export class BackgroundService extends EventEmitter implements IBackgroundService {
  private config: BackgroundServiceConfig | null = null;
  private serviceContainer: ServiceContainer;
  private initialized = false;
  private running = false;
  private shutdownRequested = false;
  
  // Service lifecycle tracking
  private startTime: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthCheckCount = 0;
  private lastHealthCheck = 0;
  
  // Scheduler integration (placeholder for actual scheduler)
  private schedulerService: any = null;

  constructor(
    serviceContainer: ServiceContainer,
    private logger: ILoggingService
  ) {
    super();
    this.serviceContainer = serviceContainer;
  }

  async initialize(config: BackgroundServiceConfig): Promise<void> {
    if (this.initialized) {
      this.logger.warn('⚠️  Background service already initialized');
      return;
    }

    this.config = config;
    this.logger.info('🚀 Initializing unified background service...');

    try {
      // Initialize service container
      await this.serviceContainer.initialize();
      
      // Initialize scheduler if needed (placeholder)
      if (this.config.scheduler) {
        this.logger.info('📅 Scheduler integration ready');
        // TODO: Initialize actual scheduler service when available
      }
      
      // EVM pusher is already initialized via service container
      if (this.config.evmPusher.enabled && this.serviceContainer.evmPusherService) {
        this.logger.info('🌐 EVM pusher service ready');
      }
      
      this.initialized = true;
      this.logger.info('✅ Background service initialized successfully');
      this.emit('initialized');
      
    } catch (error) {
      this.logger.error(`❌ Failed to initialize background service: ${error}`);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Background service not initialized. Call initialize() first.');
    }

    if (this.running) {
      this.logger.warn('⚠️  Background service already running');
      return;
    }

    this.logger.info('▶️  Starting unified background service...');

    try {
      this.running = true;
      this.shutdownRequested = false;
      this.startTime = Date.now();
      
      // Start service container background services
      await this.serviceContainer.start();
      
      // Start scheduler if configured (placeholder)
      if (this.config!.scheduler && this.schedulerService) {
        this.logger.info('📅 Starting scheduler service...');
        // TODO: Start actual scheduler service
      }
      
      // EVM pusher is started via service container
      if (this.config!.evmPusher.enabled && this.serviceContainer.evmPusherService) {
        this.logger.info('🌐 EVM pusher service started via service container');
      }
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      this.logger.info('✅ Background service started successfully');
      this.emit('started');
      
    } catch (error) {
      this.running = false;
      this.logger.error(`❌ Failed to start background service: ${error}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      this.logger.warn('⚠️  Background service not running');
      return;
    }

    this.logger.info('⏹️  Stopping unified background service...');

    try {
      this.running = false;
      
      // Stop health monitoring
      this.stopHealthMonitoring();
      
      // Stop scheduler if running (placeholder)
      if (this.schedulerService) {
        this.logger.info('📅 Stopping scheduler service...');
        // TODO: Stop actual scheduler service
      }
      
      // Stop service container background services
      await this.serviceContainer.stop();
      
      this.logger.info('✅ Background service stopped successfully');
      this.emit('stopped');
      
    } catch (error) {
      this.logger.error(`❌ Error stopping background service: ${error}`);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.shutdownRequested) {
      this.logger.warn('⚠️  Background service shutdown already in progress');
      return;
    }

    this.shutdownRequested = true;
    this.logger.info('🔄 Shutting down unified background service...');

    try {
      // Stop the service first
      if (this.running) {
        await this.stop();
      }
      
      // Shutdown service container
      await this.serviceContainer.shutdown();
      
      // Clear state
      this.initialized = false;
      this.startTime = 0;
      this.healthCheckCount = 0;
      this.lastHealthCheck = 0;
      
      this.logger.info('✅ Background service shutdown complete');
      this.emit('shutdown');
      
    } catch (error) {
      this.logger.error(`❌ Error during background service shutdown: ${error}`);
      throw error;
    }
  }

  async getHealthStatus(): Promise<BackgroundServiceHealth> {
    const now = Date.now();
    const uptime = this.startTime > 0 ? now - this.startTime : 0;
    
    // Get service container health
    const containerHealth = await this.serviceContainer.getHealthStatus();
    
    const services: BackgroundServiceHealth['services'] = {
      serviceContainer: containerHealth.overall
    };
    
    const details: BackgroundServiceHealth['details'] = {
      uptime,
      lastHealthCheck: this.lastHealthCheck,
      serviceContainer: containerHealth.details
    };
    
    // Add scheduler health if available (placeholder)
    if (this.schedulerService) {
      services.scheduler = 'healthy'; // TODO: Get actual scheduler health
      details.scheduler = { status: 'placeholder' };
    }
    
    // Add EVM pusher health if available
    if (this.serviceContainer.evmPusherService) {
      try {
        const evmHealth = await this.serviceContainer.evmPusherService.getHealthStatus();
        services.evmPusher = evmHealth.isHealthy ? 'healthy' : 'degraded';
        details.evmPusher = evmHealth;
      } catch (error) {
        services.evmPusher = 'unhealthy';
        details.evmPusher = { error: error instanceof Error ? error.message : String(error) };
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

  async getStatistics(): Promise<BackgroundServiceStatistics> {
    const now = Date.now();
    const uptime = this.startTime > 0 ? now - this.startTime : 0;
    
    // Get service container health for statistics
    const containerHealth = await this.serviceContainer.getHealthStatus();
    
    const stats: BackgroundServiceStatistics = {
      uptime,
      totalHealthChecks: this.healthCheckCount,
      lastHealthCheck: this.lastHealthCheck,
      serviceContainer: containerHealth.details
    };
    
    // Add scheduler statistics if available (placeholder)
    if (this.schedulerService) {
      stats.scheduler = { status: 'placeholder' };
    }
    
    // Add EVM pusher statistics if available
    if (this.serviceContainer.evmPusherService) {
      try {
        const evmStats = await this.serviceContainer.evmPusherService.getStatistics();
        stats.evmPusher = evmStats;
      } catch (error) {
        stats.evmPusher = { error: error instanceof Error ? error.message : String(error) };
      }
    }
    
    return stats;
  }

  isRunning(): boolean {
    return this.running && !this.shutdownRequested;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private startHealthMonitoring(): void {
    if (!this.config) return;
    
    const intervalMs = this.config.lifecycle.healthCheckIntervalMs;
    this.logger.info(`⏰ Starting health monitoring with ${intervalMs}ms interval`);
    
    this.healthCheckInterval = setInterval(async () => {
      if (!this.running || this.shutdownRequested) {
        return;
      }
      
      try {
        await this.performHealthCheck();
      } catch (error) {
        this.logger.error(`❌ Health check error: ${error}`);
      }
    }, intervalMs);
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.info('⏹️  Health monitoring stopped');
    }
  }

  private async performHealthCheck(): Promise<void> {
    this.healthCheckCount++;
    this.lastHealthCheck = Date.now();
    
    try {
      const health = await this.getHealthStatus();
      
      if (health.overall === 'unhealthy') {
        this.logger.warn('⚠️  Background service health check: UNHEALTHY');
        this.emit('health-degraded', health);
      } else if (health.overall === 'degraded') {
        this.logger.warn('⚠️  Background service health check: DEGRADED');
        this.emit('health-degraded', health);
      } else {
        this.logger.debug('✅ Background service health check: HEALTHY');
      }
      
      this.emit('health-check', health);
      
    } catch (error) {
      this.logger.error(`❌ Health check failed: ${error}`);
      this.emit('health-check-failed', error);
    }
  }
}

/**
 * Factory function to create background service with service container
 */
export async function createBackgroundService(
  serviceContainer: ServiceContainer,
  logger: ILoggingService
): Promise<IBackgroundService> {
  return new BackgroundService(serviceContainer, logger);
}

/**
 * Factory function to create background service with EVM pusher enabled
 */
export async function createBackgroundServiceWithEVM(
  logger: ILoggingService
): Promise<IBackgroundService> {
  const { ServiceContainer } = await import('../services/service-container');
  const serviceContainer = await ServiceContainer.createProductionWithEVM();
  
  return new BackgroundService(serviceContainer, logger);
} 