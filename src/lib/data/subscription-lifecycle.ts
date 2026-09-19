import type { SubscriptionPlan } from "./types";

export type SubscriptionEventType = "trial_started" | "renewed" | "plan_changed" | "cancelled" | "expired";
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

/**
 * Summarize lifecycle events by UTC calendar month. Trial conversion is
 * attributed to the month in which each worker started their trial, even when
 * the first renewal lands in a later month; values are rounded to a tenth and
 * remain zero when the denominator is empty.
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
    const month = event.createdAt.slice(0, 7);
    const bucket = buckets.get(month);
    const at = Date.parse(event.createdAt);
    if (!Number.isFinite(at)) continue;
    if (event.type === "trial_started") {
      if (!bucket) continue;
      bucket.trials += 1;
      const trials = trialsByWorker.get(event.workerId) ?? [];
      trials.push({ month, at });
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

  // Attribute conversion to the trial's cohort, not the renewal's calendar
  // month. A worker who starts a trial on September 20 and renews on October 1
  // is still a September conversion. A renewal only counts when it follows the
  // trial; this also avoids counting a pre-existing renewal against a new trial.
  for (const [workerId, trials] of trialsByWorker) {
    const renewals = (renewalsByWorker.get(workerId) ?? []).sort((a, b) => a - b);
    for (const trial of trials) {
      const converted = renewals.some((renewalAt) => renewalAt > trial.at);
      if (converted) buckets.get(trial.month)!.trialConversionRate += 1;
    }
  }
  for (const bucket of buckets.values()) {
    if (bucket.trials > 0) bucket.trialConversionRate = Math.round((bucket.trialConversionRate / bucket.trials) * 1000) / 10;
  }
  return [...buckets.values()];
}
