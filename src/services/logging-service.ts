/**
 * Logging Service
 * Provides structured logging with different levels
 */

import { Option } from "effect";
import { type Logger, createLogger, format, transports } from "winston";
import type { LoggingArgs } from "../types/core";
import "winston-daily-rotate-file";

/**
 * Log levels for controlling output
 */
export enum LogLevel {
	ERROR = 0,
	WARN = 1,
	INFO = 2,
	DEBUG = 3,
}

/**
 * Interface for logging operations
 * Allows mocking and controlling log output during testing
 */
export interface LoggingServiceInterface {
	/**
	 * Log an info message
	 * @param message The message to log
	 * @param args Additional arguments to log
	 */
	info(message: string, ...args: LoggingArgs): void;

	/**
	 * Log an error message
	 * @param message The message to log
	 * @param args Additional arguments to log
	 */
	error(message: string, ...args: LoggingArgs): void;

	/**
	 * Log a warning message
	 * @param message The message to log
	 * @param args Additional arguments to log
	 */
	warn(message: string, ...args: LoggingArgs): void;

	/**
	 * Log a debug message
	 * @param message The message to log
	 * @param args Additional arguments to log
	 */
	debug(message: string, ...args: LoggingArgs): void;

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
 * Console-based logging service implementation
 */
export class LoggingService implements LoggingServiceInterface {
	private logLevel: "debug" | "info" | "warn" | "error";
	private logger: Logger;

	constructor(logLevel: "debug" | "info" | "warn" | "error" = "info") {
		this.logLevel = logLevel;

		const rotateFileTransport = new transports.DailyRotateFile({
			level: "debug",
			dirname: "./logs",
			filename: "seda-push-solver-%DATE%.log",
			datePattern: "YYYY-MM-DD",
			zippedArchive: true,
			maxFiles: "14d",
			maxSize: "20m",
			format: logFormat(false),
		});

		const logger = createLogger({
			level: this.logLevel,
			transports: [consoleTransport, rotateFileTransport],
			format: format.combine(
				format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
				format.metadata({
					fillExcept: ["message", "level", "timestamp", "label"],
				}),
				format.errors({ stack: true }),
			),
		});

		this.logger = logger;
	}

	info(message: string, ...args: LoggingArgs): void {
		if (this.shouldLog("info")) {
			this.logger.info(message, ...args);
		}
	}

	error(message: string, ...args: LoggingArgs): void {
		if (this.shouldLog("error")) {
			this.logger.error(message, ...args);
		}
	}

	warn(message: string, ...args: LoggingArgs): void {
		if (this.shouldLog("warn")) {
			this.logger.warn(message, ...args);
		}
	}

	debug(message: string, ...args: LoggingArgs): void {
		if (this.shouldLog("debug")) {
			this.logger.debug(message, ...args);
		}
	}

	setLogLevel(level: LogLevel): void {
		const levelMap = {
			[LogLevel.DEBUG]: "debug" as const,
			[LogLevel.INFO]: "info" as const,
			[LogLevel.WARN]: "warn" as const,
			[LogLevel.ERROR]: "error" as const,
		};
		this.logLevel = levelMap[level];
	}

	getLogLevel(): LogLevel {
		const levelMap = {
			debug: LogLevel.DEBUG,
			info: LogLevel.INFO,
			warn: LogLevel.WARN,
			error: LogLevel.ERROR,
		};
		return levelMap[this.logLevel];
	}

	private shouldLog(level: "debug" | "info" | "warn" | "error"): boolean {
		const levels = ["debug", "info", "warn", "error"];
		const currentLevelIndex = levels.indexOf(this.logLevel);
		const requestedLevelIndex = levels.indexOf(level);
		return requestedLevelIndex >= currentLevelIndex;
	}
}

type ExtraInfo = {
	id?: string;
	error?: Error | string;
};

function cyan(val: string) {
	return `\x1b[36m${val}\x1b[0m`;
}

const logFormat = (withColors: boolean) =>
	format.printf((info) => {
		const metadata = info.metadata as ExtraInfo;
		const id = Option.fromNullable(metadata.id)
			.pipe(Option.map((t) => (withColors ? `[${cyan(t)}] ` : `[${t}] `)))
			.pipe(Option.getOrElse(() => ""));

		const logMsg = `${info.timestamp} ${info.level}: ${id}`;

		return Option.fromNullable(metadata.error)
			.pipe(Option.map((err) => `${logMsg} ${info.message} ${err}`))
			.pipe(Option.getOrElse(() => `${logMsg}${info.message}`));
	});

const consoleTransport = new transports.Console({
	format: format.combine(format.colorize(), logFormat(true)),
});
