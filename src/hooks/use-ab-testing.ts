"use client";

import { useEffect, useState, useCallback, useRef } from "react";

export interface ABVariant {
  id: string;
  name: string;
  weight: number; // Percentage weight (0-100)
  config: Record<string, any>; // Variant-specific configuration
}

export interface ABExperiment {
  id: string;
  name: string;
  description: string;
  variants: ABVariant[];
  startDate: string;
  endDate?: string;
  status: "active" | "paused" | "ended";
  metrics: {
    impressions: Record<string, number>;
    clicks: Record<string, number>;
    conversions: Record<string, number>;
  };
}

interface Assignment {
  experimentId: string;
  variantId: string;
  assignedAt: number;
}

const STORAGE_KEY = "wa_ab_assignments";
const EXPERIMENTS_KEY = "wa_experiments";

function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("wa_visitor_id");
  if (!id) {
    id = `v_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem("wa_visitor_id", id);
  }
  return id;
}

function getAssignments(): Assignment[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveAssignments(assignments: Assignment[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  } catch {
    // Storage full
  }
}

function getExperiments(): ABExperiment[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(EXPERIMENTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveExperiments(experiments: ABExperiment[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EXPERIMENTS_KEY, JSON.stringify(experiments));
  } catch {
    // Storage full
  }
}

/**
 * Deterministic hash-based assignment
 * Ensures same visitor always gets same variant
 */
function assignVariant(experiment: ABExperiment, visitorId: string): ABVariant {
  const hash = simpleHash(`${visitorId}:${experiment.id}`);
  const normalizedHash = (hash % 10000) / 100; // 0-100

  let cumulativeWeight = 0;
  for (const variant of experiment.variants) {
    cumulativeWeight += variant.weight;
    if (normalizedHash < cumulativeWeight) {
      return variant;
    }
  }

  // Fallback to first variant
  return experiment.variants[0];
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export function useABTesting() {
  const [experiments, setExperiments] = useState<ABExperiment[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const visitorId = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    visitorId.current = getVisitorId();
    setAssignments(getAssignments());
    setExperiments(getExperiments());
  }, []);

  /**
   * Register a new A/B experiment
   */
  const registerExperiment = useCallback((experiment: ABExperiment) => {
    setExperiments((prev) => {
      const exists = prev.find((e) => e.id === experiment.id);
      if (exists) return prev;
      const updated = [...prev, experiment];
      saveExperiments(updated);
      return updated;
    });
  }, []);

  /**
   * Get the assigned variant for an experiment
   */
  const getVariant = useCallback(
    (experimentId: string): ABVariant | null => {
      const experiment = experiments.find((e) => e.id === experimentId);
      if (!experiment || experiment.status !== "active") return null;

      // Check if already assigned
      const existing = assignments.find((a) => a.experimentId === experimentId);
      if (existing) {
        return experiment.variants.find((v) => v.id === existing.variantId) ?? null;
      }

      // New assignment
      if (!visitorId.current) return null;
      const variant = assignVariant(experiment, visitorId.current);

      const newAssignment: Assignment = {
        experimentId,
        variantId: variant.id,
        assignedAt: Date.now(),
      };

      const updatedAssignments = [...assignments, newAssignment];
      setAssignments(updatedAssignments);
      saveAssignments(updatedAssignments);

      return variant;
    },
    [experiments, assignments]
  );

  /**
   * Track an impression for a variant
   */
  const trackImpression = useCallback(
    (experimentId: string, variantId: string) => {
      setExperiments((prev) => {
        const updated = prev.map((e) => {
          if (e.id !== experimentId) return e;
          return {
            ...e,
            metrics: {
              ...e.metrics,
              impressions: {
                ...e.metrics.impressions,
                [variantId]: (e.metrics.impressions[variantId] ?? 0) + 1,
              },
            },
          };
        });
        saveExperiments(updated);
        return updated;
      });

      // Also send to server
      void fetch("/api/ab/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "impression",
          experimentId,
          variantId,
          visitorId: visitorId.current,
        }),
      }).catch(() => {});
    },
    []
  );

  /**
   * Track a click for a variant
   */
  const trackClick = useCallback(
    (experimentId: string, variantId: string) => {
      setExperiments((prev) => {
        const updated = prev.map((e) => {
          if (e.id !== experimentId) return e;
          return {
            ...e,
            metrics: {
              ...e.metrics,
              clicks: {
                ...e.metrics.clicks,
                [variantId]: (e.metrics.clicks[variantId] ?? 0) + 1,
              },
            },
          };
        });
        saveExperiments(updated);
        return updated;
      });

      // Also send to server
      void fetch("/api/ab/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "click",
          experimentId,
          variantId,
          visitorId: visitorId.current,
        }),
      }).catch(() => {});
    },
    []
  );

  /**
   * Track a conversion for a variant
   */
  const trackConversion = useCallback(
    (experimentId: string, variantId: string) => {
      setExperiments((prev) => {
        const updated = prev.map((e) => {
          if (e.id !== experimentId) return e;
          return {
            ...e,
            metrics: {
              ...e.metrics,
              conversions: {
                ...e.metrics.conversions,
                [variantId]: (e.metrics.conversions[variantId] ?? 0) + 1,
              },
            },
          };
        });
        saveExperiments(updated);
        return updated;
      });

      // Also send to server
      void fetch("/api/ab/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "conversion",
          experimentId,
          variantId,
          visitorId: visitorId.current,
        }),
      }).catch(() => {});
    },
    []
  );

  /**
   * Get experiment results/statistics
   */
  const getExperimentResults = useCallback(
    (experimentId: string) => {
      const experiment = experiments.find((e) => e.id === experimentId);
      if (!experiment) return null;

      const results = experiment.variants.map((variant) => {
        const impressions = experiment.metrics.impressions[variant.id] ?? 0;
        const clicks = experiment.metrics.clicks[variant.id] ?? 0;
        const conversions = experiment.metrics.conversions[variant.id] ?? 0;

        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;

        return {
          variant,
          impressions,
          clicks,
          conversions,
          ctr,
          conversionRate,
        };
      });

      // Find winner based on CTR
      const sorted = [...results].sort((a, b) => b.ctr - a.ctr);
      const winner = sorted[0];

      return {
        experiment,
        variants: results,
        winner,
        totalImpressions: results.reduce((s, r) => s + r.impressions, 0),
        totalClicks: results.reduce((s, r) => s + r.clicks, 0),
      };
    },
    [experiments]
  );

  return {
    experiments,
    registerExperiment,
    getVariant,
    trackImpression,
    trackClick,
    trackConversion,
    getExperimentResults,
  };
}

// Pre-defined experiments
export const DEFAULT_EXPERIMENTS: ABExperiment[] = [
  {
    id: "search-ad-style",
    name: "Search Ad Card Style",
    description: "Test different styles for sponsored search result ads",
    variants: [
      {
        id: "style-gradient",
        name: "Gradient Border",
        weight: 50,
        config: {
          borderStyle: "gradient",
          badgePosition: "top-right",
          showStats: true,
        },
      },
      {
        id: "style-minimal",
        name: "Minimal Clean",
        weight: 50,
        config: {
          borderStyle: "solid",
          badgePosition: "top-left",
          showStats: false,
        },
      },
    ],
    startDate: new Date().toISOString(),
    status: "active",
    metrics: {
      impressions: {},
      clicks: {},
      conversions: {},
    },
  },
  {
    id: "retargeting-delay",
    name: "Retargeting Ad Delay",
    description: "Test optimal delay before showing retargeting ad",
    variants: [
      {
        id: "delay-2s",
        name: "2 Second Delay",
        weight: 34,
        config: { delayMs: 2000 },
      },
      {
        id: "delay-5s",
        name: "5 Second Delay",
        weight: 33,
        config: { delayMs: 5000 },
      },
      {
        id: "delay-10s",
        name: "10 Second Delay",
        weight: 33,
        config: { delayMs: 10000 },
      },
    ],
    startDate: new Date().toISOString(),
    status: "active",
    metrics: {
      impressions: {},
      clicks: {},
      conversions: {},
    },
  },
  {
    id: "mobile-banner-position",
    name: "Mobile Banner Position",
    description: "Test different positions for mobile banner ad",
    variants: [
      {
        id: "pos-bottom",
        name: "Bottom Sticky",
        weight: 50,
        config: { position: "bottom", bottomOffset: 64 },
      },
      {
        id: "pos-top",
        name: "Top Sticky",
        weight: 50,
        config: { position: "top", topOffset: 64 },
      },
    ],
    startDate: new Date().toISOString(),
    status: "active",
    metrics: {
      impressions: {},
      clicks: {},
      conversions: {},
    },
  },
];
