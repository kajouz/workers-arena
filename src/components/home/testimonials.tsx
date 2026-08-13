"use client";

import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { SectionHeading } from "@/components/shared/section-heading";
import { Rating } from "@/components/ui/rating";
import { GradientAvatar } from "@/components/ui/avatar";

const TESTIMONIALS = [
  {
    name: "Sara Al-Mansouri",
    role: "Homeowner · Riyadh",
    rating: 5,
    quoteEn:
      "I found a plumber in under a minute. He arrived the same day, fixed the leak, and the price matched the quote exactly. This is how hiring should work.",
    quoteAr:
      "وجدت سباكاً في أقل من دقيقة. وصل في نفس اليوم وأصلح التسريب وكان السعر مطابقاً للعرض تماماً. هكذا يجب أن يكون التعامل.",
  },
  {
    name: "James Carter",
    role: "Facility Manager · Dubai",
    rating: 5,
    quoteEn:
      "We manage 40+ apartments and WorkersArena is our go-to for technicians. Verified profiles save us hours of vetting every week.",
    quoteAr:
      "ندير أكثر من 40 شقة ووركرز أرينا هي خيارنا الأول للفنيين. الملفات الموثقة توفر لنا ساعات من التدقيق كل أسبوع.",
  },
  {
    name: "Layla Haddad",
    role: "Restaurant Owner · Amman",
    rating: 5,
    quoteEn:
      "The pest control pro we booked was brilliant — thorough, on time, and family-safe products. The review system actually works.",
    quoteAr:
      "فني مكافحة الحشرات الذي حجزناه كان رائعاً — دقيق وفي الموعد ومنتجات آمنة. نظام التقييم يعمل فعلاً.",
  },
];

export function Testimonials() {
  const { locale, t, dir } = useLocale();

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <SectionHeading eyebrow="★★★★★" title={t("testimonials.title")} subtitle={t("testimonials.subtitle")} dir={dir} />
      <div className="grid gap-6 md:grid-cols-3">
        {TESTIMONIALS.map((item, i) => (
          <motion.figure
            key={item.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: i * 0.1 }}
            className="relative flex flex-col rounded-3xl border border-ink-200/80 bg-white p-7 shadow-soft transition-shadow hover:shadow-lift dark:border-ink-800 dark:bg-ink-900"
          >
            <Quote className="absolute end-6 top-6 size-10 text-brand-500/15" />
            <Rating value={item.rating} />
            <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
              “{locale === "ar" ? item.quoteAr : item.quoteEn}”
            </blockquote>
            <figcaption className="mt-6 flex items-center gap-3 border-t border-ink-100 pt-5 dark:border-ink-800">
              <GradientAvatar name={item.name} hue={i * 90 + 20} />
              <div>
                <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{item.name}</p>
                <p className="text-xs text-ink-400">{item.role}</p>
              </div>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  );
}
