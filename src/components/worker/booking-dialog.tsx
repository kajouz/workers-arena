"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/components/providers/locale-provider";
import { toast } from "@/components/ui/toast";
import { ServicePicker } from "./service-picker";
import { SlotPicker } from "./slot-picker";
import { requestBookingAction } from "@/app/actions/bookings";
import { cn } from "@/lib/utils";
import { isPlanFeeExempt } from "@/lib/data/booking-ui";
import { BOOKING_CANCEL_REFUND_WINDOW_MS } from "@/lib/data/types";
import type { BookingSlot, Worker } from "@/lib/data/types";

type Step = "service" | "slot" | "details";

const STEPS: Step[] = ["service", "slot", "details"];

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
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [done, setDone] = useState(false);

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
    setConflict(false);
    setDone(false);
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

    const res = await requestBookingAction(worker.slug, fd);
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
                          ? "bg-brand-500 text-white"
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
