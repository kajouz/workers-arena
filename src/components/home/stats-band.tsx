"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { useLocale } from "@/components/providers/locale-provider";
import { formatNumber } from "@/lib/utils";

/**
 * The band's number. It renders the REAL value — server HTML, no-JS and any
 * screenshot show the true figure, never a zeroed counter (that was the bug: the
 * old version always started at 0 and only reached the value if the count-up
 * animation ran, so the band read "0+ / 0+ / 0 / 0%" wherever the animation
 * could not fire). The count-up is now purely additive and happens OFF-SCREEN:
 * the observer pre-triggers 200px below the fold, so the value only drops to 0
 * where nobody can see it, and the counter is already climbing by the time the
 * band scrolls into view. A band that is on screen at mount — or a
 * `prefers-reduced-motion` user — keeps the plain value.
 */
function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px 200px 0px" });
  const [display, setDisplay] = useState(value);
  const [countUp, setCountUp] = useState(false);

  // Decide once, after mount, whether this number may animate. An already
  // visible one must not (the first paint would flicker value → 0 → value), and
  // neither must a reduced-motion user's. Nothing is reset here: while the band
  // is off-screen the DOM keeps the true value.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const onScreen = rect.bottom > 0 && rect.top < (window.innerHeight || 0);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (onScreen || reduced) return;
    setCountUp(true);
  }, []);

  useEffect(() => {
    if (!countUp || !inView) return;
    const duration = 1400;
    let start: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      // The clock starts on the first frame, so the count begins at a true 0 —
      // and because inView pre-triggers ~200px below the viewport, that 0 is
      // still off-screen.
      if (start === null) start = now;
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [countUp, inView, value]);

  return (
    <span ref={ref}>
      {formatNumber(display)}
      {suffix}
    </span>
  );
}

/**
 * The homepage trust band. The social-proof figures stay aspirational (the
 * hero's "trusted by 50,000+" sets that voice), but COVERAGE is passed in from
 * the server and derived from the country registry — the band used to claim "5
 * cities", a leftover from the pre-Lebanon multi-country dataset, while the
 * deployment serves exactly one configured city.
 */
export function StatsBand({ citiesServed }: { citiesServed: number }) {
  const { locale, t } = useLocale();
  const stats = [
    { value: 2480, suffix: "+", label: t("stats.workers") },
    { value: 146, suffix: "+", label: t("stats.companies") },
    { value: citiesServed, suffix: "", label: citiesServed === 1 ? t("stats.citiesOne") : t("stats.cities") },
    { value: 98, suffix: "%", label: t("stats.satisfaction") },
  ];

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-orange-500 py-10 text-white sm:py-16">
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
