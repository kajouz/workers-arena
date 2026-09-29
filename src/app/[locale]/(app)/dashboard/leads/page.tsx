import { getSession } from "@/lib/auth-demo";
import { getWorkerLeadBoard } from "@/lib/data/repo";
import { LeadBoard } from "@/components/dashboard/leads/lead-board";
import { localeRedirect } from "@/lib/i18n/redirect";
import { getSessionWorker } from "@/lib/data/authz";

/**
 * §7–§10 — the worker's lead marketplace board (docs/lead-marketplace.md).
 *
 * Server component: the board is built from the ACTIVE fee-rule version and the
 * contact-reveal policy server-side (`getWorkerLeadBoard`), so the client never
 * receives a customer's raw phone number it is not entitled to show — the
 * masking decision happens before the payload leaves the server.
 */

export const metadata = { title: "Lead marketplace" };

export default async function WorkerLeadsPage() {
  const session = await getSession();
  if (!session) return await localeRedirect("/auth/login");
  if (session.role === "admin") return await localeRedirect("/admin");
  if (session.role === "company") return await localeRedirect("/company");

  if (session.role === "customer") return await localeRedirect("/bookings");

  // Only the signed-in worker's own board; never another worker's leads.
  const worker = await getSessionWorker(session);
  if (!worker) return await localeRedirect("/dashboard/onboarding");

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
