/**
 * Infrastructure Demo
 * Demonstrates practical usage of the infrastructure services
 */

import { 
  InfrastructureContainer, 
  setInfrastructure, 
  getInfrastructure 
} from '../src/infrastructure';
import { LoggingService, LogLevel } from '../src/services';

async function main() {
  console.log('🚀 Infrastructure Demo Starting...\n');

  // Create logging service
  const loggingService = new LoggingService();
  loggingService.setLogLevel(LogLevel.INFO);

  // Create production infrastructure
  const infrastructure = InfrastructureContainer.createProduction(loggingService);
  setInfrastructure(infrastructure);

  const { processService, timerService, healthService } = getInfrastructure();

  // === HEALTH MONITORING DEMO ===
  console.log('📊 Setting up health monitoring...');

  // Register some health checks
  healthService.registerCheck('memory-usage', async () => {
    const processInfo = processService.getProcessInfo();
    const memoryUsagePercent = (processInfo.memoryUsage.heapUsed / processInfo.memoryUsage.heapTotal) * 100;
    
    return {
      status: memoryUsagePercent > 80 ? 'degraded' : 'healthy',
      responseTime: 5,
      timestamp: timerService.now(),
      details: { memoryUsagePercent }
    };
  });

  healthService.registerCheck('uptime', async () => {
    const processInfo = processService.getProcessInfo();
    const uptimeMinutes = processInfo.uptime / (1000 * 60);
    
    return {
      status: 'healthy',
      responseTime: 2,
      timestamp: timerService.now(),
      details: { uptimeMinutes }
    };
  });

  // Start periodic health monitoring
  healthService.startPeriodicChecks(5000); // Every 5 seconds

  // === TIMER SERVICE DEMO ===
  console.log('⏰ Setting up timers...');

  let taskCount = 0;
  const periodicTask = timerService.setInterval(() => {
    taskCount++;
    loggingService.info(`🔄 Periodic task #${taskCount} executed`);
    
    // Record some metrics
    healthService.recordRequest(true, Math.random() * 100);
    
    if (taskCount >= 3) {
      loggingService.info('✅ Stopping periodic task');
      timerService.clearInterval(periodicTask);
    }
  }, 2000); // Every 2 seconds

  // One-time task
  timerService.setTimeout(() => {
    loggingService.info('🎯 One-time task executed');
  }, 1000);

  // === PROCESS LIFECYCLE DEMO ===
  console.log('🔧 Setting up graceful shutdown...');

  processService.onShutdown(async () => {
    loggingService.info('🧹 Cleanup: Stopping health monitoring');
    healthService.stopPeriodicChecks();
  });

  processService.onShutdown(async () => {
    loggingService.info('🧹 Cleanup: Clearing all timers');
    timerService.clearAllTimers();
  });

  processService.onShutdown(async () => {
    loggingService.info('🧹 Cleanup: Final cleanup complete');
  });

  // Start signal handling
  processService.startSignalHandling();

  // === MONITORING LOOP ===
  console.log('🔍 Starting monitoring loop...\n');

  const monitoringInterval = timerService.setInterval(async () => {
    // Get current metrics
    const metrics = healthService.getMetrics();
    const processInfo = processService.getProcessInfo();
    const overallHealth = await healthService.getOverallHealth();
    const memoryUsagePercent = (processInfo.memoryUsage.heapUsed / processInfo.memoryUsage.heapTotal) * 100;

    console.log('\n📊 === SYSTEM STATUS ===');
    console.log(`🏥 Health Status: ${overallHealth.status.toUpperCase()}`);
    console.log(`⏱️  Uptime: ${Math.round(processInfo.uptime / 1000)}s`);
    console.log(`💾 Memory: ${Math.round(memoryUsagePercent)}%`);
    console.log(`📈 Requests: ${metrics.requests.total} (${metrics.requests.successful} successful)`);
    console.log(`❌ Errors: ${metrics.errors.total}`);

    // Show individual health check results
    for (const [checkName, result] of Object.entries(overallHealth.checks)) {
      const status = result.status === 'healthy' ? '✅' : 
                    result.status === 'degraded' ? '⚠️' : '❌';
      console.log(`   ${status} ${checkName}: ${result.responseTime}ms`);
    }

    console.log('========================\n');
  }, 3000); // Every 3 seconds

  // === DEMO SIMULATION ===
  console.log('🎮 Running demo simulation...');

  // Simulate some work and errors
  await timerService.delay(1000);
  healthService.recordRequest(true, 50);
  healthService.recordRequest(false, 200);
  healthService.recordError('Simulated error for demo');

  // Let it run for a bit
  await timerService.delay(10000);

  // Graceful shutdown
  console.log('\n🛑 Initiating graceful shutdown...');
  timerService.clearInterval(monitoringInterval);
  await processService.gracefulShutdown();
}

// Run the demo
main().catch(error => {
  console.error('💥 Demo failed:', error);
  process.exit(1);
}); 