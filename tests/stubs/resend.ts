/**
 * Test-only stub for the lazily-imported resend SDK (not installed in dev).
 * The Resend channel is never exercised in unit tests; this alias keeps
 * Vite's transform of src/lib/notifications/providers/email.ts resolvable,
 * mirroring the webpackIgnore comment the Next.js build relies on.
 */
export class Resend {
  readonly emails = { send: async () => ({}) };
}
