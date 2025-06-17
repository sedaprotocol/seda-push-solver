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
export interface LoggingServiceInterface {
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
export class LoggingService implements LoggingServiceInterface {
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

 