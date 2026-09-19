import type { SubscriptionPlan } from "./types";
import type { SubscriptionEventSource, SubscriptionEventType, SubscriptionLifecycleEvent } from "./subscription-lifecycle";

function realEnabled(): boolean {
  return process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);
}

function prisma() {
  return import("./subscription-lifecycle-prisma");
}

type LifecycleStore = { seq: number; events: SubscriptionLifecycleEvent[] };
const GLOBAL_KEY = "__workersArenaSubscriptionLifecycle";
const g = globalThis as Record<string, unknown>;
const STORE: LifecycleStore = (g[GLOBAL_KEY] as LifecycleStore | undefined) ??
  (g[GLOBAL_KEY] = { seq: 0, events: [] } as LifecycleStore);

export function resetSubscriptionLifecycleStore(): void {
  STORE.seq = 0;
  STORE.events = [];
}

export interface RecordSubscriptionEventInput {
  workerId: string;
  subscriptionId?: string;
  type: SubscriptionEventType;
  fromPlan?: SubscriptionPlan;
  toPlan?: SubscriptionPlan;
  periodDays?: number;
  amount?: number;
  currency?: string;
  source?: SubscriptionEventSource;
}

export async function recordSubscriptionEvent(input: RecordSubscriptionEventInput): Promise<SubscriptionLifecycleEvent> {
  if (realEnabled()) return (await prisma()).prismaRecordSubscriptionEvent(input);
  STORE.seq += 1;
  const event: SubscriptionLifecycleEvent = {
    id: `sub-event-${STORE.seq}`,
    workerId: input.workerId,
    ...(input.subscriptionId ? { subscriptionId: input.subscriptionId } : {}),
    type: input.type,
    ...(input.fromPlan ? { fromPlan: input.fromPlan } : {}),
    ...(input.toPlan ? { toPlan: input.toPlan } : {}),
    ...(input.periodDays !== undefined ? { periodDays: input.periodDays } : {}),
    ...(input.amount !== undefined ? { amount: input.amount } : {}),
    currency: input.currency ?? "USD",
    source: input.source ?? "system",
    createdAt: new Date().toISOString(),
  };
  STORE.events.unshift(event);
  return event;
}

/**
 * Record a lifecycle milestone once for a worker/subscription pair. Cron jobs
 * are retried and may run in multiple processes, so expiry events must not
 * multiply on every scheduler tick.
 */
export async function recordSubscriptionEventOnce(input: RecordSubscriptionEventInput): Promise<SubscriptionLifecycleEvent | null> {
  const existing = await listSubscriptionEvents({ workerId: input.workerId, limit: 5000 });
  const duplicate = existing.some((event) =>
    event.type === input.type &&
    (input.subscriptionId ? event.subscriptionId === input.subscriptionId : !event.subscriptionId)
  );
  if (duplicate) return null;
  return recordSubscriptionEvent(input);
}

export async function listSubscriptionEvents(options: { workerId?: string; since?: Date; limit?: number } = {}): Promise<SubscriptionLifecycleEvent[]> {
  if (realEnabled()) return (await prisma()).prismaListSubscriptionEvents(options);
  const since = options.since?.getTime() ?? Number.NEGATIVE_INFINITY;
  const limit = Math.max(1, Math.trunc(options.limit ?? 500));
  return STORE.events
    .filter((event) => (!options.workerId || event.workerId === options.workerId) && Date.parse(event.createdAt) >= since)
    .slice(0, limit);
}
