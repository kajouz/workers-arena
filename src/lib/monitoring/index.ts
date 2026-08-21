/**
 * Unified Monitoring Module
 *
 * This module provides a unified interface for error tracking, logging,
 * and performance monitoring. It can be configured via environment variables.
 *
 * Environment Variables:
 * - SENTRY_DSN: Sentry Data Source Name (enables Sentry)
 * - SENTRY_ENVIRONMENT: Current environment (default: development)
 * - LOG_LEVEL: Logging level (debug, info, warn, error)
 */

import {
  initSentry,
  captureError,
  captureWarning,
  captureMessage,
  setSentryUser,
  addBreadcrumb,
  startTransaction,
} from "./sentry";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const CURRENT_LOG_LEVEL = (process.env.LOG_LEVEL ?? "info") as LogLevel;

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LOG_LEVEL];
}

/**
 * Structured logger with level-based filtering
 */
export const logger = {
  debug(message: string, data?: Record<string, unknown>): void {
    if (shouldLog("debug")) {
      console.debug(`[DEBUG] ${message}`, data);
    }
  },

  info(message: string, data?: Record<string, unknown>): void {
    if (shouldLog("info")) {
      console.info(`[INFO] ${message}`, data);
    }
  },

  warn(message: string, data?: Record<string, unknown>): void {
    if (shouldLog("warn")) {
      captureWarning(message, data);
    }
  },

  error(message: string | Error, data?: Record<string, unknown>): void {
    if (shouldLog("error")) {
      captureError(message, data);
    }
  },
};

/**
 * Initialize all monitoring services
 */
export function initMonitoring(): void {
  initSentry();
  logger.info("Monitoring initialized", {
    environment: process.env.SENTRY_ENVIRONMENT ?? "development",
    logLevel: CURRENT_LOG_LEVEL,
  });
}

/**
 * Error boundary helper - wrap async functions with error tracking
 */
export function withErrorTracking<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  name: string
): T {
  return ((...args: any[]) => {
    const span = startTransaction(name, "function");
    return fn(...args)
      .then((result) => {
        span.finish();
        return result;
      })
      .catch((error) => {
        span.finish();
        captureError(error as Error, { function: name, args: args.slice(0, 3) });
        throw error;
      });
  }) as T;
}

/**
 * API route error handler
 */
export function handleApiError(
  error: unknown,
  context: { route: string; method: string; userId?: string }
): { status: number; body: { error: string; message?: string } } {
  const message = error instanceof Error ? error.message : "Unknown error";

  logger.error(`API Error: ${context.method} ${context.route}`, {
    error: message,
    userId: context.userId,
    stack: error instanceof Error ? error.stack : undefined,
  });

  // Don't expose internal errors to clients
  return {
    status: 500,
    body: {
      error: "internal_error",
      message: "An unexpected error occurred",
    },
  };
}

// Re-export Sentry utilities
export {
  captureError,
  captureWarning,
  captureMessage,
  setSentryUser,
  addBreadcrumb,
  startTransaction,
};
