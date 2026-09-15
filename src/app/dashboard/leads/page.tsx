import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-demo";
import { getWorkerBySlug, getWorkerLeadBoard, getWorkers } from "@/lib/data/repo";
import { LeadBoard } from "@/components/dashboard/leads/lead-board";

/**
 * §7–§10 — the worker's lead marketplace board (docs/lead-marketplace.md).
 *
 * Server component: the board is built from the ACTIVE fee-rule version and the
 * contact-reveal policy server-side (`getWorkerLeadBoard`), so the client never
 * receives a customer's raw phone number it is not entitled to show — the
 * masking decision happens before the payload leaves the server.
 */

export const metadata = { title: "Lead marketplace" };

/** The demo worker account — the same slug the dashboard and actions use. */
const DEMO_WORKER_SLUG = "khaled-al-harbi-plumbing";

export default async function WorkerLeadsPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.role === "admin") redirect("/admin");
  if (session.role === "company") redirect("/company");

  const worker =
    session.role === "worker"
      ? ((await getWorkerBySlug(DEMO_WORKER_SLUG)) ?? (await getWorkers({})).items[0])
      : (await getWorkers({})).items[0];
  if (!worker) redirect("/dashboard");

  // Hydration safety: the row countdowns derive from Date.now(), so the server
  // passes its render-time clock down as the seed (useCountdownTick).
  const [board, nowSeed] = await Promise.all([
    getWorkerLeadBoard(worker.id),
    Promise.resolve(Date.now()),
  ]);

  // The heading lives in the client component so it renders in the reader's
  // locale (the page itself is locale-agnostic).
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-10">
      <LeadBoard board={board} nowSeed={nowSeed} />
    </div>
  );
}
