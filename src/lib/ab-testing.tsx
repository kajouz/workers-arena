/**
 * A/B Testing Framework for WorkersArena
 * 
 * Features:
 * - Experiment creation and management
 * - User assignment with consistent hashing
 * - Variant tracking and conversion metrics
 * - Statistical significance calculation
 * 
 * Usage:
 * 1. Define experiments in AB_EXPERIMENTS
 * 2. Use useABTest() hook in components
 * 3. Track conversions with trackConversion()
 */

export type ExperimentStatus = "draft" | "running" | "paused" | "completed";

export interface ExperimentVariant {
  id: string;
  name: string;
  /** Weight for traffic allocation (default: equal distribution) */
  weight: number;
  /** Configuration for this variant */
  config: Record<string, unknown>;
}

export interface Experiment {
  id: string;
  name: string;
  description: string;
  status: ExperimentStatus;
  /** When the experiment started (ISO) */
  startedAt?: string;
  /** When the experiment ended (ISO) */
  endedAt?: string;
  /** Traffic allocation percentage (0-100) */
  trafficAllocation: number;
  variants: ExperimentVariant[];
  /** Primary metric to track */
  primaryMetric: string;
  /** Target conversion rate improvement (percentage) */
  targetImprovement?: number;
}

export interface ExperimentResult {
  experimentId: string;
  variant: string;
  impressions: number;
  conversions: number;
  conversionRate: number;
  /** Statistical significance (0-1) */
  significance: number;
  /** Confidence interval for conversion rate */
  confidenceInterval: [number, number];
  /** Is this variant the winner? */
  isWinner: boolean;
}

export interface UserAssignment {
  experimentId: string;
  variantId: string;
  assignedAt: string;
}

// In-memory storage (replace with database in production)
const assignments = new Map<string, UserAssignment>();
const metrics = new Map<string, { impressions: number; conversions: number }>();

/**
 * Pre-defined experiments for WorkersArena
 */
export const AB_EXPERIMENTS: Record<string, Experiment> = {
  "search-results-layout": {
    id: "search-results-layout",
    name: "Search Results Layout",
    description: "Test grid vs list layout for search results",
    status: "running",
    startedAt: "2025-01-15T00:00:00Z",
    trafficAllocation: 100,
    primaryMetric: "search_to_booking_rate",
    variants: [
      {
        id: "grid",
        name: "Grid Layout",
        weight: 50,
        config: { layout: "grid", columns: 2 },
      },
      {
        id: "list",
        name: "List Layout",
        weight: 50,
        config: { layout: "list", columns: 1 },
      },
    ],
  },
  "worker-card-cta": {
    id: "worker-card-cta",
    name: "Worker Card CTA Button",
    description: "Test different call-to-action text on worker cards",
    status: "running",
    startedAt: "2025-01-10T00:00:00Z",
    trafficAllocation: 100,
    primaryMetric: "profile_view_rate",
    variants: [
      {
        id: "view-profile",
        name: "View Profile",
        weight: 34,
        config: { ctaText: "View Profile", ctaColor: "blue" },
      },
      {
        id: "contact-now",
        name: "Contact Now",
        weight: 33,
        config: { ctaText: "Contact Now", ctaColor: "green" },
      },
      {
        id: "get-quote",
        name: "Get Quote",
        weight: 33,
        config: { ctaText: "Get Quote", ctaColor: "purple" },
      },
    ],
  },
  "pricing-display": {
    id: "pricing-display",
    name: "Pricing Display Format",
    description: "Test price range vs starting price display",
    status: "running",
    startedAt: "2025-01-12T00:00:00Z",
    trafficAllocation: 50,
    primaryMetric: "booking_initiation_rate",
    variants: [
      {
        id: "range",
        name: "Price Range",
        weight: 50,
        config: { display: "range", format: "$min - $max" },
      },
      {
        id: "starting",
        name: "Starting Price",
        weight: 50,
        config: { display: "starting", format: "From $min" },
      },
    ],
  },
  "search-filters": {
    id: "search-filters",
    name: "Search Filters Position",
    description: "Test sidebar vs top filters for search page",
    status: "draft",
    trafficAllocation: 100,
    primaryMetric: "filter_usage_rate",
    variants: [
      {
        id: "sidebar",
        name: "Sidebar Filters",
        weight: 50,
        config: { position: "sidebar" },
      },
      {
        id: "top",
        name: "Top Filters",
        weight: 50,
        config: { position: "top" },
      },
    ],
  },
  "booking-flow-steps": {
    id: "booking-flow-steps",
    name: "Booking Flow Steps",
    description: "Test 2-step vs 3-step booking process",
    status: "running",
    startedAt: "2025-01-08T00:00:00Z",
    trafficAllocation: 100,
    primaryMetric: "booking_completion_rate",
    variants: [
      {
        id: "2-step",
        name: "2-Step Flow",
        weight: 50,
        config: { steps: 2, combined: "details+payment" },
      },
      {
        id: "3-step",
        name: "3-Step Flow",
        weight: 50,
        config: { steps: 3, steps_list: ["details", "payment", "confirm"] },
      },
    ],
  },
};

/**
 * Generate a consistent hash for user assignment
 * Uses a simple hash function (replace with murmurhash in production)
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Assign a user to a variant consistently
 */
export function assignVariant(
  experimentId: string,
  userId: string
): string | null {
  const experiment = AB_EXPERIMENTS[experimentId];
  if (!experiment || experiment.status !== "running") {
    return null;
  }

  // Check if already assigned
  const key = `${experimentId}:${userId}`;
  const existing = assignments.get(key);
  if (existing) {
    return existing.variantId;
  }

  // Check traffic allocation
  const userHash = hashString(userId);
  if (userHash % 100 >= experiment.trafficAllocation) {
    return null; // User not in experiment
  }

  // Assign to variant based on weight
  const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
  let cumulative = 0;
  const variantHash = hashString(`${experimentId}:${userId}`);

  for (const variant of experiment.variants) {
    cumulative += variant.weight;
    if (variantHash % totalWeight < cumulative) {
      // Store assignment
      assignments.set(key, {
        experimentId,
        variantId: variant.id,
        assignedAt: new Date().toISOString(),
      });

      // Track impression
      trackImpression(experimentId, variant.id);

      return variant.id;
    }
  }

  // Fallback to first variant
  const fallback = experiment.variants[0];
  assignments.set(key, {
    experimentId,
    variantId: fallback.id,
    assignedAt: new Date().toISOString(),
  });
  trackImpression(experimentId, fallback.id);
  return fallback.id;
}

/**
 * Get variant configuration
 */
export function getVariantConfig<T extends Record<string, unknown>>(
  experimentId: string,
  variantId: string
): T | null {
  const experiment = AB_EXPERIMENTS[experimentId];
  if (!experiment) return null;

  const variant = experiment.variants.find((v) => v.id === variantId);
  if (!variant) return null;

  return variant.config as T;
}

/**
 * Track an impression
 */
function trackImpression(experimentId: string, variantId: string): void {
  const key = `${experimentId}:${variantId}`;
  const current = metrics.get(key) || { impressions: 0, conversions: 0 };
  metrics.set(key, {
    ...current,
    impressions: current.impressions + 1,
  });
}

/**
 * Track a conversion event
 */
export function trackConversion(
  experimentId: string,
  variantId: string,
  value?: number
): void {
  const key = `${experimentId}:${variantId}`;
  const current = metrics.get(key) || { impressions: 0, conversions: 0 };
  metrics.set(key, {
    ...current,
    conversions: current.conversions + 1,
  });

  // In production, send to analytics
  console.log(`[AB Test] Conversion tracked: ${experimentId}/${variantId}`, value);
}

/**
 * Calculate experiment results
 */
export function getExperimentResults(experimentId: string): ExperimentResult[] {
  const experiment = AB_EXPERIMENTS[experimentId];
  if (!experiment) return [];

  const results: ExperimentResult[] = [];
  let maxConversionRate = 0;
  let winnerId = "";

  for (const variant of experiment.variants) {
    const key = `${experimentId}:${variant.id}`;
    const data = metrics.get(key) || { impressions: 0, conversions: 0 };

    const conversionRate = data.impressions > 0
      ? (data.conversions / data.impressions) * 100
      : 0;

    // Simple statistical significance (replace with proper calculation in production)
    const significance = calculateSignificance(
      data.conversions,
      data.impressions - data.conversions
    );

    // Confidence interval (95%)
    const ci = calculateConfidenceInterval(
      conversionRate,
      data.impressions
    );

    if (conversionRate > maxConversionRate) {
      maxConversionRate = conversionRate;
      winnerId = variant.id;
    }

    results.push({
      experimentId,
      variant: variant.id,
      impressions: data.impressions,
      conversions: data.conversions,
      conversionRate,
      significance,
      confidenceInterval: ci,
      isWinner: false,
    });
  }

  // Mark winner
  const winner = results.find((r) => r.variant === winnerId);
  if (winner) {
    winner.isWinner = true;
  }

  return results;
}

/**
 * Calculate statistical significance (simplified)
 */
function calculateSignificance(successes: number, failures: number): number {
  const total = successes + failures;
  if (total < 100) return 0; // Need minimum sample size

  // Z-test for proportions (simplified)
  const p = successes / total;
  const se = Math.sqrt((p * (1 - p)) / total);
  const z = p / se; // Simplified z-score

  // Convert z-score to p-value (approximation)
  return Math.min(1, Math.abs(z) / 3);
}

/**
 * Calculate 95% confidence interval
 */
function calculateConfidenceInterval(
  rate: number,
  sampleSize: number
): [number, number] {
  if (sampleSize === 0) return [0, 0];

  const z = 1.96; // 95% confidence
  const se = Math.sqrt((rate * (100 - rate)) / sampleSize);

  return [
    Math.max(0, rate - z * se),
    Math.min(100, rate + z * se),
  ];
}

/**
 * React hook for A/B testing
 */
export function useABTest(experimentId: string, userId: string) {
  const variantId = assignVariant(experimentId, userId);
  const experiment = AB_EXPERIMENTS[experimentId];

  if (!variantId || !experiment) {
    return {
      variant: null,
      config: null,
      isActive: false,
    };
  }

  const config = getVariantConfig(experimentId, variantId);

  return {
    variant: variantId,
    config,
    isActive: true,
    trackConversion: (value?: number) => trackConversion(experimentId, variantId, value),
  };
}

/**
 * A/B Test Provider component
 */
export function ABTestProvider({ children }: { children: React.ReactNode }) {
  // Initialize experiments on mount
  // In production, fetch running experiments from API
  return <>{children}</>;
}
