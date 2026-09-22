# Review moderation — the publication gate

[← Back to docs index](README.md)

**What this is:** the queue that decides which customer reviews become public. A review is *submitted* by a customer and *published* by an admin decision; between those two moments it is invisible on the worker's profile and contributes nothing to the worker's rating.

**Why it exists:** the `Review` model has carried `status`, `aiFlags`, `moderatedById` and `moderatedAt` since the schema was first written, and the profile read path has always filtered on `status: "APPROVED"` — but nothing ever wrote those fields. Reviews published themselves instantly on submission, and no one could reject anything. In real mode the gap was worse than cosmetic: `addReview` was a documented no-op, so the moderation surface had no way to exist and the review pipeline had nowhere to go.

**Related:** → [selection-workflow.md](selection-workflow.md) (where the review-site interaction sits in the customer⇄worker story) · [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) (the interaction map) · [ARCHITECTURE.md](ARCHITECTURE.md) (the demo ⇄ Prisma adapter convention this follows) · [BUSINESS-MODEL.md](BUSINESS-MODEL.md) (trust is what keeps the take rate sellable)

---

## 1. The lifecycle

```
customer submits ──▶ PENDING ──┬──▶ APPROVED ──▶ visible on the profile
   (addReview)                 │                 counted in the rating
                               │                 worker notified
                               └──▶ REJECTED  ──▶ invisible
                                                 never counted (no rating change)
                                                 reason recorded for the audit
```

Three invariants the code is responsible for:

1. **Nothing is published by submitting.** `addReview` (`src/lib/data/repo.ts`) stores the row with `status: "pending"` in demo mode and `PENDING` in real mode. The worker's `rating` / `reviewCount` are untouched, no notification is sent, and both read paths filter the row out.
2. **A decision is one-shot and attributed.** `decideReview` refuses a review that is no longer pending (real mode via a compare-and-set `updateMany({ where: { status: "PENDING" } })`), and every transition lands in the audit log with the acting admin. A rejection must carry a reason from the shared vocabulary.
3. **A rejection leaves no trace in the numbers.** Because the decision is applied to the aggregate (see §3), rejecting a 1★ review changes the profile's rating and count by exactly nothing.

## 2. Triage — what the admin is shown

`src/lib/data/review-moderation.ts` is the pure engine; it has no store access, so the queue can run it on every render.

**Text signals** (`scanReviewText`): no text · too short · contains a link · shares contact details (phone-shaped runs and e-mail addresses) · shouting (mostly-capital Latin prose).

**Context signals** (`assessReview`): unverified purchase · just submitted (within `BURST_WINDOW_HOURS`) · frequent reviewer · author has rejected reviews · a bare 1★/5★ with nothing to moderate.

Each signal carries a severity (`info` · `warn` · `danger` → 1 · 3 · 6), the sum picks a **risk band** (`high` ≥ 8, `medium` ≥ 3), and the band plus whether a `danger` signal fired picks an **advisory recommendation**:

| Situation | Recommendation |
|---|---|
| No `warn`/`danger` signals | `approve` |
| Some signals, no danger | `review` |
| `danger` signal and high risk | `reject` |

**The recommendation is advisory.** It orders the queue and gives the admin a starting point; it never changes a status on its own — every status change goes through `decideReview`, attributed to a human. This is deliberate: an automatic publish/reject pipeline is a moderation policy decision, not a cleverness the engine gets to make on its own.

The queue is ordered **risk-first, then oldest**, so the dangerous and the over-SLA reviews are what an admin sees on opening.

## 3. The number that matters: lifetime count vs. sample

A profile reads **"4.9 · 120 reviews"** while the renderable `reviews` array holds a handful of the latest. `reviewCount` and `rating` are therefore *lifetime* aggregates, and an approval folds the new review into them the way a live platform would:

```
count  ← count + 1
rating ← (rating × (count − 1) + newRating) / count
```

Recomputing those two fields from the approved rows instead would collapse a 120-review profile to its sample size on the first decision and move the rating for a reason unrelated to the review being moderated. A rejection changes neither field.

Two rating figures exist, for two different jobs:

- **Displayed stars** = the lifetime running average above (what a reader sees next to the review count).
- **`weightedRating`** (pure engine) = a Bayesian mean over the *approved sample*, weighted by verified purchase (×1.5), recency (half-life 180 days) and helpful votes, with a prior of 5 reviews at 4.2. This is ranking input, not presentation: it stops a single 5★ profile from outranking a 200-review one, and `rankingScore` adds a log-scaled volume lift so equal ratings break by evidence.

## 4. Persistence

Following the app's two-adapter convention:

| | demo | real |
|---|---|---|
| state | the in-memory demo workforce's review arrays + a `globalThis` audit log | `Review.status` / `moderatedById` / `moderatedAt` + a `ReviewModeration` row per decision |
| reads | `listReviewQueue()`, `getReviewModerationStats()`, `workerReviewSummary()` | same API, Prisma-backed |
| gate | `src/lib/data/review-moderation-store.ts` owns the `DEMO_MODE === "false" && DATABASE_URL` switch | `src/lib/data/review-moderation-prisma.ts` marshals rows only |

`ReviewModeration` is append-only: `action` (`APPROVED` / `REJECTED`), `reason`, `note`, the `flags` seen at decision time (so a later dispute is judged against what the queue actually showed), and `actorId`. Migration: `prisma/migrations/20260922120000_review_moderation`.

**Legacy rows:** an absent status means *approved* (`effectiveStatus`), so data that predates moderation — and the demo dataset, which has no status column of its own — keeps its rating and stays visible. The migration adds no backfill for that reason; real-mode rows that exist without a status show as pending and are exactly the backlog the queue exists to clear.

## 5. Surfaces

- **`/admin/reviews`** — the queue: health cards (pending, past-SLA, risk bands), the review cards with their signals and advisory recommendation, approve / reject-with-reason, and a "recently decided" trail. A conflict (already decided, e.g. another tab) refreshes the row instead of reporting a fake success.
- **`/admin`** — a queue card next to the verification queue, with the pending count, the oldest wait and the SLA-breach flag: publication is a gate, so its backlog belongs on the overview.
- **Worker profile** — approved reviews only, on both adapters (demo filters in `withDemoSignals`, real filters in the `PROFILE_INCLUDE` / `LIST_INCLUDE` `where`).
- **Submitter** — the form says what actually happened ("with our team for a quick check") rather than "thank you, it's live", and the offline-queue replay returns `pending` for the same reason.

## 6. Operations

- **Approving notifies the worker** (inbox + email/push/WhatsApp per the dispatcher) in their own language, and is the only review notification — an unmoderated review is not a reputation event. Rejecting notifies no one.
- **Audit trail**: `REVIEW_APPROVED` / `REVIEW_REJECTED` action codes, with the worker, the rating and the rejection reason in the copy, so the admin activity feed tells the same story as the queue.
- **SLA**: `REVIEW_MODERATION_SLA_HOURS` (24 h) drives the "past SLA" figure on both admin surfaces. It is the number to watch: an unworked queue means reviews are invisible, and a customer who was told "thank you" is waiting on it.

## 7. Tests

- `tests/review-moderation.test.ts` — the pure engine: signal extraction (including the bilingual text case), risk/recommendation bands, queue stats, status gating, weighted-rating behaviour (prior, volume, recency, verified, pending excluded) and the ranking lift.
- `tests/review-moderation-store.test.ts` — the demo lifecycle: submit → pending (uncounted, off the profile), approve → published/counted/attributed, reject → aggregate untouched, a second decision refused, summary reporting.
- `tests/notifications.test.ts` — submission notifies nobody; approval notifies the worker.
- `tests/playwright/full-app-e2e.spec.ts` — the queue page renders for an admin in the production build (content-asserted, because a 404 route once passed a status-only check).
