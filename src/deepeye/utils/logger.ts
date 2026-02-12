/**
 * DeepEyeClaw — Logger
 *
 * Structured logging with Winston. JSON in production, pretty in development.
 * All gateway components import and use this shared logger instance.
 */

import { createLogger, format, transports, Logger } from "winston";

const { combine, timestamp, printf, colorize, json, errors } = format;

const devFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${ts} [${level}] ${message}${metaStr}`;
});

function buildLogger(level: string = "info"): Logger {
  const isProduction = process.env.NODE_ENV === "production";

  return createLogger({
    level,
    defaultMeta: { service: "deepeyeclaw" },
    format: combine(
      errors({ stack: true }),
      timestamp({ format: "HH:mm:ss.SSS" }),
      isProduction ? json() : combine(colorize(), devFormat),
    ),
    transports: [
      new transports.Console(),
      // File transport for errors
      ...(isProduction
        ? [
            new transports.File({
              filename: "logs/error.log",
              level: "error",
              maxsize: 5_242_880, // 5MB
              maxFiles: 5,
            }),
            new transports.File({
              filename: "logs/combined.log",
              maxsize: 10_485_760, // 10MB
              maxFiles: 10,
            }),
          ]
        : []),
    ],
  });
}

/** Shared logger instance */
export const logger = buildLogger(process.env.LOG_LEVEL ?? "info");

/** Create a child logger with extra context */
export function childLogger(component: string, extra?: Record<string, unknown>): Logger {
  return logger.child({ component, ...extra });
}
