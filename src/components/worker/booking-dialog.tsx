"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Hourglass, Loader2, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/components/providers/locale-provider";
import { useCountdownTick } from "@/hooks/use-countdown-tick";
import { toast } from "@/components/ui/toast";
import { ServicePicker } from "./service-picker";
import { SlotPicker } from "./slot-picker";
import { requestBookingAction, requestRecurringBookingAction } from "@/app/actions/bookings";
import { cn } from "@/lib/utils";
import { isPlanFeeExempt } from "@/lib/data/booking-ui";
import { BOOKING_CANCEL_REFUND_WINDOW_MS, BOOKING_SLA_EXPIRE_HOURS } from "@/lib/data/types";
import type { BookingSlot, RecurringFrequency, Worker } from "@/lib/data/types";

/** Repeat options shown in the details step (§7 #1 — recurring bookings). */
const REPEAT_OPTIONS: { value: RecurringFrequency | null; labelKey: string }[] = [
  { value: null, labelKey: "booking.repeatNone" },
  { value: "weekly", labelKey: "booking.repeatWeekly" },
  { value: "biweekly", labelKey: "booking.repeatBiweekly" },
  { value: "monthly", labelKey: "booking.repeatMonthly" },
];

type Step = "service" | "slot" | "details";

const STEPS: Step[] = ["service", "slot", "details"];

/**
 * §2.2 live countdown — when the request auto-expires from the customer's
 * POV. The real window starts at submission (creation + BOOKING_SLA_EXPIRE_HOURS),
 * but pre-submit there is no creation timestamp, so the honest estimate is the
 * earliest moment the request can die: the selected slot's start (the worker
 * must respond before the job time) capped at the 48h window. Once the request
 * exists, the post-submit rows recompute from the real creation event — this is
 * a pre-commit estimate only.
 */
function dialogSlaExpiryMs(slotStartMs: number, nowMs: number): number {
  return Math.min(slotStartMs, nowMs + BOOKING_SLA_EXPIRE_HOURS * 60 * 60 * 1000);
}

/**
 * Customer booking dialog (docs/booking-customer-ui.md §5.1). Three steps —
 * service → slot → details — then requestBookingAction. On a "slot-taken"
 * conflict it shows a banner and router.refresh() re-fetches slots server-side.
 */
export function BookingDialog({ worker, slots, children }: { worker: Worker; slots: BookingSlot[]; children: React.ReactNode }) {
  const { locale, t } = useLocale();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("service");
  const [serviceName, setServiceName] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [slotId, setSlotId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency | null>(null);
  const [isEmergency, setIsEmergency] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [done, setDone] = useState(false);
  // §2.2 — the countdown's expiry is captured ONCE, when the details step is
  // entered: recomputing it from a moving `now` would pin `min(slot, now+48h) −
  // now` at exactly 48h for any slot past the window, a static clock.
  const [slaExpiryAt, setSlaExpiryAt] = useState<number | null>(null);
  // §2.2 — when the estimate's window started (details-step entry ≈ submission).
  // The urgency bar's denominator: slaExpiryAt − slaCapturedAt, so it starts
  // full (green) at entry and drains as time passes — the same "starts full at
  // window start" model as the worker's RespondDialog bar.
  const [slaCapturedAt, setSlaCapturedAt] = useState<number | null>(null);

  const selectedSlot = slots.find((s) => s.id === slotId);

  // §2.2 — capture the expiry when the details step is entered (stable slotId
  // dep, NOT the selectedSlot object — a fresh reference per render would
  // reset it). The clock itself is visibility-aware: pauses while the tab is
  // hidden, resyncs on visibilitychange, so it never drifts.
  useEffect(() => {
    if (step !== "details" || !slotId) return;
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    setSlaExpiryAt(dialogSlaExpiryMs(Date.parse(slot.startAt), Date.now()));
    setSlaCapturedAt(Date.now());
  }, [step, slotId, slots]);

  const now = useCountdownTick(step === "details" && selectedSlot !== undefined);

  const workerName = locale === "ar" ? worker.nameAr : worker.nameEn;
  const stepIndex = STEPS.indexOf(step);

  const openDialog = () => {
    // Fresh state per open (the server may have re-fetched slots meanwhile).
    setStep("service");
    setServiceName(null);
    setJobTitle("");
    setSlotId(null);
    setName("");
    setPhone("");
    setEmail("");
    setNote("");
    setFrequency(null);
    setIsEmergency(false);
    setConflict(false);
    setDone(false);
    setSlaExpiryAt(null);
    setSlaCapturedAt(null);
    setOpen(true);
  };

  const pickService = (nameEn: string | null) => {
    setServiceName(nameEn);
    if (nameEn) {
      const svc = worker.services.find((s) => s.nameEn === nameEn);
      if (svc) setJobTitle(locale === "ar" ? svc.nameAr : svc.nameEn);
    }
  };

  const next = () => setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]!);
  const back = () => setStep(STEPS[Math.max(stepIndex - 1, 0)]!);

  const canContinue =
    step === "service"
      ? jobTitle.trim().length >= 3
      : step === "slot"
        ? slotId !== null
        : name.trim().length >= 2 && phone.trim().length >= 8;

  const submit = async () => {
    if (!slotId || submitting) return;
    setSubmitting(true);
    setConflict(false);

    const fd = new FormData();
    fd.set("slotId", slotId);
    fd.set("customerName", name.trim());
    fd.set("customerPhone", phone.trim());
    fd.set("customerEmail", email.trim());
    fd.set("jobTitle", jobTitle.trim());
    fd.set("note", note.trim());
    fd.set("serviceItemName", serviceName ?? "");
    if (frequency) fd.set("frequency", frequency);
    if (isEmergency) fd.set("isEmergency", "true");

    // A repeat cadence routes to the recurring action — same first-occurrence
    // claim, plus the contract the worker accepts once (§7 #1).
    const res = frequency
      ? await requestRecurringBookingAction(worker.slug, fd)
      : await requestBookingAction(worker.slug, fd);
    setSubmitting(false);

    if (res.ok) {
      setDone(true);
      toast("success", t("booking.success"), t("booking.successBody"));
      return;
    }
    if (res.error === "slot-taken") {
      // Another customer grabbed the slot — refresh server-side slots and
      // land the user back on the picker to re-choose. Never toast success
      // for a failed request.
      setConflict(true);
      setSlotId(null);
      setStep("slot");
      router.refresh();
      return;
    }
    toast("error", t("booking.conflict"));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? openDialog() : setOpen(false))}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        {done ? (
          <div className="flex flex-col items-center py-8 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="size-9 text-emerald-500" />
            </span>
            <h3 className="mt-5 text-xl font-black text-ink-900 dark:text-ink-50">{t("booking.success")}</h3>
            {isEmergency && (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2">
                <p className="text-sm font-bold text-red-700 dark:text-red-300">
                  🚨 {t("calling.emergency") || "Emergency"} — {t("calling.emergencyCallImmediate") || "Call Now — Emergency Mode"}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  {t("calling.emergencyCallDescription") || "Your masked number is ready. Call immediately."}
                </p>
              </div>
            )}
            <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-400">{t("booking.successBody")}</p>
            <Link href="/bookings" className="mt-6">
              <Button>
                {t("booking.viewBookings")}
                <ChevronRight className="size-4 rtl:rotate-180" />
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">{t("booking.dialogTitle")}</DialogTitle>
              <DialogDescription>{t("booking.dialogSubtitle")}</DialogDescription>
            </DialogHeader>

            {/* step progress */}
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => (
                <div key={s} className="flex flex-1 items-center gap-2">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black transition-colors",
                      i < stepIndex
                        ? "bg-emerald-500 text-white"
                        : i === stepIndex
                          ? "bg-brand-700 text-white"
                          : "bg-ink-100 text-ink-400 dark:bg-ink-800"
                    )}
                  >
                    {i < stepIndex ? <CheckCircle2 className="size-3.5" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-bold",
                      i === stepIndex ? "text-ink-900 dark:text-ink-50" : "text-ink-400"
                    )}
                  >
                    {s === "service" ? t("booking.stepService") : s === "slot" ? t("booking.stepSlot") : t("booking.stepDetails")}
                  </span>
                  {i < STEPS.length - 1 && <span className="h-px flex-1 bg-ink-100 dark:bg-ink-800" />}
                </div>
              ))}
            </div>

            {/* conflict banner */}
            {conflict && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{t("booking.slotTaken")}</p>
                  <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-300">{t("booking.slotTakenBody")}</p>
                </div>
              </div>
            )}

            {step === "service" && (
              <div className="space-y-4">
                <ServicePicker services={worker.services} currency={worker.currency} value={serviceName} onChange={pickService} />
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">{t("booking.jobTitle")}</label>
                  <Input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder={t("booking.jobTitlePlaceholder")}
                    aria-label={t("booking.jobTitle")}
                  />
                </div>
              </div>
            )}

            {step === "slot" && (
              <div className="max-h-72 overflow-y-auto pe-1">
                <SlotPicker slots={slots} value={slotId} onChange={setSlotId} workerName={workerName} />
              </div>
            )}

            {step === "details" && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">{t("booking.name")}</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("auth.name")} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">{t("booking.phone")}</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+966 5x xxx xxxx" dir="ltr" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">{t("booking.email")}</label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("auth.email")}
                    type="email"
                    dir="ltr"
                  />
                  <p className="mt-1 text-[11px] text-ink-400">{t("booking.emailHint")}</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">{t("booking.jobNote")}</label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("booking.jobNotePlaceholder")}
                    rows={3}
                  />
                </div>

                {/* M1 (§7 #1) — repeat cadence: off by default; a frequency turns
                    this request into a maintenance contract the worker accepts
                    once and future visits are auto-booked. */}
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">{t("booking.repeat")}</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {REPEAT_OPTIONS.map((opt) => (
                      <button
                        key={opt.labelKey}
                        type="button"
                        onClick={() => setFrequency(opt.value)}
                        className={cn(
                          "rounded-lg border px-2 py-1.5 text-xs font-bold transition-colors",
                          frequency === opt.value
                            ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                            : "border-ink-100 bg-white text-ink-500 hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300"
                        )}
                      >
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>
                  {frequency && <p className="mt-1 text-[11px] text-ink-400">{t("booking.repeatHint")}</p>}
                </div>

                {/* Emergency toggle — when enabled, masked calling is
                    enabled immediately after request submission instead of
                    waiting for the booking to reach inProgress. */}
                {worker.emergency && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setIsEmergency(!isEmergency)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                        isEmergency
                          ? "border-red-500/40 bg-red-500/10"
                          : "border-ink-100 bg-white hover:border-red-300 dark:border-ink-800 dark:bg-ink-900 dark:hover:border-red-700"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg text-lg",
                          isEmergency ? "bg-red-500/20" : "bg-ink-100 dark:bg-ink-800"
                        )}
                      >
                        🚨
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm font-bold", isEmergency ? "text-red-700 dark:text-red-300" : "text-ink-900 dark:text-ink-50")}>
                          {t("calling.emergency") || "Emergency"}
                        </p>
                        <p className="text-[11px] text-ink-400">
                          {t("calling.emergencyDescription") || "For urgent 24/7 services — masked calling is enabled immediately."}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "size-5 shrink-0 rounded-full border-2 transition-colors",
                          isEmergency
                            ? "border-red-500 bg-red-500"
                            : "border-ink-300 dark:border-ink-600"
                        )}
                      >
                        {isEmergency && (
                          <svg viewBox="0 0 12 12" className="size-full text-white p-0.5">
                            <path d="M4.5 9.5 1.5 6.5l1-1 2 2 5-5 1 1-6 6z" fill="currentColor" />
                          </svg>
                        )}
                      </span>
                    </button>
                    {isEmergency && (
                      <p className="mt-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
                        ⚡ {t("calling.emergencyCallDescription") || "Your masked number is ready. Call immediately — this is an emergency service request."}
                      </p>
                    )}
                  </div>
                )}

                {/* M5 — fee-waiver note on the summary step, so the perk copy at
                    checkout is the SAME line the booking row shows afterwards
                    (booking.feeWaivedNote) — the fee-waived filter → profile hint →
                    dialog story stays identical end to end. */}
                {isPlanFeeExempt(worker.subscription.plan) && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <p className="text-[11px] font-semibold leading-relaxed text-emerald-700 dark:text-emerald-400">
                      {t("booking.feeWaivedNote")}
                    </p>
                  </div>
                )}

                {/* M4 cancellation/refund policy — disclosed before the request is
                    sent so the customer commits with the refund rules in view
                    (docs/ENHANCEMENT-PLAN.md §2.4). The {hours} placeholder is
                    interpolated from the shared policy constant so the copy can
                    never drift from bookingCancelRefundDue. */}
                <div className="flex items-start gap-2.5 rounded-xl border border-ink-100 bg-ink-50 px-3 py-2.5 dark:border-ink-800 dark:bg-ink-800/50">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-500" />
                  <div>
                    <p className="text-xs font-black text-ink-900 dark:text-ink-50">{t("booking.cancelPolicyTitle")}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                      {t("booking.cancelPolicyBody").replace(/\{hours\}/g, String(BOOKING_CANCEL_REFUND_WINDOW_MS / 3_600_000))}
                    </p>
                  </div>
                </div>

                {/* §2.2 request SLA — disclosed before the request is sent so the
                    customer knows the request has a clock: auto-cancels (slot
                    freed) after BOOKING_SLA_EXPIRE_HOURS if unanswered, and they
                    get a notification either way. LIVE countdown: the expiry is
                    estimated from the selected slot's start (capped at the 48h
                    window) because no booking row exists yet — the post-submit
                    rows recompute from the real creation event. */}
                {selectedSlot && slaExpiryAt !== null &&
                  (() => {
                    const totalMin = Math.max(0, Math.ceil((slaExpiryAt - now) / 60_000));
                    const hours = Math.floor(totalMin / 60);
                    const minutes = totalMin % 60;
                    // Urgency bar — fraction of THIS request's window remaining
                    // (expiry − capture, at most the 48h policy). Starts full
                    // green at step entry and drains as time passes; a slot
                    // closer than 48h just has a shorter window, so the bar
                    // still starts full — same model as the worker dialog.
                    const windowMs = (slaExpiryAt - (slaCapturedAt ?? slaExpiryAt)) || 1;
                    const pct = Math.max(0, Math.min(100, ((slaExpiryAt - now) / windowMs) * 100));
                    const barColor = pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-red-500";
                    // Below 20% the bar pulses softly (animate-pulse-soft,
                    // opacity 1→0.55) so the red urgency state draws the eye
                    // without a modal — mirrors the worker dialog.
                    const urgent = pct <= 20;
                    return (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                        <div className="flex items-start gap-2.5">
                          <Hourglass className="mt-0.5 size-4 shrink-0 text-amber-500" />
                          <div>
                            <p className="text-xs font-black text-ink-900 dark:text-ink-50">{t("booking.slaDialogTitle")}</p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                              {hours >= 1
                                ? t("booking.slaDialogCountdown").replace("{hours}", String(hours)).replace("{minutes}", String(minutes))
                                : t("booking.slaDialogSoon").replace("{minutes}", String(minutes))}
                            </p>
                          </div>
                        </div>
                        <div
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(pct)}
                          aria-label={t("booking.slaDialogTitle")}
                          className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-ink-900/10 dark:bg-ink-100/10"
                        >
                          <div
                            className={cn(
                              "h-full rounded-full transition-[width] duration-700 ease-out",
                              barColor,
                              urgent && "animate-pulse-soft"
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
              </div>
            )}

            {/* footer nav */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={step === "service" ? () => setOpen(false) : back} disabled={submitting}>
                <ChevronLeft className="size-4 rtl:rotate-180" />
                {step === "service" ? t("common.cancel") : t("common.back")}
              </Button>

              {step === "details" ? (
                <Button onClick={submit} disabled={!canContinue || submitting}>
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {submitting ? t("booking.sending") : t("booking.send")}
                </Button>
              ) : (
                <Button onClick={next} disabled={!canContinue}>
                  {t("common.next")}
                  <ChevronRight className="size-4 rtl:rotate-180" />
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
