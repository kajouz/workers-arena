/**
 * ────────────────────────────────────────────────────────────────────────────
 * PRICE BENCHMARKS — "what does this normally cost around here?"
 * ────────────────────────────────────────────────────────────────────────────
 * The single biggest reason a customer abandons a services marketplace is that
 * they cannot tell whether the number in front of them is fair. Every worker
 * profile shows a price, and nothing on the page says whether $150 for a
 * kitchen pipe repair is routine or a gouge — so the customer closes the tab and
 * asks a neighbour instead.
 *
 * This module turns the jobs the platform has already priced into a range that
 * answers that question, per trade, from real accepted quotes.
 *
 * ── Why percentiles, and why they are rounded ───────────────────────────────
 * A mean is the wrong statistic here: one emergency call-out at 3× the going
 * rate moves it, and a "typical price" that only exists because of one
 * outlier is worse than no answer. So the range is the interquartile band
 * (p25 → p75) with the median in the middle — three numbers that describe the
 * middle half of the market and survive outliers.
 *
 * Those numbers are then rounded to a human step (`BENCHMARK_ROUND_TO_MINOR`).
 * Reporting "$137.42–$243.19" implies a precision the underlying data has never
 * had, and it reads like a quote rather than an observation. "$140–$240" reads
 * like what it is: what jobs like yours have cost lately.
 *
 * ── Why there is a floor ────────────────────────────────────────────────────
 * A range built from two jobs is not a benchmark, it is two jobs — and it is
 * trivially gameable by anyone who wants to move the displayed band. Below
 * `BENCHMARK_MIN_SAMPLE` samples a category reports **nothing**: the surface
 * then simply says nothing rather than something it cannot stand behind.
 *
 * Pure: same jobs in, same benchmarks out. The caller supplies the rows (both
 * adapters read them the same way), so the arithmetic has exactly one home.
 */

/** Below this many completed jobs, a category reports no benchmark at all. */
export const BENCHMARK_MIN_SAMPLE = 5;

/** Benchmarks are rounded to this step (minor units) — $5 reads as an observation. */
export const BENCHMARK_ROUND_TO_MINOR = 500;

/** The window a benchmark is built from. Old prices are not current prices. */
export const BENCHMARK_WINDOW_DAYS = 180;

/** One job as the arithmetic needs it. */
export interface BenchmarkJob {
  categorySlug: string;
  /** The accepted quote, minor units. */
  quoteMinor: number;
}

export interface PriceBenchmark {
  categorySlug: string;
  /** How many jobs the band is built from (always ≥ BENCHMARK_MIN_SAMPLE). */
  sampleSize: number;
  /** p25 — the bottom of the typical band. */
  lowMinor: number;
  /** p50 — the median job. */
  medianMinor: number;
  /** p75 — the top of the typical band. */
  highMinor: number;
}

const int = (v: number): number => (Number.isFinite(v) ? Math.max(Math.trunc(v), 0) : 0);

/** Round to the nearest step, so a band never implies cent-level precision. */
function roundTo(value: number, step = BENCHMARK_ROUND_TO_MINOR): number {
  if (step <= 0) return int(value);
  return Math.max(Math.round(value / step) * step, step);
}

/**
 * The percentile of an ASCENDING list, with linear interpolation between the
 * two neighbouring samples (`p` in 0..1). Interpolation matters: with 6 samples
 * a "nearest" p25 would jump a whole job between refreshes and make the band
 * flicker, while interpolation moves it smoothly.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const clamped = Math.min(Math.max(p, 0), 1);
  const position = clamped * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

/**
 * Benchmarks for every category with enough data. Categories below the floor
 * are **omitted entirely** — the caller must treat "absent" as "no answer",
 * never as zero.
 */
export function computePriceBenchmarks(jobs: BenchmarkJob[]): PriceBenchmark[] {
  const byCategory = new Map<string, number[]>();
  for (const job of jobs) {
    const self = job.categorySlug?.trim();
    const quote = int(job.quoteMinor);
    // A zero/unset quote is not a price observation — a quote-less accept would
    // otherwise drag every band toward zero.
    if (!self || quote <= 0) continue;
    const list = byCategory.get(self);
    if (list) list.push(quote);
    else byCategory.set(self, [quote]);
  }

  const out: PriceBenchmark[] = [];
  for (const [categorySlug, quotes] of byCategory) {
    if (quotes.length < BENCHMARK_MIN_SAMPLE) continue;
    const sorted = [...quotes].sort((a, b) => a - b);
    // Rounding is applied AFTER the percentiles, and the median is clamped into
    // the band so a rounding step can never invert low/median/high.
    const low = roundTo(percentile(sorted, 0.25));
    const high = Math.max(roundTo(percentile(sorted, 0.75)), low);
    const median = Math.min(Math.max(roundTo(percentile(sorted, 0.5)), low), high);
    out.push({ categorySlug, sampleSize: sorted.length, lowMinor: low, medianMinor: median, highMinor: high });
  }
  return out.sort((a, b) => a.categorySlug.localeCompare(b.categorySlug));
}

/** The benchmark for one trade, or null when there is not enough data to state one. */
export function benchmarkFor(
  benchmarks: readonly PriceBenchmark[],
  categorySlug: string | null | undefined
): PriceBenchmark | null {
  if (!categorySlug) return null;
  return benchmarks.find((b) => b.categorySlug === categorySlug) ?? null;
}

/**
 * Where a specific price sits against the band — the answer to "is this fair?".
 * Deliberately only three verdicts: it is not this module's job to moralise about
 * a price, just to say where it lands relative to the middle half of the market.
 */
export type PriceStanding = "below" | "within" | "above";

export function priceStanding(priceMinor: number, benchmark: PriceBenchmark | null): PriceStanding | null {
  if (!benchmark) return null;
  const price = int(priceMinor);
  if (price <= 0) return null;
  if (price < benchmark.lowMinor) return "below";
  if (price > benchmark.highMinor) return "above";
  return "within";
}
