"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import { biometricLogin, isBiometricAvailable, type BiometricType } from "@/lib/mobile/biometric-auth";

/**
 * Native biometric unlock for the login screen.
 *
 * Web fallback by construction: every wrapper in biometric-auth gates on
 * Capacitor.isNativePlatform and reports unavailable in a browser, so this
 * component renders nothing on the web PWA — only a native shell ever shows
 * the unlock button. The opt-in checkbox beside the form is gated the same
 * way (useNativeBiometric below).
 *
 * Flow: after one successful password sign-in with the opt-in checked, the
 * password is stored in the device's secure storage (Keychain / Keystore via
 * capacitor-secure-storage-plugin) and the email becomes the unlock hint.
 * Next visit, the unlock button prompts Face ID / fingerprint, decrypts the
 * stored password and hands it back through `onUnlock` — the login page
 * fills the password field and submits the SAME loginAction server action,
 * so the auth path is byte-identical to a typed sign-in.
 *
 * The unlock hint is stored in localStorage deliberately: it is not a secret,
 * and it must survive where secure storage is only readable after a prompt.
 */
const HINT_KEY = "wa-biometric-last-user";

export const BIOMETRIC_HINT_KEY = HINT_KEY;

/** Whether this device can offer biometric unlock (native shells only). */
export function useNativeBiometric(): { supported: boolean } {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void isBiometricAvailable().then((availability) => {
      if (!cancelled && availability.available) setSupported(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { supported };
}

export function BiometricLogin({
  onUnlock,
}: {
  onUnlock: (credentials: { username: string; password: string }) => void;
}) {
  const { t } = useLocale();
  const [typeName, setTypeName] = useState<BiometricType>("none");
  const [username, setUsername] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const availability = await isBiometricAvailable();
      if (cancelled || !availability.available) return;
      setTypeName(availability.biometricType);
      const hint = localStorage.getItem(HINT_KEY);
      if (hint) setUsername(hint);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // No native shell, or no stored hint yet (first sign-in) → nothing to render.
  if (!username) return null;

  const unlock = async () => {
    setBusy(true);
    setFailed(false);
    const result = await biometricLogin(username);
    setBusy(false);
    if (result.success && result.credentials) {
      // Both fields travel: the login page pre-fills the email from the hint
      // (it may be empty if the visitor opened the app fresh) and the password
      // from the decrypted secret, then submits the regular form.
      onUnlock(result.credentials);
      return;
    }
    // Stale hint (credentials were removed) or a cancelled prompt — surface a
    // localized message and let the password form take over.
    setFailed(true);
  };

  return (
    <div className="mt-3">
      <Button type="button" variant="outline" onClick={unlock} disabled={busy} className="w-full">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
        {busy ? t("auth.biometricBusy") : t("auth.biometricUnlock")}
      </Button>
      {failed && <p className="mt-2 text-xs text-red-500">{t("auth.biometricFailed")}</p>}
    </div>
  );
}
