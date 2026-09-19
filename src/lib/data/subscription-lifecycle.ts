import type { SubscriptionPlan } from "./types";

export type SubscriptionEventType =
  | "trial_started"
  | "renewed"
  | "plan_changed"
  | "cancelled"
  | "expired"
  | "whatsapp_outreach_sent"
  | "whatsapp_outreach_failed";
export type SubscriptionEventSource = "onboarding" | "manual_payment" | "admin" | "cron" | "system";

export interface SubscriptionLifecycleEvent {
  id: string;
  workerId: string;
  subscriptionId?: string;
  type: SubscriptionEventType;
  fromPlan?: SubscriptionPlan;
  toPlan?: SubscriptionPlan;
  periodDays?: number;
  amount?: number;
  currency: string;
  source: SubscriptionEventSource;
  createdAt: string;
}

export interface SubscriptionCohort {
  month: string;
  started: number;
  renewed: number;
  trials: number;
  cancelled: number;
  trialConversionRate: number;
}

export interface SubscriptionPlanTransition {
  from: SubscriptionPlan;
  to: SubscriptionPlan;
  count: number;
  percentage: number;
}

export interface SubscriptionAnalytics {
  cohorts: SubscriptionCohort[];
  trialStarts: number;
  trialConversions: number;
  trialConversionRate: number;
  churnEvents: number;
  churnRate: number;
  upgrades: number;
  downgrades: number;
  planTransitions: SubscriptionPlanTransition[];
  averageLifetimeMonths: number;
  ltv: number;
  renewalRevenue: number;
  whatsappOutreachSent: number;
  whatsappOutreachFailed: number;
}

const PLAN_ORDER: Record<SubscriptionPlan, number> = {
  basic: 1,
  professional: 2,
  premium: 3,
  enterprise: 4,
};

function monthOf(iso: string): string | null {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 7) : null;
}

/**
 * Summarize lifecycle events by UTC calendar month. Trial conversion is
 * attributed to the month in which each worker started their trial, even when
 * the first renewal lands in a later month.
 */
export function subscriptionCohorts(events: SubscriptionLifecycleEvent[], months = 6, now = new Date()): SubscriptionCohort[] {
  const count = Math.max(1, Math.trunc(months));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count + 1, 1));
  const buckets = new Map<string, SubscriptionCohort>();
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const key = date.toISOString().slice(0, 7);
    buckets.set(key, { month: key, started: 0, renewed: 0, trials: 0, cancelled: 0, trialConversionRate: 0 });
  }

  const trialsByWorker = new Map<string, { month: string; at: number }[]>();
  const renewalsByWorker = new Map<string, number[]>();
  for (const event of events) {
    const month = monthOf(event.createdAt);
    const bucket = month ? buckets.get(month) : undefined;
    const at = Date.parse(event.createdAt);
    if (!Number.isFinite(at)) continue;
    if (event.type === "trial_started") {
      if (!bucket) continue;
      bucket.trials += 1;
      const trials = trialsByWorker.get(event.workerId) ?? [];
      trials.push({ month: month!, at });
      trialsByWorker.set(event.workerId, trials);
    } else if (event.type === "renewed") {
      if (bucket) bucket.renewed += 1;
      const renewals = renewalsByWorker.get(event.workerId) ?? [];
      renewals.push(at);
      renewalsByWorker.set(event.workerId, renewals);
    } else if (event.type === "plan_changed") {
      if (bucket) bucket.started += 1;
    } else if (event.type === "cancelled" || event.type === "expired") {
      if (bucket) bucket.cancelled += 1;
    }
  }

  for (const [workerId, trials] of trialsByWorker) {
    const renewals = (renewalsByWorker.get(workerId) ?? []).sort((a, b) => a - b);
    for (const trial of trials) {
      if (renewals.some((renewalAt) => renewalAt > trial.at)) buckets.get(trial.month)!.trialConversionRate += 1;
    }
  }
  for (const bucket of buckets.values()) {
    if (bucket.trials > 0) bucket.trialConversionRate = Math.round((bucket.trialConversionRate / bucket.trials) * 1000) / 10;
  }
  return [...buckets.values()];
}

/**
 * Build all retention and monetization metrics from the append-only lifecycle
 * ledger. No current subscription snapshot or fabricated lifetime estimates are
 * used for historical metrics; an open lifetime is measured through `now`.
 * Amounts are minor currency units, matching renewal lifecycle events.
 */
export function subscriptionAnalytics(events: SubscriptionLifecycleEvent[], months = 6, now = new Date()): SubscriptionAnalytics {
  const cohorts = subscriptionCohorts(events, months, now);
  const trialEvents = events.filter((event) => event.type === "trial_started");
  const renewalEvents = events.filter((event) => event.type === "renewed");
  const churnEvents = events.filter((event) => event.type === "cancelled" || event.type === "expired");
  const transitionEvents = events.filter(
    (event): event is SubscriptionLifecycleEvent & { fromPlan: SubscriptionPlan; toPlan: SubscriptionPlan } =>
      event.type === "plan_changed" && Boolean(event.fromPlan && event.toPlan)
  );

  const trialStarts = trialEvents.length;
  const trialConversions = trialEvents.filter((trial) =>
    renewalEvents.some((renewal) => renewal.workerId === trial.workerId && Date.parse(renewal.createdAt) > Date.parse(trial.createdAt))
  ).length;
  const workersWithSubscriptionEvents = new Set(events.filter((event) => event.type !== "whatsapp_outreach_sent" && event.type !== "whatsapp_outreach_failed").map((event) => event.workerId));

  const transitionCounts = new Map<string, SubscriptionPlanTransition>();
  let upgrades = 0;
  let downgrades = 0;
  for (const event of transitionEvents) {
    const key = `${event.fromPlan}->${event.toPlan}`;
    const current = transitionCounts.get(key) ?? { from: event.fromPlan, to: event.toPlan, count: 0, percentage: 0 };
    current.count += 1;
    transitionCounts.set(key, current);
    if (PLAN_ORDER[event.toPlan] > PLAN_ORDER[event.fromPlan]) upgrades += 1;
    if (PLAN_ORDER[event.toPlan] < PLAN_ORDER[event.fromPlan]) downgrades += 1;
  }
  const transitionTotal = transitionEvents.length;
  const planTransitions = [...transitionCounts.values()]
    .map((transition) => ({ ...transition, percentage: transitionTotal ? Math.round((transition.count / transitionTotal) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count || `${a.from}-${a.to}`.localeCompare(`${b.from}-${b.to}`));

  const lifetimeByWorker = new Map<string, { start: number; end: number }>();
  for (const event of events) {
    if (event.type === "whatsapp_outreach_sent" || event.type === "whatsapp_outreach_failed") continue;
    const at = Date.parse(event.createdAt);
    if (!Number.isFinite(at)) continue;
    const current = lifetimeByWorker.get(event.workerId);
    if (!current) {
      lifetimeByWorker.set(event.workerId, { start: at, end: at });
      continue;
    }
    current.start = Math.min(current.start, at);
    current.end = Math.max(current.end, event.type === "cancelled" || event.type === "expired" ? at : Date.parse(now.toISOString()));
  }
  const lifetimes = [...lifetimeByWorker.values()].map(({ start, end }) => Math.max(0, end - start) / (30 * 86_400_000));
  const averageLifetimeMonths = lifetimes.length ? Math.round((lifetimes.reduce((sum, value) => sum + value, 0) / lifetimes.length) * 10) / 10 : 0;
  const renewalRevenue = renewalEvents.reduce((sum, event) => sum + (event.amount ?? 0), 0);

  return {
    cohorts,
    trialStarts,
    trialConversions,
    trialConversionRate: trialStarts ? Math.round((trialConversions / trialStarts) * 1000) / 10 : 0,
    churnEvents: churnEvents.length,
    churnRate: workersWithSubscriptionEvents.size ? Math.round((churnEvents.length / workersWithSubscriptionEvents.size) * 1000) / 10 : 0,
    upgrades,
    downgrades,
    planTransitions,
    averageLifetimeMonths,
    ltv: workersWithSubscriptionEvents.size ? Math.round(renewalRevenue / workersWithSubscriptionEvents.size) : 0,
    renewalRevenue,
    whatsappOutreachSent: events.filter((event) => event.type === "whatsapp_outreach_sent").length,
    whatsappOutreachFailed: events.filter((event) => event.type === "whatsapp_outreach_failed").length,
  };
}
