/**
 * ────────────────────────────────────────────────────────────────────────────
 * DYNAMIC SERVER IMPORTS
 * ────────────────────────────────────────────────────────────────────────────
 * Turbopack performs static analysis on `import("module")` even when the path
 * is a variable, and panics if the module is optional / not installed.  These
 * wrappers use `globalThis.Function("return import(...)")` which Turbopack
 * cannot statically trace — the call is invisible to the bundler, so it never
 * tries to resolve the module.  At runtime Node.js loads them normally.
 * ────────────────────────────────────────────────────────────────────────────
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function defaultImport(specifier: string): Promise<any> {
  try {
    // Turbopack can't see through Function() — the import is invisible to it.
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-require-imports
    const loader = new Function("s", "return import(s)");
    return await loader(specifier);
  } catch {
    return null;
  }
}

/** Overridable import function — tests can swap this via the module mock. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let _importFn: (specifier: string) => Promise<any> = defaultImport;

/** Override the import function (for tests). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function _setImportFn(fn: (specifier: string) => Promise<any>) {
  _importFn = fn;
}

/** Lazy-load nodemailer (only when SMTP is configured). */
export async function loadNodemailer() {
  return _importFn("nodemailer");
}

/** Lazy-load twilio (only when Twilio credentials are set). */
export async function loadTwilio() {
  return _importFn("twilio");
}

/** Lazy-load resend (only when Resend API key is set). */
export async function loadResend() {
  return _importFn("resend");
}
