"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { useLocale } from "@/components/providers/locale-provider";
import { formatNumber } from "@/lib/utils";

function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const duration = 1400;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);

  return (
    <span ref={ref}>
      {formatNumber(display)}
      {suffix}
    </span>
  );
}

export function StatsBand() {
  const { locale, t } = useLocale();
  const stats = [
    { value: 2480, suffix: "+", label: t("stats.workers") },
    { value: 146, suffix: "+", label: t("stats.companies") },
    { value: 5, suffix: "", label: t("stats.cities") },
    { value: 98, suffix: "%", label: t("stats.satisfaction") },
  ];

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-orange-500 py-16 text-white">
      <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
      <div className="relative mx-auto grid max-w-5xl grid-cols-2 gap-8 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className="text-center"
          >
            <p className="text-4xl font-black tracking-tight sm:text-5xl">
              <CountUp value={s.value} suffix={s.suffix} />
            </p>
            <p className="mt-1.5 text-sm font-semibold text-white/80">{s.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
