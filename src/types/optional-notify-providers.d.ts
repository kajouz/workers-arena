/**
 * Optional notification-provider SDKs (lazy-loaded by src/lib/notifications).
 *
 * These packages are NOT installed by default — the app degrades gracefully to
 * the console providers until a deployment enables a real provider. The
 * dynamic `import()` calls in the provider files therefore cannot be resolved
 * statically; these ambient declarations type them as `any` so `tsc` passes
 * with or without the packages installed.
 *
 * Install when enabling a provider:
 *   npm i nodemailer      # NOTIFY_EMAIL_PROVIDER="smtp"
 *   npm i resend          # NOTIFY_EMAIL_PROVIDER="resend"
 *   npm i web-push        # push with VAPID keys
 *   npm i twilio          # NOTIFY_SMS_PROVIDER="twilio" (SMS)
 *
 * WhatsApp Cloud API needs no SDK — the whatsapp provider calls the Graph API
 * directly with fetch.
 *
 * NOTE: once a package is installed, you may delete its declaration here to
 * restore the package's real types (the ambient declaration would otherwise
 * keep typing it as `any`). The app works either way.
 */
declare module "nodemailer";
declare module "resend";
declare module "web-push";
declare module "twilio";
