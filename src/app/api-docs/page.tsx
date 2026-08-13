import type { Metadata } from "next";
import { Code2, Server, Webhook, Database } from "lucide-react";

export const metadata: Metadata = { title: "API documentation" };

const ENDPOINTS = [
  { method: "GET", path: "/api/workers", desc: "Search workers with filters (q, category, city, rating, min, max, sort, page…)" },
  { method: "GET", path: "/api/workers/:slug", desc: "Full worker profile" },
  { method: "GET", path: "/api/categories", desc: "All 21 categories with worker counts" },
  { method: "GET", path: "/api/search/suggest?q=&locale=", desc: "Autocomplete suggestions" },
  { method: "GET", path: "/api/ads?placement=&category=&city=", desc: "Ad rotation (records an impression)" },
  { method: "POST", path: "/api/ads/:id/click", desc: "Track a sponsored click" },
  { method: "GET", path: "/api/notifications", desc: "Notification inbox + unread count" },
  { method: "GET", path: "/api/admin/push-subscriptions", desc: "Admin: list push endpoints (owner, device, last-active)" },
  { method: "POST", path: "/api/admin/push-subscriptions", desc: "Admin: force-remove an endpoint or prune dead (404/410) ones" },
  { method: "GET", path: "/api/admin/activity", desc: "Admin: paged activity history with actor/type filters (page, pageSize, actor, type)" },
  { method: "GET", path: "/api/cron/push-prune", desc: "Cron: scheduled dead-endpoint cleanup (CRON_SECRET-guarded)" },
  { method: "GET", path: "/api/cron/activity-prune", desc: "Cron: ActivityLog retention — delete rows older than N days (CRON_SECRET-guarded)" },
  { method: "GET", path: "/api/health", desc: "Health check (mode: demo | production)" },
];

const ACTIONS = [
  "loginAction · registerAction · logoutAction — session lifecycle",
  "submitReviewAction(workerId, formData) — create review",
  "requestServiceAction(workerId) — log a contact lead",
  "trackViewAction(workerId) — profile-view analytics",
  "renewSubscriptionAction(plan, period?) — renew/switch plan (monthly/annual — annual pays 10 months for 12) + issue invoice",
  "createCampaignAction(formData) — create a PENDING campaign + checkout URL (paid → ACTIVE)",
  "refundCampaignAction(campaignId, reason) — admin refund of a paid campaign purchase (reason required + recorded)",
  "decideVerificationAction(workerSlug) — approve/reject verification",
  "markReadAction · markAllReadAction — notification inbox",
];

export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
          <Server className="size-6" />
        </span>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-ink-900 dark:text-ink-50">API documentation</h1>
          <p className="text-ink-500 dark:text-ink-400">
            REST endpoints, server actions and webhooks — see <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs dark:bg-ink-800">docs/API.md</code> for the full guide.
          </p>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900 dark:text-ink-50">
          <Code2 className="size-5 text-brand-500" /> REST endpoints
        </h2>
        <div className="mt-4 overflow-hidden rounded-2xl border border-ink-200 dark:border-ink-800">
          {ENDPOINTS.map((e, i) => (
            <div key={e.path} className={`flex items-center gap-4 border-ink-100 px-5 py-4 dark:border-ink-800 ${i > 0 ? "border-t" : ""}`}>
              <span className="w-14 shrink-0 rounded-lg bg-emerald-500/10 px-2 py-1 text-center text-xs font-black text-emerald-600 dark:text-emerald-400">{e.method}</span>
              <code className="shrink-0 text-sm font-bold text-ink-900 dark:text-ink-50">{e.path}</code>
              <span className="hidden text-sm text-ink-500 dark:text-ink-400 sm:block">{e.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900 dark:text-ink-50">
          <Database className="size-5 text-brand-500" /> Server actions
        </h2>
        <ul className="mt-4 space-y-2">
          {ACTIONS.map((a) => (
            <li key={a} className="rounded-xl border border-ink-200 px-4 py-3 font-mono text-sm text-ink-600 dark:border-ink-800 dark:text-ink-300">
              {a}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900 dark:text-ink-50">
          <Webhook className="size-5 text-brand-500" /> Webhooks (production)
        </h2>
        <p className="mt-3 rounded-xl bg-brand-500/5 p-4 text-sm text-ink-600 dark:text-ink-300">
          Payment providers (Stripe, PayPal, MyFatoorah, Tap) deliver signed webhooks to{" "}
          <code className="font-mono text-xs">/api/webhooks/:provider</code>. All are verified,
          idempotent and audited. See <code className="font-mono text-xs">docs/PAYMENTS.md</code>.
        </p>
      </section>
    </div>
  );
}
