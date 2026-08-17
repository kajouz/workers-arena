/**
 * Test-only stub for the lazily-imported nodemailer SDK (not installed in
 * dev). The SMTP channel is never exercised in unit tests; this alias keeps
 * Vite's transform of src/lib/notifications/providers/email.ts resolvable,
 * mirroring the webpackIgnore comment the Next.js build relies on for the
 * same import.
 */
export default {
  createTransport: () => ({ sendMail: async () => ({}) }),
};
