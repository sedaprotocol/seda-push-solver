/**
 * Timer Service
 * Abstracts timing operations (setTimeout, setInterval) for better testing and control
 */

export type TimerId = number;

/**
 * Interface for timer operations
 */
export interface ITimerService {
  /**
   * Set a recurring timer
   */
  setInterval(callback: () => void, ms: number): TimerId;

  /**
   * Set a one-time timer
   */
  setTimeout(callback: () => void, ms: number): TimerId;

  /**
   * Clear an interval timer
   */
  clearInterval(id: TimerId): void;

  /**
   * Clear a timeout timer
   */
  clearTimeout(id: TimerId): void;

  /**
   * Create a delay promise
   */
  delay(ms: number): Promise<void>;

  /**
   * Get current timestamp
   */
  now(): number;

  /**
   * Clear all active timers
   */
  clearAllTimers(): void;
}

/**
 * Production timer service using native JavaScript timers
 */
export class TimerService implements ITimerService {
  private activeTimers = new Set<TimerId>();

  setInterval(callback: () => void, ms: number): TimerId {
    const id = setInterval(() => {
      try {
        callback();
      } catch (error) {
        // Log error but continue interval
        console.error('Timer callback error:', error);
      }
    }, ms) as unknown as TimerId;
    
    this.activeTimers.add(id);
    return id;
  }

  setTimeout(callback: () => void, ms: number): TimerId {
    const id = setTimeout(() => {
      this.activeTimers.delete(id);
      try {
        callback();
      } catch (error) {
        console.error('Timer callback error:', error);
      }
    }, ms) as unknown as TimerId;
    
    this.activeTimers.add(id);
    return id;
  }

  clearInterval(id: TimerId): void {
    clearInterval(id);
    this.activeTimers.delete(id);
  }

  clearTimeout(id: TimerId): void {
    clearTimeout(id);
    this.activeTimers.delete(id);
  }

  delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      this.setTimeout(() => resolve(), ms);
    });
  }

  now(): number {
    return Date.now();
  }

  clearAllTimers(): void {
    for (const id of this.activeTimers) {
      clearTimeout(id);
      clearInterval(id);
    }
    this.activeTimers.clear();
  }
}

/**
 * Mock timer service for testing with time control
 */
export class MockTimerService implements ITimerService {
  private timers = new Map<TimerId, {
    callback: () => void;
    triggerTime: number;
    interval?: number;
    type: 'timeout' | 'interval';
  }>();
  
  private nextId = 1;
  private currentTime = 0;

  setInterval(callback: () => void, ms: number): TimerId {
    const id = this.nextId++;
    this.timers.set(id, {
      callback,
      triggerTime: this.currentTime + ms,
      interval: ms,
      type: 'interval'
    });
    return id;
  }

  setTimeout(callback: () => void, ms: number): TimerId {
    const id = this.nextId++;
    this.timers.set(id, {
      callback,
      triggerTime: this.currentTime + ms,
      type: 'timeout'
    });
    return id;
  }

  clearInterval(id: TimerId): void {
    this.timers.delete(id);
  }

  clearTimeout(id: TimerId): void {
    this.timers.delete(id);
  }

  async delay(ms: number): Promise<void> {
    // In mock mode, delay is synchronous time advancement
    this.advanceTime(ms);
  }

  now(): number {
    return this.currentTime;
  }

  clearAllTimers(): void {
    this.timers.clear();
  }

  /**
   * Test helpers for controlling time
   */

  /**
   * Advance mock time and trigger any timers that should fire
   */
  advanceTime(ms: number): void {
    const targetTime = this.currentTime + ms;
    
    while (this.currentTime < targetTime) {
      // Find next timer to trigger
      let nextTriggerTime = targetTime;
      for (const [id, timer] of this.timers) {
        if (timer.triggerTime <= targetTime && timer.triggerTime > this.currentTime) {
          nextTriggerTime = Math.min(nextTriggerTime, timer.triggerTime);
        }
      }
      
      // Advance to next trigger time
      this.currentTime = nextTriggerTime;
      
      // Trigger all timers at this time
      const toTrigger: Array<{ id: TimerId; timer: any }> = [];
      for (const [id, timer] of this.timers) {
        if (timer.triggerTime === this.currentTime) {
          toTrigger.push({ id, timer });
        }
      }
      
      // Execute callbacks
      for (const { id, timer } of toTrigger) {
        try {
          timer.callback();
        } catch (error) {
          // Silently handle errors in mock
        }
        
        if (timer.type === 'timeout') {
          // Remove one-time timers
          this.timers.delete(id);
        } else if (timer.type === 'interval' && timer.interval) {
          // Reschedule interval timers
          timer.triggerTime = this.currentTime + timer.interval;
        }
      }
    }
    
    this.currentTime = targetTime;
  }

  /**
   * Run all pending timers immediately
   */
  runAllTimers(): void {
    const maxTime = Math.max(...Array.from(this.timers.values()).map(t => t.triggerTime));
    if (maxTime > this.currentTime) {
      this.advanceTime(maxTime - this.currentTime);
    }
  }

  /**
   * Run only timeout timers (not intervals)
   */
  runOnlyPendingTimers(): void {
    const timeouts = Array.from(this.timers.entries())
      .filter(([_, timer]) => timer.type === 'timeout')
      .map(([_, timer]) => timer.triggerTime);
    
    if (timeouts.length > 0) {
      const maxTime = Math.max(...timeouts);
      if (maxTime > this.currentTime) {
        this.advanceTime(maxTime - this.currentTime);
      }
    }
  }

  /**
   * Get count of pending timers
   */
  getTimerCount(): number {
    return this.timers.size;
  }

  /**
   * Get pending timers info (for debugging)
   */
  getTimerInfo(): Array<{ id: TimerId; triggerTime: number; type: string }> {
    return Array.from(this.timers.entries()).map(([id, timer]) => ({
      id,
      triggerTime: timer.triggerTime,
      type: timer.type
    }));
  }

  /**
   * Reset mock timer to initial state
   */
  reset(): void {
    this.timers.clear();
    this.nextId = 1;
    this.currentTime = 0;
  }

  /**
   * Set current time (useful for testing specific time scenarios)
   */
  setTime(timestamp: number): void {
    this.currentTime = timestamp;
  }
} 