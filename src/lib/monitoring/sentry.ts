/**
 * Sentry Error Tracking Integration
 *
 * Production-ready error tracking via Sentry. Set these env vars:
 * - SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN: Sentry DSN (required)
 * - SENTRY_ENVIRONMENT: current environment (default: development)
 * - SENTRY_AUTH_TOKEN: For source map uploads
 *
 * Sentry is initialized in sentry.client.config.ts and sentry.server.config.ts.
 * This module provides a typed wrapper for programmatic capture.
 */

import * as Sentry from "@sentry/nextjs";

const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT ?? "development";
let sentryInitialized = true; // SDK init happens via config files

/**
 * Initialize Sentry (no-op — SDK is initialized via sentry.*.config.ts)
 */
export function initSentry(): void {
  if (SENTRY_ENVIRONMENT !== "test") {
    console.log(`[Monitoring] Sentry active (env: ${SENTRY_ENVIRONMENT})`);
  }
}

/**
 * Capture an error and send to Sentry (or console)
 */
export function captureError(error: Error | string, extra?: Record<string, unknown>): void {
  const message = typeof error === "string" ? error : error.message;
  try {
    if (typeof error === "string") {
      Sentry.captureMessage(error, "error");
    } else {
      Sentry.captureException(error, { extra });
    }
  } catch {
    console.error("[Error]", message, extra);
  }
}

/**
 * Capture a warning message
 */
export function captureWarning(message: string, extra?: Record<string, unknown>): void {
  try {
    Sentry.captureMessage(message, "warning");
  } catch {
    console.warn("[Warning]", message, extra);
  }
}

/**
 * Capture an informational message
 */
export function captureMessage(message: string, extra?: Record<string, unknown>): void {
  try {
    Sentry.captureMessage(message, "info");
  } catch {
    console.log("[Info]", message, extra);
  }
}

/**
 * Set user context for error tracking
 */
export function setSentryUser(user: { id: string; email?: string; username?: string }): void {
  Sentry.setUser({ id: user.id, email: user.email, username: user.username });
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
): void {
  Sentry.addBreadcrumb({ category, message, data });
}

/**
 * Performance monitoring - start a span
 */
export function startSpan(name: string, op: string): { finish: () => void } {
  let span: { end: () => void } | undefined;
  Sentry.startSpan({ name, op }, (s) => {
    span = s;
  });
  return {
    finish: () => span?.end(),
  };
}

// Legacy alias
export const startTransaction = startSpan;
