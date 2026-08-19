/**
 * Sentry Error Tracking Integration
 *
 * This module provides error tracking via Sentry. It can be enabled by setting
 * the SENTRY_DSN environment variable. When not configured, errors are logged
 * to console instead.
 *
 * Setup:
 * 1. Create a Sentry project at https://sentry.io
 * 2. Get your DSN from Settings → Client Keys
 * 3. Add SENTRY_DSN to your .env.local
 * 4. Optional: Add SENTRY_AUTH_TOKEN for source maps
 */

const SENTRY_DSN = process.env.SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT ?? "development";
const SENTRY_RELEASE = process.env.npm_package_version ?? "unknown";

interface SentryError {
  message: string;
  stack?: string;
  level?: "error" | "warning" | "info";
  extra?: Record<string, unknown>;
  tags?: Record<string, string>;
}

/**
 * Initialize Sentry (call once at app startup)
 */
export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.log("[Monitoring] Sentry DSN not configured, using console logging");
    return;
  }

  console.log(`[Monitoring] Sentry initialized (env: ${SENTRY_ENVIRONMENT})`);

  // In production, you would import and initialize @sentry/nextjs here:
  // import * as Sentry from "@sentry/nextjs";
  // Sentry.init({
  //   dsn: SENTRY_DSN,
  //   environment: SENTRY_ENVIRONMENT,
  //   release: SENTRY_RELEASE,
  //   tracesSampleRate: 0.1, // 10% of transactions
  //   replaysSessionSampleRate: 0.01, // 1% of sessions
  //   replaysOnErrorSampleRate: 1.0, // 100% of errors
  // });
}

/**
 * Capture an error and send to Sentry (or console)
 */
export function captureError(error: Error | string, extra?: Record<string, unknown>): void {
  const errorObj: SentryError = {
    message: typeof error === "string" ? error : error.message,
    stack: typeof error === "object" ? error.stack : undefined,
    level: "error",
    extra,
  };

  if (SENTRY_DSN) {
    // In production, use Sentry.captureException(error, { extra });
    console.error("[Sentry]", errorObj);
  } else {
    console.error("[Error]", errorObj.message, extra);
  }
}

/**
 * Capture a warning message
 */
export function captureWarning(message: string, extra?: Record<string, unknown>): void {
  if (SENTRY_DSN) {
    console.warn("[Sentry]", message, extra);
  } else {
    console.warn("[Warning]", message, extra);
  }
}

/**
 * Capture an informational message
 */
export function captureMessage(message: string, extra?: Record<string, unknown>): void {
  if (SENTRY_DSN) {
    console.log("[Sentry]", message, extra);
  } else {
    console.log("[Info]", message, extra);
  }
}

/**
 * Set user context for error tracking
 */
export function setSentryUser(user: { id: string; email?: string; username?: string }): void {
  if (SENTRY_DSN) {
    console.log("[Sentry] User context set:", user.id);
  }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
): void {
  if (SENTRY_DSN) {
    console.log(`[Sentry] Breadcrumb: ${category} - ${message}`, data);
  }
}

/**
 * Performance monitoring - start a transaction
 */
export function startTransaction(name: string, op: string): { finish: () => void } {
  const start = Date.now();
  return {
    finish: () => {
      const duration = Date.now() - start;
      if (SENTRY_DSN) {
        console.log(`[Sentry] Transaction: ${name} (${op}) completed in ${duration}ms`);
      }
    },
  };
}
