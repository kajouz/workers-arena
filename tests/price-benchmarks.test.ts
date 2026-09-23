import { describe, expect, it } from "vitest";
import {
  BENCHMARK_MIN_SAMPLE,
  BENCHMARK_ROUND_TO_MINOR,
  benchmarkFor,
  computePriceBenchmarks,
  percentile,
  priceStanding,
} from "../src/lib/data/price-benchmarks";

const jobs = (categorySlug: string, quotes: number[]) => quotes.map((quoteMinor) => ({ categorySlug, quoteMinor }));

describe("percentile — interpolation, not a lucky sample", () => {
  it("returns the endpoints, the middle, and the interpolated middles", () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(percentile(sorted, 0)).toBe(10);
    expect(percentile(sorted, 1)).toBe(50);
    expect(percentile(sorted, 0.5)).toBe(30);
    expect(percentile(sorted, 0.25)).toBe(20);
    expect(percentile(sorted, 0.75)).toBe(40);
    // With an even count the quartile falls between two samples.
    expect(percentile([10, 20, 30, 40], 0.25)).toBe(17.5);
  });

  it("handles degenerate inputs without inventing a number", () => {
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([42], 0.9)).toBe(42);
    expect(percentile([10, 20], -1)).toBe(10);
    expect(percentile([10, 20], 5)).toBe(20);
  });
});

describe("computePriceBenchmarks — the band a customer is shown", () => {
  it("builds a rounded interquartile band with the median inside it", () => {
    // 10 plumbing jobs, $100 … $550, one of them an outlier at $2,000.
    const rows = jobs("plumbing", [10_000, 12_000, 14_000, 16_000, 18_000, 20_000, 22_000, 26_000, 30_000, 200_000]);
    const [benchmark] = computePriceBenchmarks(rows);
    expect(benchmark).toMatchObject({ categorySlug: "plumbing", sampleSize: 10 });
    // p25 = 14,500 → $145 · p50 = 19,000 → $190 · p75 = 25,000 → $250.
    expect(benchmark!.lowMinor).toBe(14_500);
    expect(benchmark!.medianMinor).toBe(19_000);
    expect(benchmark!.highMinor).toBe(25_000);
    // The $2,000 outlier moves none of them — that is why the band is quartiles.
    expect(benchmark!.highMinor).toBeLessThan(50_000);
  });

  it("reports NOTHING below the sample floor — a benchmark from 4 jobs is not a benchmark", () => {
    expect(computePriceBenchmarks(jobs("plumbing", [10_000, 12_000, 14_000, 16_000]))).toEqual([]);
    expect(BENCHMARK_MIN_SAMPLE).toBe(5);
    // …and reports the moment the fifth job lands.
    const five = computePriceBenchmarks(jobs("plumbing", [10_000, 12_000, 14_000, 16_000, 18_000]));
    expect(five).toHaveLength(1);
  });

  it("ignores quote-less accepts and junk instead of dragging the band to zero", () => {
    const rows = [
      ...jobs("plumbing", [10_000, 12_000, 14_000, 16_000, 18_000]),
      { categorySlug: "plumbing", quoteMinor: 0 },
      { categorySlug: "plumbing", quoteMinor: Number.NaN },
      { categorySlug: "plumbing", quoteMinor: -500 },
      { categorySlug: "", quoteMinor: 9_999 },
    ];
    const [benchmark] = computePriceBenchmarks(rows);
    expect(benchmark!.sampleSize).toBe(5);
    expect(benchmark!.lowMinor).toBeGreaterThan(0);
  });

  it("rounds to a human step so the band reads as an observation, not a quote", () => {
    const [benchmark] = computePriceBenchmarks(jobs("electrical", [13_742, 20_000, 21_500, 24_319, 30_000]));
    for (const value of [benchmark!.lowMinor, benchmark!.medianMinor, benchmark!.highMinor]) {
      expect(value % BENCHMARK_ROUND_TO_MINOR).toBe(0);
    }
  });

  it("keeps low ≤ median ≤ high even when rounding would separate them", () => {
    // Five nearly identical tiny jobs: every percentile rounds to one step, and
    // the ordering must hold rather than invert.
    const [benchmark] = computePriceBenchmarks(jobs("odd-jobs", [100, 110, 120, 130, 140]));
    expect(benchmark!.lowMinor).toBeLessThanOrEqual(benchmark!.medianMinor);
    expect(benchmark!.medianMinor).toBeLessThanOrEqual(benchmark!.highMinor);
  });

  it("keeps each trade's band to that trade, sorted by slug", () => {
    const rows = [...jobs("plumbing", [10_000, 12_000, 14_000, 16_000, 18_000]), ...jobs("electrical", [40_000, 42_000, 44_000, 46_000, 48_000])];
    const benchmarks = computePriceBenchmarks(rows);
    expect(benchmarks.map((b) => b.categorySlug)).toEqual(["electrical", "plumbing"]);
    expect(benchmarkFor(benchmarks, "electrical")!.lowMinor).toBe(42_000);
    expect(benchmarkFor(benchmarks, "plumbing")!.highMinor).toBe(16_000);
  });
});

describe("priceStanding — where a specific price lands", () => {
  const benchmark = { categorySlug: "plumbing", sampleSize: 10, lowMinor: 14_500, medianMinor: 19_000, highMinor: 27_000 };

  it("says below, within, or above — including at the boundaries", () => {
    expect(priceStanding(10_000, benchmark)).toBe("below");
    expect(priceStanding(14_500, benchmark)).toBe("within");
    expect(priceStanding(19_000, benchmark)).toBe("within");
    expect(priceStanding(27_000, benchmark)).toBe("within");
    expect(priceStanding(40_000, benchmark)).toBe("above");
  });

  it("states nothing when there is no benchmark or no price to judge", () => {
    expect(priceStanding(19_000, null)).toBeNull();
    expect(priceStanding(0, benchmark)).toBeNull();
    expect(benchmarkFor([benchmark], null)).toBeNull();
    expect(benchmarkFor([benchmark], "carpentry")).toBeNull();
  });
});
