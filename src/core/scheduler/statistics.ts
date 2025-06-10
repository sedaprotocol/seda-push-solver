/**
 * Scheduler Statistics Management
 * Handles tracking and reporting of scheduler performance metrics
 */

import type { SchedulerStats } from '../../types';

/**
 * Statistics Manager for the SEDA DataRequest Scheduler
 */
export class SchedulerStatistics {
  private stats: SchedulerStats;

  constructor() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      startTime: Date.now()
    };
  }

  /**
   * Reset all statistics (typically called when scheduler starts)
   */
  reset(): void {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      startTime: Date.now()
    };
  }

  /**
   * Record a successful DataRequest
   */
  recordSuccess(): void {
    this.stats.successfulRequests++;
    this.stats.totalRequests++;
  }

  /**
   * Record a failed DataRequest
   */
  recordFailure(): void {
    this.stats.failedRequests++;
    this.stats.totalRequests++;
  }

  /**
   * Get current statistics
   */
  getStats(): SchedulerStats {
    return { ...this.stats };
  }

  /**
   * Calculate and format runtime duration
   */
  getRuntimeMinutes(): string {
    const runtime = Date.now() - this.stats.startTime;
    return (runtime / 60000).toFixed(1);
  }

  /**
   * Calculate success rate as percentage
   */
  getSuccessRate(): number {
    if (this.stats.totalRequests === 0) return 0;
    return (this.stats.successfulRequests / this.stats.totalRequests) * 100;
  }

  /**
   * Print comprehensive statistics report
   */
  printReport(): void {
    const runtime = this.getRuntimeMinutes();
    
    console.log('\n📈 SCHEDULER STATISTICS');
    console.log('='.repeat(50));
    console.log(`⏱️  Total Runtime: ${runtime} minutes`);
    console.log(`📊 Total Requests: ${this.stats.totalRequests}`);
    console.log(`✅ Successful: ${this.stats.successfulRequests}`);
    console.log(`❌ Failed: ${this.stats.failedRequests}`);
    
    if (this.stats.totalRequests > 0) {
      const successRate = this.getSuccessRate();
      console.log(`📈 Overall Success Rate: ${successRate.toFixed(1)}%`);
    }
    
    console.log('='.repeat(50));
  }
} 