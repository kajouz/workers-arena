// @ts-nocheck — Sentry config files use loose types for event scrubbing
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  release: process.env.npm_package_version ?? "unknown",

  // Performance monitoring — sample 10% of transactions
  tracesSampleRate: 0.1,

  // Only enabled when DSN is set and not in test
  enabled:
    Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) &&
    process.env.NODE_ENV !== "test",

  // Scrub sensitive data before sending
  beforeSend(event) {
    if (event.request?.cookies) {
      delete event.request.cookies;
    }
    return event;
  },
});
