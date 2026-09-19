import { getPrisma } from "@/lib/server/prisma";
import type { SubscriptionPlan } from "./types";
import type { RecordSubscriptionEventInput } from "./subscription-lifecycle-store";
import type { SubscriptionEventSource, SubscriptionEventType, SubscriptionLifecycleEvent } from "./subscription-lifecycle";

function toDomain(row: {
  id: string;
  workerId: string;
  subscriptionId: string | null;
  type: string;
  fromPlan: string | null;
  toPlan: string | null;
  periodDays: number | null;
  amount: number | null;
  currency: string;
  source: string;
  createdAt: Date;
}): SubscriptionLifecycleEvent {
  return {
    id: row.id,
    workerId: row.workerId,
    ...(row.subscriptionId ? { subscriptionId: row.subscriptionId } : {}),
    type: row.type as SubscriptionEventType,
    ...(row.fromPlan ? { fromPlan: row.fromPlan.toLowerCase() as SubscriptionPlan } : {}),
    ...(row.toPlan ? { toPlan: row.toPlan.toLowerCase() as SubscriptionPlan } : {}),
    ...(row.periodDays !== null ? { periodDays: row.periodDays } : {}),
    ...(row.amount !== null ? { amount: row.amount } : {}),
    currency: row.currency,
    source: row.source as SubscriptionEventSource,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function prismaRecordSubscriptionEvent(input: RecordSubscriptionEventInput): Promise<SubscriptionLifecycleEvent> {
  const row = await getPrisma().subscriptionEvent.create({
    data: {
      workerId: input.workerId,
      subscriptionId: input.subscriptionId ?? null,
      type: input.type,
      fromPlan: input.fromPlan ? input.fromPlan.toUpperCase() : null,
      toPlan: input.toPlan ? input.toPlan.toUpperCase() : null,
      periodDays: input.periodDays ?? null,
      amount: input.amount ?? null,
      currency: input.currency ?? "USD",
      source: input.source ?? "system",
    },
  });
  return toDomain(row);
}

export async function prismaListSubscriptionEvents(options: { workerId?: string; since?: Date; limit?: number } = {}): Promise<SubscriptionLifecycleEvent[]> {
  const rows = await getPrisma().subscriptionEvent.findMany({
    where: {
      ...(options.workerId ? { workerId: options.workerId } : {}),
      ...(options.since ? { createdAt: { gte: options.since } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.trunc(options.limit ?? 500)),
  });
  return rows.map(toDomain);
}
