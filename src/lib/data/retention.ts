import type { Worker } from "./types";

export interface RetentionAtRiskWorker {
  id: string;
  nameEn: string;
  nameAr: string;
  plan: string;
  daysUntilExpiry: number;
  lastActivity: string;
  hue: number;
}

export interface RetentionSnapshot {
  total: number;
  active: number;
  expiringSoon: number;
  expired: number;
  retentionRate: number;
  churnRate: number;
  atRiskWorkers: RetentionAtRiskWorker[];
}

/**
 * Calculate the subscription-health snapshot from the worker rows available to
 * the current adapter. This deliberately uses an injected clock so demo and
 * production renders, tests, and scheduled reports share boundary behavior.
 * "Expiring soon" means an active subscription ending within 30 days.
 */
export function retentionSnapshot(workers: Pick<Worker, "id" | "nameEn" | "nameAr" | "hue" | "subscription">[], nowMs = Date.now()): RetentionSnapshot {
  const total = workers.length;
  let active = 0;
  let expiringSoon = 0;
  let expired = 0;
  const atRiskWorkers: RetentionAtRiskWorker[] = [];

  for (const worker of workers) {
    const expiryMs = Date.parse(worker.subscription.expiresAt);
    const daysUntilExpiry = Number.isFinite(expiryMs)
      ? Math.ceil((expiryMs - nowMs) / 86_400_000)
      : Number.POSITIVE_INFINITY;
    const isExpired = worker.subscription.status === "expired" || (Number.isFinite(expiryMs) && expiryMs <= nowMs);

    if (isExpired) {
      expired += 1;
      continue;
    }

    active += 1;
    if (daysUntilExpiry >= 0 && daysUntilExpiry <= 30) {
      expiringSoon += 1;
      atRiskWorkers.push({
        id: worker.id,
        nameEn: worker.nameEn,
        nameAr: worker.nameAr,
        plan: worker.subscription.plan,
        daysUntilExpiry,
        lastActivity: "—",
        hue: worker.hue,
      });
    }
  }

  atRiskWorkers.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry || a.id.localeCompare(b.id));
  return {
    total,
    active,
    expiringSoon,
    expired,
    retentionRate: total > 0 ? Math.round(((total - expired) / total) * 1000) / 10 : 0,
    churnRate: total > 0 ? Math.round((expired / total) * 1000) / 10 : 0,
    atRiskWorkers,
  };
}
