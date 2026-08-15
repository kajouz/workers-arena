"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Loader2, Send, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/components/providers/locale-provider";
import { toast } from "@/components/ui/toast";
import { GradientAvatar } from "@/components/ui/avatar";
import { createQuoteRequestAction } from "@/app/actions/bookings";
import { cn } from "@/lib/utils";
import { MAX_QUOTE_WORKERS } from "@/lib/data/types";
import type { Worker } from "@/lib/data/types";

/**
 * Multi-candidate quotes (docs/multi-candidate-quotes.md §7) — the customer
 * posts ONE job and invites up to MAX_QUOTE_WORKERS workers to bid on it,
 * instead of committing to a single worker and restarting on a decline. The
 * picked workers' profile slugs go to createQuoteRequestAction; the job
 * appears on /bookings where the customer picks the winner + a slot.
 */
export function QuoteRequestDialog({
  candidates,
  children,
}: {
  /** The profile worker + related workers (the pickable pool, deduped). */
  candidates: Worker[];
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [jobTitle, setJobTitle] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const toggle = (slug: string) => {
    setPicked((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= MAX_QUOTE_WORKERS) return prev;
      return [...prev, slug];
    });
  };

  const openDialog = () => {
    setPicked([]);
    setJobTitle("");
    setName("");
    setPhone("");
    setEmail("");
    setNote("");
    setSubmitting(false);
    setDone(false);
    setOpen(true);
  };

  const canSubmit = picked.length > 0 && jobTitle.trim().length >= 3 && name.trim().length >= 2 && phone.trim().length >= 8;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.set("customerName", name.trim());
    fd.set("customerPhone", phone.trim());
    fd.set("customerEmail", email.trim());
    fd.set("jobTitle", jobTitle.trim());
    fd.set("note", note.trim());
    const res = await createQuoteRequestAction(picked, fd);
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
      toast("success", t("booking.quotesSent"), t("booking.quotesSentBody"));
      return;
    }
    toast("error", res.error === "too-many" ? t("booking.quotesMaxError").replace("{max}", String(MAX_QUOTE_WORKERS)) : t("booking.quotesError"));
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
            <h3 className="mt-5 text-xl font-black text-ink-900 dark:text-ink-50">{t("booking.quotesSent")}</h3>
            <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-400">{t("booking.quotesSentBody")}</p>
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
              <DialogTitle className="text-xl">{t("booking.quotesDialogTitle")}</DialogTitle>
              <DialogDescription>{t("booking.quotesDialogSubtitle")}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">
                  {t("booking.quotesPickWorkers")}
                  <span className="ms-1 text-ink-400">
                    · {t("booking.quotesPickedCount").replace("{count}", String(picked.length)).replace("{max}", String(MAX_QUOTE_WORKERS))}
                  </span>
                </label>
                <p className="mb-2 text-[11px] text-ink-400">
                  {t("booking.quotesPickWorkersHint").replace("{max}", String(MAX_QUOTE_WORKERS))}
                </p>
                {candidates.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-400 dark:border-ink-700">
                    {t("booking.quotesNoCandidates")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {candidates.map((w) => {
                      const selected = picked.includes(w.slug);
                      const locked = !selected && picked.length >= MAX_QUOTE_WORKERS;
                      return (
                        <button
                          key={w.slug}
                          type="button"
                          onClick={() => toggle(w.slug)}
                          disabled={locked}
                          aria-pressed={selected}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors disabled:opacity-40",
                            selected
                              ? "border-brand-500 bg-brand-500/10"
                              : "border-ink-100 bg-white hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900"
                          )}
                        >
                          <GradientAvatar name={w.nameEn} className="size-9" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black text-ink-900 dark:text-ink-50">{w.nameEn}</span>
                            <span className="block truncate text-xs text-ink-400">{w.taglineEn}</span>
                          </span>
                          {selected && <CheckCircle2 className="size-4 shrink-0 text-brand-500" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">{t("booking.jobTitle")}</label>
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder={t("booking.jobTitlePlaceholder")} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">{t("booking.name")}</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("auth.name")} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">{t("booking.phone")}</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+966 5x xxx xxxx" dir="ltr" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">{t("booking.email")}</label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth.email")} type="email" dir="ltr" />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">{t("booking.jobNote")}</label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("booking.jobNotePlaceholder")} rows={3} />
              </div>
            </div>

            <Button onClick={submit} disabled={!canSubmit || submitting} size="lg" className="w-full">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
              {submitting ? t("booking.quotesSending") : t("booking.quotesSend")}
            </Button>
            {picked.length >= MAX_QUOTE_WORKERS && (
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                <Send className="size-3" />
                {t("booking.quotesMaxReached").replace("{max}", String(MAX_QUOTE_WORKERS))}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
