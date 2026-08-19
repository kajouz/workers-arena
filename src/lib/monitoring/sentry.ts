/**
 * Sentry Error Tracking Integration
 *
 * Production-ready error tracking via Sentry. Set these env vars:
 * - SENTRY_DSN: Your Sentry DSN (required)
 * - SENTRY_ENVIRONMENT: current environment (default: development)
 * - SENTRY_AUTH_TOKEN: For source map uploads
 *
 * Setup:
 * 1. Create a Sentry project at https://sentry.io
 * 2. Get your DSN from Settings → Client Keys
 * 3. Add to .env.local:
 *    SENTRY_DSN=https://xxx@sentry.io/xxx
 *    SENTRY_ENVIRONMENT=production
 *    SENTRY_AUTH_TOKEN=sntrys_xxx
 */

const SENTRY_DSN = process.env.SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT ?? "development";
const SENTRY_RELEASE = process.env.npm_package_version ?? "unknown";
let sentryInitialized = false;

/**
 * Initialize Sentry (call once at app startup)
 * Uses dynamic import to avoid bundling @sentry/nextjs when DSN is not set.
 */
export async function initSentry(): Promise<void> {
  if (sentryInitialized) return;

  if (!SENTRY_DSN) {
    console.log("[Monitoring] Sentry DSN not configured — using console logging");
    return;
  }

  try {
    // @sentry/nextjs is optional - install it for production
    const Sentry = await import(/* webpackIgnore: true */ "@sentry/nextjs").catch(() => null);
    if (!Sentry) {
      console.warn("[Monitoring] @sentry/nextjs not installed. Run: npm install @sentry/nextjs");
      return;
    }
    (Sentry as any).init({
      dsn: SENTRY_DSN,
      environment: SENTRY_ENVIRONMENT,
      release: SENTRY_RELEASE,
      tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
      replaysSessionSampleRate: 0.01, // 1% of sessions for session replay
      replaysOnErrorSampleRate: 1.0, // 100% of errors for replay
      enabled: SENTRY_ENVIRONMENT !== "test",
      beforeSend: (event: any) => {
        // Don't send events in test environment
        if (SENTRY_ENVIRONMENT === "test") return null;
        // Scrub sensitive data
        if (event.request?.cookies) {
          delete event.request.cookies;
        }
        return event;
      },
    });
    sentryInitialized = true;
    console.log(`[Monitoring] Sentry initialized (env: ${SENTRY_ENVIRONMENT}, release: ${SENTRY_RELEASE})`);
  } catch (error) {
    // @sentry/nextjs not installed - fallback to console logging
    console.warn("[Monitoring] Sentry not available (install @sentry/nextjs for production)");
  }
}

/**
 * Capture an error and send to Sentry (or console)
 */
export async function captureError(error: Error | string, extra?: Record<string, unknown>): Promise<void> {
  const message = typeof error === "string" ? error : error.message;  if (SENTRY_DSN && sentryInitialized) {
    try {
      const Sentry = await import(/* webpackIgnore: true */ "@sentry/nextjs").catch(() => null);
      if (Sentry) {
        if (typeof error === "string") {
          (Sentry as any).captureMessage(error, "error");
        } else {
          (Sentry as any).captureException(error, { extra });
        }
      }
    } catch {
      console.error("[Sentry] Failed to capture error:", message, extra);
    }
  } else {
    console.error("[Error]", message, extra);
  }
}

/**
 * Capture a warning message
 */
export async function captureWarning(message: string, extra?: Record<string, unknown>): Promise<void> {  if (SENTRY_DSN && sentryInitialized) {
    try {
      const Sentry = await import(/* webpackIgnore: true */ "@sentry/nextjs").catch(() => null);
      if (Sentry) (Sentry as any).captureMessage(message, "warning");
    } catch {
      console.warn("[Sentry] Failed to capture warning:", message);
    }
  } else {
    console.warn("[Warning]", message, extra);
  }
}

/**
 * Capture an informational message
 */
export async function captureMessage(message: string, extra?: Record<string, unknown>): Promise<void> {  if (SENTRY_DSN && sentryInitialized) {
    try {
      const Sentry = await import(/* webpackIgnore: true */ "@sentry/nextjs").catch(() => null);
      if (Sentry) (Sentry as any).captureMessage(message, "info");
    } catch {
      console.log("[Sentry] Failed to capture message:", message);
    }
  } else {
    console.log("[Info]", message, extra);
  }
}

/**
 * Set user context for error tracking
 */
export async function setSentryUser(user: { id: string; email?: string; username?: string }): Promise<void> {  if (SENTRY_DSN && sentryInitialized) {
    try {
      const Sentry = await import(/* webpackIgnore: true */ "@sentry/nextjs").catch(() => null);
      if (Sentry) (Sentry as any).setUser({ id: user.id, email: user.email, username: user.username });
    } catch {
      console.log("[Sentry] User context set (fallback):", user.id);
    }
  }
}

/**
 * Add breadcrumb for debugging
 */
export async function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
): Promise<void> {  if (SENTRY_DSN && sentryInitialized) {
    try {
      const Sentry = await import(/* webpackIgnore: true */ "@sentry/nextjs").catch(() => null);
      if (Sentry) (Sentry as any).addBreadcrumb({ category, message, data: data as Record<string, unknown> });
    } catch {
      // Silent fail for breadcrumbs
    }
  }
}

/**
 * Performance monitoring - start a span
 */
export async function startSpan(name: string, op: string): Promise<{ finish: () => void }> {
  const start = Date.now();
  let span: any = null;

  if (SENTRY_DSN && sentryInitialized) {
    try {
      const Sentry = await import(/* webpackIgnore: true */ "@sentry/nextjs").catch(() => null);
      if (Sentry) span = (Sentry as any).startSpan({ name, op }, () => {});
    } catch {
      // Fallback to manual timing
    }
  }

  return {
    finish: () => {
      const duration = Date.now() - start;
      if (span?.finish) {
        span.finish();
      } else if (SENTRY_DSN) {
        console.log(`[Sentry] Span: ${name} (${op}) completed in ${duration}ms`);
      }
    },
  };
}

// Legacy alias
export const startTransaction = startSpan;
