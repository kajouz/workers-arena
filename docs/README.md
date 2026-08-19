# WorkersArena — Docs Index

This folder is the project's living documentation. Start here to find the right doc, then follow the cross-references — every doc links its neighbors so you can trace a feature from **strategy → design → workflow → money**.

**Quick orientation:**

- **What the product is / could be** → [PRODUCT.md](PRODUCT.md) (feature inventory + roadmap) · [ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md) (what ships next, features *and* workflow)
- **How it's built** → [ARCHITECTURE.md](ARCHITECTURE.md) · [API.md](API.md) · [DEPLOYMENT.md](DEPLOYMENT.md) · [mobile-architecture.md](mobile-architecture.md)
- **How the parties interact** (the workflow docs) → [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) (start here) · [selection-workflow.md](selection-workflow.md) · [booking-scheduling.md](booking-scheduling.md) · [booking-customer-ui.md](booking-customer-ui.md) · [multi-candidate-quotes.md](multi-candidate-quotes.md)
- **Where the money comes from** → [BUSINESS-MODEL.md](BUSINESS-MODEL.md) · [PAYMENTS.md](PAYMENTS.md) · [booking-take-rate.md](booking-take-rate.md) · [payouts.md](payouts.md)
- **User-facing manual (Word)** → [WorkersArena-User-Manual.docx](WorkersArena-User-Manual.docx) — every module, step-by-step usage, and each role's job (regenerated from `scripts/generate-user-manual.mjs`)

---

## Cross-reference table

| Doc | What it covers | Workflow & related docs it links |
|---|---|---|
| **[INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md)** | **The map: who talks to whom.** Every directed interaction between user ⇄ worker, admin ⇄ user, admin ⇄ worker, admin ⇄ company (trigger → server path → outcome), plus the revenue each party generates. 8 Mermaid sequence diagrams. | → [selection-workflow.md](selection-workflow.md) (user⇄worker booking story) · [booking-take-rate.md](booking-take-rate.md) (M5 fee) · [payouts.md](payouts.md) (worker ledger) · [PAYMENTS.md](PAYMENTS.md) (deposits/ads) · [BUSINESS-MODEL.md](BUSINESS-MODEL.md) (revenue strategy) |
| **[selection-workflow.md](selection-workflow.md)** | The customer ⇄ worker **selection story** end-to-end: discovery → booking request → worker response → pre-job → execution & close, with the trust/fairness guarantees + sequence diagram. | → [booking-scheduling.md](booking-scheduling.md) (the five service rules) · [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) (the full interaction map) · [booking-customer-ui.md](booking-customer-ui.md) (customer UI) · [multi-candidate-quotes.md](multi-candidate-quotes.md) (the structural fix to selection) |
| **[booking-scheduling.md](booking-scheduling.md)** | Booking & scheduling mechanics: slot model, request/confirm lifecycle, the canonical five rules, availability editor, reminder cron, deposits + invoices, worker dashboard. | → [selection-workflow.md](selection-workflow.md) (the workflow that uses these rules) · [booking-customer-ui.md](booking-customer-ui.md) (customer dialog/rows) · [PAYMENTS.md](PAYMENTS.md) (deposits) · [multi-candidate-quotes.md](multi-candidate-quotes.md) (auction reuse) · [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) |
| **[booking-customer-ui.md](booking-customer-ui.md)** | The customer-facing booking UI (BookingDialog → service/slot/details, `/bookings` tracking page) — component plan + status. | → [booking-scheduling.md](booking-scheduling.md) (the data model it drives) · [selection-workflow.md](selection-workflow.md) (the workflow it serves) · [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) |
| **[multi-candidate-quotes.md](multi-candidate-quotes.md)** | "Request quotes from up to 3 workers": the `QuoteRequest` auction layer that reuses `Booking` as the per-worker bid record, winner selection, quote SLA. | → [selection-workflow.md](selection-workflow.md) (it replaces one-shot booking in selection) · [booking-scheduling.md](booking-scheduling.md) (reused slot/event/notification rails) · [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) (quote-request flows in §1) |
| **[booking-take-rate.md](booking-take-rate.md)** | The M5 platform fee: rate/floor/cap policy, `computePlatformFee`, stamp-at-accept, fee/exempt display, settlement. | → [BUSINESS-MODEL.md](BUSINESS-MODEL.md) (the revenue thesis) · [payouts.md](payouts.md) (fee → net earnings → payout) · [PAYMENTS.md](PAYMENTS.md) (settlement rails) · [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) (§5.2 revenue) |
| **[payouts.md](payouts.md)** | Worker ledger: earnings credited at COMPLETED (`quote − fee`), request/decide payout lifecycle, admin queue. | → [booking-take-rate.md](booking-take-rate.md) (where the net comes from) · [PAYMENTS.md](PAYMENTS.md) (real-money rails) · [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) (§3.1–3.2 admin⇄worker) |
| **[PAYMENTS.md](PAYMENTS.md)** | Payments architecture: six providers, checkout/webhook flows, deposits, ad-campaign purchases, refunds, recurring. | → [booking-scheduling.md](booking-scheduling.md) (booking deposits) · [booking-take-rate.md](booking-take-rate.md) (fee settlement) · [payouts.md](payouts.md) (worker settlement) · [BUSINESS-MODEL.md](BUSINESS-MODEL.md) (monetization) · [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) |
| **[BUSINESS-MODEL.md](BUSINESS-MODEL.md)** | Business model & revenue growth plan: subscriptions, ads, take rate; unit economics; roadmap. | → [PAYMENTS.md](PAYMENTS.md) (the payment rails) · [booking-take-rate.md](booking-take-rate.md) (the fee lever) · [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) (§5 revenue by party) |
| **[PRODUCT.md](PRODUCT.md)** | Product & features plan: the single source of truth for what exists + the P0/P1/P2 roadmap + mobile plan + feature-to-code map. | → [ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md) (next work) · [BUSINESS-MODEL.md](BUSINESS-MODEL.md) (revenue) · [mobile-architecture.md](mobile-architecture.md) (mobile strategy) · [selection-workflow.md](selection-workflow.md) (workflow state) |
| **[ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md)** | The prioritized plan for what to build next, on two axes: **features** (new capabilities) and **workflow** (how customers/workers/admins move through the product). Living checklist with statuses. | → [PRODUCT.md](PRODUCT.md) (what exists) · [BUSINESS-MODEL.md](BUSINESS-MODEL.md) (revenue) · [selection-workflow.md](selection-workflow.md) (selection state) · [booking-scheduling.md](booking-scheduling.md) (booking milestones) · [booking-take-rate.md](booking-take-rate.md) (fee sketch) · [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) (interaction map) |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | System overview, folder structure, multilingual/RTL, search engine, auth, security, notifications, the W1/W2 real-data flip (demo ⇄ Prisma). | → [API.md](API.md) (endpoints) · [PRODUCT.md](PRODUCT.md) (features) · [DEPLOYMENT.md](DEPLOYMENT.md) (ops) · [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) (who the seams serve) |
| **[API.md](API.md)** | REST endpoints (App Router route handlers): shapes, demo vs production mapping. | → [ARCHITECTURE.md](ARCHITECTURE.md) (system overview) · [PAYMENTS.md](PAYMENTS.md) (payment webhooks) |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | Deploying: Vercel, Docker, env, demo ⇄ real mode. | → [ARCHITECTURE.md](ARCHITECTURE.md) (the demo/real flip it configures) · [PRODUCT.md](PRODUCT.md) (feature scope) |
| **[mobile-architecture.md](mobile-architecture.md)** | Mobile engineering playbook (Capacitor path): native shells, push, deep links, store checklist. | → [PRODUCT.md](PRODUCT.md) (§5 mobile plan) · [ARCHITECTURE.md](ARCHITECTURE.md) (shared web core) |
| **[WorkersArena-User-Manual.docx](WorkersArena-User-Manual.docx)** | **The user-facing Word manual**: every module (functionality + step-by-step usage), each role's responsibilities (customer / worker / company / admin), cross-party workflows, and the revenue each party generates. Generated, not hand-edited — see “Keeping the user manual fresh” below. | → [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) (the same workflows in diagram form) · [PRODUCT.md](PRODUCT.md) (feature inventory) · [BUSINESS-MODEL.md](BUSINESS-MODEL.md) · [PAYMENTS.md](PAYMENTS.md) · [ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md) (what ships next) |

---

## Diagrams (pre-rendered SVG)

The 8 directed party-pair workflows from [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) plus the two workflow-story diagrams from [selection-workflow.md](selection-workflow.md) and [multi-candidate-quotes.md](multi-candidate-quotes.md), rendered to SVG so they preview here and in any markdown viewer without a mermaid renderer. Regenerate with `npm run validate:diagrams` (the diagrams themselves stay the source of truth — these images are their output, refreshed whenever the workflows change).

**§1 — User ⇄ Worker**

<p align="center"><img src="diagrams/1-1-user-to-worker.svg" alt="User to Worker — discover, book, quote, pay, chat, complete" width="700"></p>

<p align="center"><img src="diagrams/1-2-worker-to-user.svg" alt="Worker to User — respond, bid, execute, reschedule, chat" width="700"></p>

**§2 — Admin ⇄ User**

<p align="center"><img src="diagrams/2-1-admin-to-user.svg" alt="Admin to User — dispute timeline, exports, email audit, money actions" width="700"></p>

<p align="center"><img src="diagrams/2-2-user-to-admin.svg" alt="User to Admin — dispute trail, print/email audit, chat, notifications" width="700"></p>

**§3 — Admin ⇄ Worker**

<p align="center"><img src="diagrams/3-1-admin-to-worker.svg" alt="Admin to Worker — verification, plan change, payouts, campaign refund, SLA" width="700"></p>

<p align="center"><img src="diagrams/3-2-worker-to-admin.svg" alt="Worker to Admin — verification, payout request, renewals, lifecycle signals" width="700"></p>

**§4 — Admin ⇄ Company**

<p align="center"><img src="diagrams/4-1-admin-to-company.svg" alt="Admin to Company — campaign refund, ad-spend audit, revenue watch" width="700"></p>

<p align="center"><img src="diagrams/4-2-company-to-admin.svg" alt="Company to Admin — campaign create, pay, performance, invoices" width="700"></p>

**Workflow stories (end-to-end)**

<p align="center"><img src="diagrams/selection-workflow.svg" alt="Selection workflow — discovery, booking request, worker response, execution, close" width="700"></p>

<p align="center"><img src="diagrams/multi-candidate-quotes.svg" alt="Multi-candidate quotes — invite up to 3 workers, submit bids, pick a winner, existing pipeline takes over" width="700"></p>

---

## The workflow-doc chain (read in order)

1. **[INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md)** — the whole map: who can do what to whom, and the money each party generates.
2. **[selection-workflow.md](selection-workflow.md)** — the user ⇄ worker story in detail (the core marketplace loop).
3. **[booking-scheduling.md](booking-scheduling.md)** — the mechanics that make that story work (slots, rules, lifecycle).
4. **[multi-candidate-quotes.md](multi-candidate-quotes.md)** — how selection got its auction upgrade (quotes from up to 3 workers).
5. **[booking-take-rate.md](booking-take-rate.md)** → **[payouts.md](payouts.md)** → **[PAYMENTS.md](PAYMENTS.md)** — the money: fee at accept, net earnings at completion, settlement rails.
6. **[BUSINESS-MODEL.md](BUSINESS-MODEL.md)** — why the money is structured that way and what's next.

## Keeping the user manual fresh

The Word manual (`WorkersArena-User-Manual.docx`) is **generated, not hand-edited** — its source of truth is `scripts/generate-user-manual.mjs`. Keep them in lockstep:

1. **When a feature or module ships**, update its section in the generator (module title, the “Roles involved” line, and the step-by-step list) — or add a new module block after §3.15. Keep steps user-facing and grounded in the actual UI; keep the revenue and identifier tables in sync with BUSINESS-MODEL.md / PAYMENTS.md / INTERACTION-WORKFLOWS.md.
2. **Regenerate** with `npm run docs:manual`.
3. **The standard check regenerates it for you**: `npm run test:all` runs `docs:manual` on every pass, so the committed `.docx` is always the generator's output — a manual that drifted from the generator shows up as a dirty diff, never as silent staleness. The document cover prints its generation date, so a reader can tell at a glance how fresh it is.

## Keeping this index fresh

When you add or rewrite a doc in `docs/`, update its row in the cross-reference table (one-line summary + the workflow/related docs it links). Every doc keeps a `[← Back to docs index](README.md)` link on line 3, right under its title — keep it there when editing a header. When a workflow changes (new interaction, new revenue stream, new admin surface), update **INTERACTION-WORKFLOWS.md** first — it is the map every other workflow doc hangs off.
