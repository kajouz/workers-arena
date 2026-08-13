# API Design

## REST endpoints (App Router route handlers)

All responses are JSON. Demo mode returns embedded data; production maps to Prisma with the same shapes.

### Public

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/workers` | Search workers. Query params: `q, category, city, area, rating, min, max, exp, verified, featured, emergency, open, available, sort, page` → `{ items, total, tookMs }` |
| GET | `/api/workers/:slug` | Single worker profile |
| GET | `/api/categories` | Categories with worker counts |
| GET | `/api/search/suggest?q=&locale=` | Autocomplete suggestions (`category | worker | city`) |
| GET | `/api/ads?placement=&category=&city=` | Ad rotation for a placement — records an impression server-side |
| POST | `/api/ads/:id/click` | Track a sponsored click (updates `clicks`, `ctr`, `spent`) |
| GET | `/api/notifications` | `{ items, unread }` — inbox for the header bell & `/notifications` page |
| GET | `/api/health` | `{ ok, mode: "demo"\|"production" }` |

Example:

```bash
curl "http://localhost:3001/api/workers?category=plumbing&city=riyadh&rating=4.5&sort=rating"
```

### Response shape (workers)

```jsonc
{
  "items": [
    {
      "id": "khaled-plumb",
      "slug": "khaled-al-harbi-plumbing",
      "nameEn": "Khaled Al-Harbi",
      "nameAr": "خالد الحربي",
      "categorySlug": "plumbing",
      "rating": 4.9,
      "reviewCount": 132,
      "verified": true,
      "priceMin": 80,
      "currency": "SAR",
      "services": [{ "nameEn": "Fix leaking pipe", "price": 120, "unit": "job" }],
      "reviews": [/* … */]
    }
  ],
  "total": 12,
  "tookMs": 3
}
```

### Error model

```jsonc
{ "error": "Not found" }          // 404
{ "error": "invalid_request" }    // 400 with details in "details"
{ "error": "rate_limited" }       // 429
{ "error": "unauthorized" }       // 401
```

## Server Actions (`src/app/actions/`)

| Action | Purpose |
|---|---|
| `loginAction` / `registerAction` / `loginDemoAction` / `logoutAction` | Session lifecycle |
| `submitReviewAction(workerId, formData)` | Create review (demo in-memory; production → `Review` with PENDING moderation) |
| `requestServiceAction(workerId)` | Log a contact lead |
| `trackViewAction(workerId)` | Profile-view analytics event |
| `renewSubscriptionAction(formData)` | Renew / switch subscription plan → issues invoice + notification |
| `createCampaignAction(formData)` | Create an ad campaign as PENDING and return its checkout URL (paid → ACTIVE via webhook) |
| `payCampaignAction(campaignId)` | Re-mint the checkout URL for a PENDING campaign (Pay now) |
| `refundCampaignAction(campaignId, reason)` | Admin: refund a paid campaign purchase — `reason` is required and recorded on the payment + activity-feed entry (payment → REFUNDED, campaign ends) |
| `decideVerificationAction(formData)` | Admin: approve / reject a worker verification request |
| `submitVerificationAction()` | Worker: submit (or resubmit) verification documents |
| `markReadAction(formData)` / `markAllReadAction()` | Notification inbox management |

## Webhooks (production)

| Webhook | Source | Purpose |
|---|---|---|
| `POST /api/webhooks/stripe` | Stripe | `checkout.session.completed` → activate subscription, generate invoice |
| `POST /api/webhooks/paypal` | PayPal | IPN verification → mark payment paid |
| `POST /api/webhooks/myfatoorah` | MyFatoorah | Payment status callback |
| `POST /api/webhooks/tap` | Tap | Charge status callback |

All webhooks verify provider signatures, are idempotent (`providerRef` unique) and write to `ActivityLog`.

## Notifications & expiry jobs

Cron (Vercel Cron / GitHub Actions / Docker sidecar):

- Daily: find subscriptions expiring in 7/3/1 days → send reminders (channel per user preference).
- Hourly: expire overdue subscriptions → deactivate worker (`status: INACTIVE`), hide from search, notify admin, log audit entry.
