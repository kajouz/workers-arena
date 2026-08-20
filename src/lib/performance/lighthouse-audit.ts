/**
 * Lighthouse Performance Audit
 * Client-side performance checks and Core Web Vitals monitoring.
 */

/* ─── Types ─── */
export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  target: number;
  rating: "good" | "needs-improvement" | "poor";
  description: string;
}

export interface AuditResult {
  score: number;
  metrics: PerformanceMetric[];
  recommendations: string[];
  timestamp: string;
}

/* ─── Core Web Vitals Targets (Google) ─── */
const VITALS_TARGETS = {
  LCP: { good: 2500, poor: 4000, unit: "ms", description: "Largest Contentful Paint" },
  FID: { good: 100, poor: 300, unit: "ms", description: "First Input Delay" },
  CLS: { good: 0.1, poor: 0.25, unit: "", description: "Cumulative Layout Shift" },
  INP: { good: 200, poor: 500, unit: "ms", description: "Interaction to Next Paint" },
  TTFB: { good: 800, poor: 1800, unit: "ms", description: "Time to First Byte" },
  FCP: { good: 1800, poor: 3000, unit: "ms", description: "First Contentful Paint" },
};

function rateMetric(name: string, value: number): "good" | "needs-improvement" | "poor" {
  const target = VITALS_TARGETS[name as keyof typeof VITALS_TARGETS];
  if (!target) return "good";
  if (value <= target.good) return "good";
  if (value <= target.poor) return "needs-improvement";
  return "poor";
}

/* ─── Collect Metrics ─── */
export function collectMetrics(): PerformanceMetric[] {
  if (typeof window === "undefined") return [];

  const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  const nav = entries[0];

  const metrics: PerformanceMetric[] = [];

  // TTFB
  if (nav) {
    const ttfb = nav.responseStart - nav.requestStart;
    metrics.push({
      name: "TTFB",
      value: Math.round(ttfb),
      unit: "ms",
      target: 800,
      rating: rateMetric("TTFB", ttfb),
      description: VITALS_TARGETS.TTFB.description,
    });
  }

  // FCP from paint entries
  const paints = performance.getEntriesByType("paint") as PerformancePaintTiming[];
  const fcp = paints.find((p) => p.name === "first-contentful-paint");
  if (fcp) {
    metrics.push({
      name: "FCP",
      value: Math.round(fcp.startTime),
      unit: "ms",
      target: 1800,
      rating: rateMetric("FCP", fcp.startTime),
      description: VITALS_TARGETS.FCP.description,
    });
  }

  // LCP from LargestContentfulPaint
  const lcpEntry = performance.getEntriesByType("largest-contentful-paint")[0] as any;
  if (lcpEntry) {
    metrics.push({
      name: "LCP",
      value: Math.round(lcpEntry.startTime),
      unit: "ms",
      target: 2500,
      rating: rateMetric("LCP", lcpEntry.startTime),
      description: VITALS_TARGETS.LCP.description,
    });
  }

  // CLS from LayoutShift
  let cls = 0;
  const layoutShifts = performance.getEntriesByType("layout-shift") as any[];
  for (const entry of layoutShifts) {
    if (!entry.hadRecentInput) {
      cls += entry.value;
    }
  }
  if (layoutShifts.length > 0) {
    metrics.push({
      name: "CLS",
      value: Math.round(cls * 1000) / 1000,
      unit: "",
      target: 0.1,
      rating: rateMetric("CLS", cls),
      description: VITALS_TARGETS.CLS.description,
    });
  }

  return metrics;
}

/* ─── Generate Recommendations ─── */
export function generateRecommendations(metrics: PerformanceMetric[]): string[] {
  const recs: string[] = [];
  const metricMap = Object.fromEntries(metrics.map((m) => [m.name, m]));

  if (metricMap.LCP && metricMap.LCP.rating !== "good") {
    recs.push("Improve LCP: Use next/image for above-the-fold images, add preload hints, reduce server response time.");
  }
  if (metricMap.FCP && metricMap.FCP.rating !== "good") {
    recs.push("Improve FCP: Inline critical CSS, eliminate render-blocking resources, use font-display: swap.");
  }
  if (metricMap.CLS && metricMap.CLS.rating !== "good") {
    recs.push("Improve CLS: Set explicit width/height on images, avoid injecting content above the fold, use CSS contain.");
  }
  if (metricMap.TTFB && metricMap.TTFB.rating !== "good") {
    recs.push("Improve TTFB: Use a CDN, implement server-side caching, optimize database queries.");
  }

  // General best practices
  recs.push("Enable text compression (gzip/brotli) for all text assets.");
  recs.push("Use resource hints: preconnect to critical origins, preload key resources.");
  recs.push("Implement proper caching headers for static assets.");
  recs.push("Use lazy loading for images and non-critical components.");

  return recs;
}

/* ─── Calculate Score ─── */
export function calculateScore(metrics: PerformanceMetric[]): number {
  if (metrics.length === 0) return 0;

  const weights: Record<string, number> = {
    LCP: 0.25,
    FID: 0.25,
    CLS: 0.25,
    INP: 0.15,
    TTFB: 0.05,
    FCP: 0.05,
  };

  let totalWeight = 0;
  let weightedSum = 0;

  for (const m of metrics) {
    const weight = weights[m.name] ?? 0.1;
    const score = m.rating === "good" ? 100 : m.rating === "needs-improvement" ? 50 : 0;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  return Math.round(totalWeight > 0 ? weightedSum / totalWeight : 0);
}

/* ─── Full Audit ─── */
export function runAudit(): AuditResult {
  const metrics = collectMetrics();
  const score = calculateScore(metrics);
  const recommendations = generateRecommendations(metrics);

  return {
    score,
    metrics,
    recommendations,
    timestamp: new Date().toISOString(),
  };
}

/* ─── Performance Observer Setup ─── */
export function observeVitals(callback: (metric: PerformanceMetric) => void): () => void {
  const observers: PerformanceObserver[] = [];

  // LCP
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as any;
      if (last) {
        callback({
          name: "LCP",
          value: Math.round(last.startTime),
          unit: "ms",
          target: 2500,
          rating: rateMetric("LCP", last.startTime),
          description: "Largest Contentful Paint",
        });
      }
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    observers.push(lcpObserver);
  } catch {}

  // CLS
  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
          callback({
            name: "CLS",
            value: Math.round(clsValue * 1000) / 1000,
            unit: "",
            target: 0.1,
            rating: rateMetric("CLS", clsValue),
            description: "Cumulative Layout Shift",
          });
        }
      }
    });
    clsObserver.observe({ type: "layout-shift", buffered: true });
    observers.push(clsObserver);
  } catch {}

  // INP
  try {
    const inpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as any;
      if (last) {
        const inp = last.duration;
        callback({
          name: "INP",
          value: Math.round(inp),
          unit: "ms",
          target: 200,
          rating: rateMetric("INP", inp),
          description: "Interaction to Next Paint",
        });
      }
    });
    inpObserver.observe({ type: "event", buffered: true });
    observers.push(inpObserver);
  } catch {}

  return () => {
    for (const obs of observers) {
      obs.disconnect();
    }
  };
}
