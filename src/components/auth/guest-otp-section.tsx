"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/components/providers/locale-provider";

/**
 * Guest phone verification section (booking + quote-request dialogs).
 *
 * Renders ONLY when the environment enforces guest OTP — the GET probe on
 * /api/auth/guest-otp decides (default: dormant, so the flow is unchanged
 * everywhere OTP is off). When enforced, the guest requests a code (rate-
 * limited server-side: 1/min per phone, 5/hour per IP), which arrives by SMS
 * — or, in demo mode, is displayed right in the dialog via the documented
 * `devCode` bypass so tests and local flows complete without a gateway.
 *
 * The entered code rides the dialog's FormData (`otpCode`) into the server
 * action, which verifies it single-use against the live challenge — the send
 * endpoint never issues anything the write path would trust by itself.
 */
export function GuestOtpSection({
  phone,
  onCodeChange,
}: {
  /** The guest's phone as typed — sent to the send endpoint verbatim; the server normalizes. */
  phone: string;
  /** Lifts the entered code into the dialog's submit payload. */
  onCodeChange: (code: string) => void;
}) {
  const { t } = useLocale();
  const [probe, setProbe] = useState<"loading" | "off" | "on">("loading");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState("");
  const [error, setError] = useState<"rate-limited" | "send-failed" | null>(null);
  const timerRef = useRef<number | null>(null);

  // One probe per mount: enforcement is env-backed and cannot change mid-flow.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/guest-otp", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { enforced?: boolean } | null) => {
        if (cancelled) return;
        setProbe(data?.enforced ? "on" : "off");
      })
      .catch(() => {
        if (!cancelled) setProbe("off");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cooldown countdown — mirrors the endpoint's 1/min per-phone limit.
  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [cooldown]);

  if (probe !== "on") return null;
  if (phone.trim().length < 8) return null;

  const send = async () => {
    if (sending || cooldown > 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/guest-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data: { ok?: boolean; devCode?: string; error?: string } = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setSent(true);
        setCooldown(60);
        setDevCode(data.devCode ?? null);
      } else if (data.error === "rate-limited") {
        setError("rate-limited");
      } else {
        setError("send-failed");
      }
    } catch {
      setError("send-failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-brand-500/30 bg-brand-500/5 p-4">
      <div className="flex items-start gap-2.5">
        <MessageSquareText className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{t("booking.otpTitle")}</p>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{t("booking.otpBody")}</p>

          <div className="mt-3 flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={send} disabled={sending || cooldown > 0}>
              {sending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {!sent || cooldown <= 0 ? t("booking.otpSend") : t("booking.otpResend")}
            </Button>
            {sent && cooldown > 0 && (
              <span className="text-xs text-ink-400">
                {cooldown}s
              </span>
            )}
            {sent && cooldown <= 0 && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">{t("booking.otpSent")}</span>
            )}
          </div>

          {devCode && (
            <p className="mt-2 rounded-lg bg-ink-100 px-2.5 py-1.5 font-mono text-sm font-bold tracking-[0.2em] text-ink-700 dark:bg-ink-800 dark:text-ink-100">
              {t("booking.otpDevCode")} {devCode}
            </p>
          )}

          {sent && (
            <div className="mt-3">
              <Input
                value={code}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(next);
                  onCodeChange(next);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={t("booking.otpPlaceholder")}
                className="max-w-[12rem] tracking-[0.3em]"
                aria-label={t("booking.otpPlaceholder")}
              />
            </div>
          )}

          {error === "rate-limited" && <p className="mt-2 text-xs text-red-500">{t("booking.otpRateLimited")}</p>}
          {error === "send-failed" && <p className="mt-2 text-xs text-red-500">{t("booking.otpSendFailed")}</p>}
        </div>
      </div>
    </div>
  );
}
