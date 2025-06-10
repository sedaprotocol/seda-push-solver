/**
 * Health Monitoring Service
 * Provides system health checks, performance monitoring, and service status tracking
 */

import type { ILoggingService } from '../services';
import type { ITimerService, TimerId } from './timer-service';

/**
 * Health check result status
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Individual health check result
 */
export interface HealthCheckResult {
  status: HealthStatus;
  responseTime: number;
  details?: any;
  error?: string;
  timestamp: number;
}

/**
 * Overall system health
 */
export interface OverallHealth {
  status: HealthStatus;
  checks: Record<string, HealthCheckResult>;
  uptime: number;
  timestamp: number;
}

/**
 * System performance metrics
 */
export interface SystemMetrics {
  requests: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
  };
  memory: {
    used: number;
    total: number;
    usage: number; // percentage
  };
  uptime: number;
  errors: {
    total: number;
    lastHour: number;
  };
}

/**
 * Health check function type
 */
export type HealthCheckFunction = () => Promise<HealthCheckResult>;

/**
 * Interface for health monitoring operations
 */
export interface IHealthService {
  /**
   * Register a health check
   */
  registerCheck(name: string, checkFn: HealthCheckFunction): void;

  /**
   * Remove a health check
   */
  unregisterCheck(name: string): void;

  /**
   * Run a specific health check
   */
  runCheck(name: string): Promise<HealthCheckResult>;

  /**
   * Get overall system health
   */
  getOverallHealth(): Promise<OverallHealth>;

  /**
   * Get system performance metrics
   */
  getMetrics(): SystemMetrics;

  /**
   * Start periodic health monitoring
   */
  startPeriodicChecks(intervalMs: number): void;

  /**
   * Stop periodic health monitoring
   */
  stopPeriodicChecks(): void;

  /**
   * Record a request metric
   */
  recordRequest(successful: boolean, responseTime: number): void;

  /**
   * Record an error
   */
  recordError(error: Error | string): void;
}

/**
 * Production health service implementation
 */
export class HealthService implements IHealthService {
  private checks = new Map<string, HealthCheckFunction>();
  private lastResults = new Map<string, HealthCheckResult>();
  private periodicCheckTimer: TimerId | null = null;
  private startTime = Date.now();
  
  // Metrics tracking
  private requestMetrics = {
    total: 0,
    successful: 0,
    failed: 0,
    totalResponseTime: 0
  };
  
  private errorHistory: Array<{ timestamp: number; error: string }> = [];

  constructor(
    private loggingService: ILoggingService,
    private timerService: ITimerService
  ) {}

  registerCheck(name: string, checkFn: HealthCheckFunction): void {
    this.checks.set(name, checkFn);
    this.loggingService.debug(`🏥 Registered health check: ${name}`);
  }

  unregisterCheck(name: string): void {
    this.checks.delete(name);
    this.lastResults.delete(name);
    this.loggingService.debug(`🏥 Unregistered health check: ${name}`);
  }

  async runCheck(name: string): Promise<HealthCheckResult> {
    const checkFn = this.checks.get(name);
    if (!checkFn) {
      throw new Error(`Health check '${name}' not found`);
    }

    const startTime = this.timerService.now();
    
    try {
      const result = await checkFn();
      result.timestamp = this.timerService.now();
      result.responseTime = result.timestamp - startTime;
      
      this.lastResults.set(name, result);
      return result;
    } catch (error) {
      const failureResult: HealthCheckResult = {
        status: 'unhealthy',
        responseTime: this.timerService.now() - startTime,
        timestamp: this.timerService.now(),
        error: error instanceof Error ? error.message : String(error)
      };
      
      this.lastResults.set(name, failureResult);
      return failureResult;
    }
  }

  async getOverallHealth(): Promise<OverallHealth> {
    const results: Record<string, HealthCheckResult> = {};
    let overallStatus: HealthStatus = 'healthy';

    // Run all registered checks
    for (const checkName of this.checks.keys()) {
      try {
        results[checkName] = await this.runCheck(checkName);
        
        // Determine overall status
        if (results[checkName].status === 'unhealthy') {
          overallStatus = 'unhealthy';
        } else if (results[checkName].status === 'degraded' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } catch (error) {
        results[checkName] = {
          status: 'unhealthy',
          responseTime: 0,
          timestamp: this.timerService.now(),
          error: error instanceof Error ? error.message : String(error)
        };
        overallStatus = 'unhealthy';
      }
    }

    return {
      status: overallStatus,
      checks: results,
      uptime: this.timerService.now() - this.startTime,
      timestamp: this.timerService.now()
    };
  }

  getMetrics(): SystemMetrics {
    // Clean up old errors (keep only last hour)
    const oneHourAgo = this.timerService.now() - (60 * 60 * 1000);
    this.errorHistory = this.errorHistory.filter(e => e.timestamp > oneHourAgo);

    return {
      requests: {
        total: this.requestMetrics.total,
        successful: this.requestMetrics.successful,
        failed: this.requestMetrics.failed,
        averageResponseTime: this.requestMetrics.total > 0 
          ? this.requestMetrics.totalResponseTime / this.requestMetrics.total 
          : 0
      },
      memory: this.getMemoryMetrics(),
      uptime: this.timerService.now() - this.startTime,
      errors: {
        total: this.errorHistory.length,
        lastHour: this.errorHistory.filter(e => e.timestamp > oneHourAgo).length
      }
    };
  }

  startPeriodicChecks(intervalMs: number): void {
    if (this.periodicCheckTimer) {
      this.loggingService.warn('🏥 Periodic health checks already running');
      return;
    }

    this.periodicCheckTimer = this.timerService.setInterval(async () => {
      try {
        const health = await this.getOverallHealth();
        if (health.status !== 'healthy') {
          this.loggingService.warn(`🏥 System health: ${health.status}`);
        }
      } catch (error) {
        this.loggingService.error(`🏥 Health check failed: ${error}`);
      }
    }, intervalMs);

    this.loggingService.info(`🏥 Started periodic health checks (${intervalMs}ms interval)`);
  }

  stopPeriodicChecks(): void {
    if (this.periodicCheckTimer) {
      this.timerService.clearInterval(this.periodicCheckTimer);
      this.periodicCheckTimer = null;
      this.loggingService.info('🏥 Stopped periodic health checks');
    }
  }

  recordRequest(successful: boolean, responseTime: number): void {
    this.requestMetrics.total++;
    this.requestMetrics.totalResponseTime += responseTime;
    
    if (successful) {
      this.requestMetrics.successful++;
    } else {
      this.requestMetrics.failed++;
    }
  }

  recordError(error: Error | string): void {
    const errorMessage = error instanceof Error ? error.message : error;
    this.errorHistory.push({
      timestamp: this.timerService.now(),
      error: errorMessage
    });
  }

  private getMemoryMetrics() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        used: usage.heapUsed,
        total: usage.heapTotal,
        usage: (usage.heapUsed / usage.heapTotal) * 100
      };
    }
    
    // Fallback for environments without process.memoryUsage
    return {
      used: 0,
      total: 0,
      usage: 0
    };
  }
}

/**
 * Mock health service for testing
 */
export class MockHealthService implements IHealthService {
  private checks = new Map<string, HealthCheckFunction>();
  private mockResults = new Map<string, HealthCheckResult>();
  private mockMetrics: SystemMetrics;
  private periodicCheckTimer: TimerId | null = null;

  constructor(
    private loggingService: ILoggingService,
    private timerService: ITimerService
  ) {
    this.mockMetrics = {
      requests: { total: 0, successful: 0, failed: 0, averageResponseTime: 0 },
      memory: { used: 20 * 1024 * 1024, total: 50 * 1024 * 1024, usage: 40 },
      uptime: 0,
      errors: { total: 0, lastHour: 0 }
    };
  }

  registerCheck(name: string, checkFn: HealthCheckFunction): void {
    this.checks.set(name, checkFn);
  }

  unregisterCheck(name: string): void {
    this.checks.delete(name);
    this.mockResults.delete(name);
  }

  async runCheck(name: string): Promise<HealthCheckResult> {
    if (this.mockResults.has(name)) {
      return this.mockResults.get(name)!;
    }
    
    return {
      status: 'healthy',
      responseTime: 10,
      timestamp: this.timerService.now()
    };
  }

  async getOverallHealth(): Promise<OverallHealth> {
    const results: Record<string, HealthCheckResult> = {};
    let overallStatus: HealthStatus = 'healthy';

    for (const checkName of this.checks.keys()) {
      results[checkName] = await this.runCheck(checkName);
      if (results[checkName].status !== 'healthy') {
        overallStatus = results[checkName].status;
      }
    }

    return {
      status: overallStatus,
      checks: results,
      uptime: this.timerService.now(),
      timestamp: this.timerService.now()
    };
  }

  getMetrics(): SystemMetrics {
    return { ...this.mockMetrics };
  }

  startPeriodicChecks(intervalMs: number): void {
    this.periodicCheckTimer = this.timerService.setInterval(() => {
      // Mock periodic check
    }, intervalMs);
  }

  stopPeriodicChecks(): void {
    if (this.periodicCheckTimer) {
      this.timerService.clearInterval(this.periodicCheckTimer);
      this.periodicCheckTimer = null;
    }
  }

  recordRequest(successful: boolean, responseTime: number): void {
    this.mockMetrics.requests.total++;
    if (successful) {
      this.mockMetrics.requests.successful++;
    } else {
      this.mockMetrics.requests.failed++;
    }
  }

  recordError(error: Error | string): void {
    this.mockMetrics.errors.total++;
    this.mockMetrics.errors.lastHour++;
  }

  /**
   * Test helpers
   */
  setMockResult(checkName: string, result: HealthCheckResult): void {
    this.mockResults.set(checkName, result);
  }

  setMockMetrics(metrics: Partial<SystemMetrics>): void {
    this.mockMetrics = { ...this.mockMetrics, ...metrics };
  }
} 