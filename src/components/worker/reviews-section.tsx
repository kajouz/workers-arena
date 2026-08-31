"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BadgeCheck, Send, Star } from "lucide-react";
import type { Worker } from "@/lib/data/types";
import { useLocale } from "@/components/providers/locale-provider";
import { Rating, StarInput } from "@/components/ui/rating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { GradientAvatar } from "@/components/ui/avatar";
import { formatNumber, timeAgo } from "@/lib/utils";
import { submitReviewAction } from "@/app/actions/auth";
import { enqueueAction } from "@/lib/offline-queue";
import { toast } from "@/components/ui/toast";

const reviewSchema = z.object({
  name: z.string().min(2),
  text: z.string().min(8),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

export function ReviewsSection({ worker, onReview }: { worker: Worker; onReview?: () => void }) {
  const { locale, t } = useLocale();
  const [rating, setRating] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReviewFormValues>({ resolver: zodResolver(reviewSchema) });

  const distribution = [5, 4, 3, 2, 1].map((star) => {
    const count = worker.reviews.filter((r) => Math.round(r.rating) === star).length;
    const total = Math.max(worker.reviews.length, 1);
    return { star, count, pct: (count / total) * 100 };
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    // Offline → queue for background replay; online → direct server action.
    if (!navigator.onLine) {
      await enqueueAction({
        type: "review",
        payload: {
          workerId: worker.id,
          author: values.name,
          rating,
          text: values.text,
        },
      });
      setSubmitting(false);
      toast("info", t("worker.reviewQueued") || (locale === "ar" ? "تم إضافة التقييم إلى قائمة الانتظار — سيُرسل عند عودة الاتصال." : "Review queued — will submit when you're back online."));
      return;
    }
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("text", values.text);
    formData.set("rating", String(rating));
    const res = await submitReviewAction(worker.id, formData);
    setSubmitting(false);
    if (res.ok) {
      toast("success", t("worker.thankYou"));
      reset();
      setRating(5);
      onReview?.();
    }
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* summary */}
      <Card className="p-6 lg:sticky lg:top-24 lg:self-start">
        <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50">{t("worker.reviews")}</h2>
        <div className="mt-4 flex items-center gap-4">
          <p className="text-5xl font-black text-ink-900 dark:text-ink-50">{worker.rating.toFixed(1)}</p>
          <div>
            <Rating value={worker.rating} size={16} />
            <p className="mt-1 text-xs text-ink-400">
              {formatNumber(worker.reviewCount)} {t("common.reviews")}
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-1.5">
          {distribution.map((d) => (
            <div key={d.star} className="flex items-center gap-2 text-xs">
              <span className="flex w-8 items-center gap-0.5 font-semibold text-ink-500 dark:text-ink-400">
                {d.star} <Star className="size-3 fill-amber-400 text-amber-400" />
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-brand-500 transition-all duration-700"
                  style={{ width: `${d.pct}%` }}
                />
              </div>
              <span className="w-8 text-end text-ink-400">{d.count}</span>
            </div>
          ))}
        </div>

        {/* review form */}
        <div className="mt-6 rounded-2xl border border-brand-500/25 bg-brand-500/5 p-4">
          <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{t("worker.writeReview")}</p>
          <form onSubmit={onSubmit} className="mt-3 space-y-3">
            <StarInput value={rating} onChange={setRating} />
            <Input placeholder={t("worker.yourName")} {...register("name")} aria-label={t("worker.yourName")} />
            {errors.name && <p className="text-xs text-red-500">{t("auth.required")}</p>}
            <Textarea placeholder={t("worker.reviewPlaceholder")} rows={3} {...register("text")} aria-label={t("worker.reviewTitle")} />
            {errors.text && <p className="text-xs text-red-500">{t("auth.required")}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              <Send className="size-4" />
              {t("common.submit")}
            </Button>
          </form>
        </div>
      </Card>

      {/* list */}
      <div className="space-y-4 lg:col-span-2">
        {worker.reviews.length === 0 && (
          <Card className="p-10 text-center text-sm text-ink-400">{t("dashboard.noReviews")}</Card>
        )}
        {worker.reviews.map((r) => (
          <Card key={r.id} className="p-5 transition-shadow hover:shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <GradientAvatar name={r.author} />
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900 dark:text-ink-50">
                    {r.author}
                    {r.verifiedPurchase && (
                      <BadgeCheck className="size-3.5 text-emerald-500" />
                    )}
                  </p>
                  <p className="text-xs text-ink-400">{timeAgo(r.date, locale)}</p>
                </div>
              </div>
              <Rating value={r.rating} size={12} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
              {locale === "ar" ? r.textAr : r.textEn}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
