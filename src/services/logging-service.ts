/**
 * Logging Service Interface
 * Abstracts logging operations for better testability and control
 */

/**
 * Log levels for controlling output
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

/**
 * Interface for logging operations
 * Allows mocking and controlling log output during testing
 */
export interface ILoggingService {
  /**
   * Log an informational message
   */
  info(message: string, ...args: any[]): void;

  /**
   * Log an error message
   */
  error(message: string, ...args: any[]): void;

  /**
   * Log a warning message
   */
  warn(message: string, ...args: any[]): void;

  /**
   * Log a debug message
   */
  debug(message: string, ...args: any[]): void;

  /**
   * Set the current log level
   */
  setLogLevel(level: LogLevel): void;

  /**
   * Get the current log level
   */
  getLogLevel(): LogLevel;
}

/**
 * Production implementation using console
 */
export class LoggingService implements ILoggingService {
  private logLevel: LogLevel = LogLevel.INFO;

  info(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.INFO) {
      console.log(message, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.ERROR) {
      console.error(message, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.WARN) {
      console.warn(message, ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.DEBUG) {
      console.debug(message, ...args);
    }
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  getLogLevel(): LogLevel {
    return this.logLevel;
  }
}

/**
 * Mock implementation for testing
 */
export class MockLoggingService implements ILoggingService {
  private logLevel: LogLevel = LogLevel.INFO;
  private logs: Array<{ level: string; message: string; args: any[] }> = [];

  info(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.INFO) {
      this.logs.push({ level: 'info', message, args });
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.ERROR) {
      this.logs.push({ level: 'error', message, args });
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.WARN) {
      this.logs.push({ level: 'warn', message, args });
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.DEBUG) {
      this.logs.push({ level: 'debug', message, args });
    }
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Get all captured logs (for testing)
   */
  getLogs(): Array<{ level: string; message: string; args: any[] }> {
    return [...this.logs];
  }

  /**
   * Clear all captured logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Get logs of a specific level
   */
  getLogsByLevel(level: string): Array<{ level: string; message: string; args: any[] }> {
    return this.logs.filter(log => log.level === level);
  }
} 