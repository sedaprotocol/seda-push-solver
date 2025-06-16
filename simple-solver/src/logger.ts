import { createLogger, format, type transport, transports } from "winston";
import "winston-daily-rotate-file";
import { Maybe } from "true-myth";
import { LOG_FILE_DIR, LOG_LEVEL } from "./constants";

const logFormat = format.printf((info) => {
	const id = Maybe.of(info.metadata?.id).mapOr(" ", (t) => {
		return ` [${cyan(t)}] `;
	});
	const logMsg = `${info.timestamp}${id}${info.level}`;

	return Maybe.of(info.metadata?.error).mapOr(
		`${logMsg}: ${info.message}`,
		(err) => `${logMsg}: ${info.message} ${err}`,
	);
});

const destinations: transport[] = [
	new transports.Console({
		format: format.combine(format.colorize(), logFormat),
	}),
];

if (LOG_FILE_DIR) {
	destinations.push(
		new transports.DailyRotateFile({
			filename: "seda-solver-%DATE%.log",
			dirname: LOG_FILE_DIR,
			format: format.json(),
			datePattern: "YYYY-MM-DD-HH",
			maxFiles: "14d",
		}),
	);
}

const logger = createLogger({
	level: LOG_LEVEL,
	format: format.combine(
		format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
		format.metadata({
			fillExcept: ["message", "level", "timestamp", "label"],
		}),
	),
	transports: destinations,
});

export default logger;

function cyan(val: string) {
	return `\x1b[36m${val}\x1b[0m`;
}
