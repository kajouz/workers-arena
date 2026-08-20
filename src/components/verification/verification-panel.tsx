"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Phone,
  MessageCircle,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  Shield,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  type VerificationChannel,
  sendVerification,
  verifyCode,
  getVerificationStatus,
  maskEmail,
  maskPhone,
} from "@/lib/verification/verification-service";

const CHANNELS: {
  id: VerificationChannel;
  label: string;
  icon: typeof Mail;
  placeholder: string;
}[] = [
  {
    id: "email",
    label: "Email",
    icon: Mail,
    placeholder: "your@email.com",
  },
  {
    id: "phone",
    label: "Phone",
    icon: Phone,
    placeholder: "+961 71 123 456",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: MessageCircle,
    placeholder: "+961 71 123 456",
  },
];

export function VerificationPanel({ userId }: { userId: string }) {
  const [activeChannel, setActiveChannel] =
    useState<VerificationChannel>("email");
  const [target, setTarget] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [requestId, setRequestId] = useState<string | null>(null);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [status, setStatus] = useState(() => getVerificationStatus(userId));

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSend = async () => {
    if (!target.trim()) {
      toast("error", "Enter a target", `Please enter your ${activeChannel}`);
      return;
    }

    setSending(true);
    try {
      const result = await sendVerification({
        userId,
        channel: activeChannel,
        target: target.trim(),
      });
      setRequestId(result.requestId);
      setCooldown(result.expiresIn);
      toast(
        "success",
        "Code sent!",
        `Check your ${activeChannel} for the 6-digit code`
      );
      // Focus first code input
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    } catch (err) {
      toast("error", "Failed to send", (err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      toast("error", "Invalid code", "Please enter all 6 digits");
      return;
    }

    setVerifying(true);
    try {
      await verifyCode({ userId, channel: activeChannel, code: fullCode });
      setStatus(getVerificationStatus(userId));
      setCode(["", "", "", "", "", ""]);
      setRequestId(null);
      toast(
        "success",
        "Verified!",
        `Your ${activeChannel} has been verified successfully`
      );
    } catch (err) {
      toast("error", "Verification failed", (err as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    // Auto-advance
    if (value && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all 6 digits entered
    if (newCode.every((d) => d !== "") && !verifying) {
      setTimeout(() => {
        const fullCode = newCode.join("");
        setVerifying(true);
        verifyCode({ userId, channel: activeChannel, code: fullCode })
          .then(() => {
            setStatus(getVerificationStatus(userId));
            setCode(["", "", "", "", "", ""]);
            setRequestId(null);
            toast("success", "Verified!", `Your ${activeChannel} has been verified`);
          })
          .catch((err) => {
            toast("error", "Verification failed", err.message);
          })
          .finally(() => setVerifying(false));
      }, 200);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/30">
          <Shield className="size-5 text-brand-500" />
        </div>
        <div>
          <h3 className="font-semibold text-ink-900 dark:text-ink-50">
            Identity Verification
          </h3>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Verify your identity to build trust with customers
          </p>
        </div>
      </div>

      {/* Channel Tabs */}
      <div className="flex gap-2">
        {CHANNELS.map((ch) => {
          const verified = status[ch.id];
          return (
            <button
              key={ch.id}
              onClick={() => {
                setActiveChannel(ch.id);
                setTarget("");
                setCode(["", "", "", "", "", ""]);
                setRequestId(null);
              }}
              className={cn(
                "flex flex-1 items-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-all",
                activeChannel === ch.id
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-950/30 dark:text-brand-300"
                  : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300",
                verified &&
                  "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
              )}
            >
              <ch.icon className="size-4" />
              <span className="hidden sm:inline">{ch.label}</span>
              {verified && (
                <CheckCircle2 className="ml-auto size-4 text-emerald-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Status Badge */}
      <div className="flex gap-2">
        {CHANNELS.map((ch) => (
          <Badge
            key={ch.id}
            variant={status[ch.id] ? "default" : "outline"}
            className={cn(
              status[ch.id] &&
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            )}
          >
            {ch.label}: {status[ch.id] ? "Verified" : "Unverified"}
          </Badge>
        ))}
      </div>

      {/* Verification Form */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeChannel}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="space-y-4"
        >
          {/* Target Input */}
          {!requestId && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-300">
                {activeChannel === "email"
                  ? "Email Address"
                  : "Phone Number (E.164 format)"}
              </label>
              <div className="flex gap-2">
                <Input
                  type={activeChannel === "email" ? "email" : "tel"}
                  placeholder={
                    CHANNELS.find((c) => c.id === activeChannel)?.placeholder
                  }
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  disabled={status[activeChannel]}
                  className="flex-1"
                />
                <Button
                  onClick={handleSend}
                  disabled={sending || status[activeChannel] || cooldown > 0}
                >
                  {sending ? (
                    <RotateCcw className="size-4 animate-spin" />
                  ) : cooldown > 0 ? (
                    <Clock className="size-4" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                </Button>
              </div>
              {cooldown > 0 && (
                <p className="text-xs text-ink-400">
                  Resend in {Math.floor(cooldown / 60)}:
                  {String(cooldown % 60).padStart(2, "0")}
                </p>
              )}
            </div>
          )}

          {/* OTP Input */}
          {requestId && !status[activeChannel] && (
            <div className="space-y-3">
              <p className="text-sm text-ink-500 dark:text-ink-400">
                Enter the 6-digit code sent to{" "}
                {activeChannel === "email" ? maskEmail(target) : maskPhone(target)}
              </p>
              <div className="flex justify-center gap-2">
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { codeRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="size-12 rounded-xl border border-ink-200 bg-white text-center text-lg font-bold text-ink-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50 dark:focus:border-brand-400"
                    disabled={verifying}
                  />
                ))}
              </div>
              {verifying && (
                <p className="text-center text-sm text-ink-400">Verifying...</p>
              )}
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSend}
                  disabled={cooldown > 0 || sending}
                >
                  <RotateCcw className="mr-1 size-3" />
                  Resend code
                </Button>
              </div>
            </div>
          )}

          {/* Verified State */}
          {status[activeChannel] && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
              <CheckCircle2 className="size-5 text-emerald-500" />
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  {activeChannel.charAt(0).toUpperCase() + activeChannel.slice(1)} verified
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-500">
                  Your {activeChannel} has been confirmed
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
