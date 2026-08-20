# WorkersArena API Documentation

## Overview

WorkersArena provides a RESTful API for managing workers, bookings, search, and more. All endpoints return JSON responses.

**Base URL:** `https://api.workersarena.com`

**Authentication:** Demo mode uses cookie-based sessions. Production uses JWT tokens.

---

## Endpoints

### Workers

#### GET /api/workers
Search and list workers with filters.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| q | string | Search query |
| category | string | Category slug |
| city | string | City slug |
| area | string | Area slug |
| rating | number | Minimum rating |
| min | number | Minimum price |
| max | number | Maximum price |
| exp | number | Minimum years of experience |
| verified | 1 | Only verified workers |
| featured | 1 | Only featured workers |
| emergency | 1 | Only emergency workers |
| open | 1 | Only open now |
| available | 1 | Only available this week |
| feeWaived | 1 | Only fee-waived workers |
| sort | string | Sort mode (relevance, rating, reviews, priceLow, priceHigh, experience, nearest) |
| page | number | Page number |

**Response:**
```json
{
  "items": [...],
  "total": 150,
  "page": 1,
  "hasMore": true
}
```

#### GET /api/workers/[slug]
Get a worker by slug.

---

### Search

#### GET /api/search/suggest
Get autocomplete suggestions.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| q | string | Search query (min 2 chars) |
| locale | string | Language (en/ar) |

**Response:**
```json
{
  "suggestions": [
    { "type": "category", "labelEn": "Plumbing", "labelAr": "سباكة", "href": "/search?category=plumbing" }
  ]
}
```

---

### Forum

#### GET /api/forum
List forum posts.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| category | string | Filter by category |
| q | string | Search query |
| sort | string | Sort mode (newest, popular, unanswered) |
| page | number | Page number |
| limit | number | Results per page |

#### POST /api/forum
Create a new forum post.

**Body:**
```json
{
  "title": "How to fix a leaky faucet?",
  "content": "I have a leaky kitchen faucet...",
  "category": "plumbing",
  "tags": ["faucet", "leak"]
}
```

#### GET /api/forum/[id]
Get a forum post with answers.

#### POST /api/forum/[id]
Add an answer to a post.

#### POST /api/forum/[id]/vote
Vote on a post or answer.

**Body:**
```json
{
  "targetType": "post",
  "targetId": "abc123",
  "value": 1
}
```

---

### Offline Queue

#### POST /api/offline-queue/replay
Replay queued offline actions.

**Body:**
```json
{
  "actions": [
    {
      "type": "lead",
      "workerId": "abc123",
      "name": "John Doe",
      "phone": "+961 71 123 456",
      "message": "I need a plumber"
    }
  ]
}
```

---

### Analytics

#### POST /api/analytics/page-view
Track a page view.

**Body:**
```json
{
  "path": "/workers/john-doe",
  "workerId": "abc123"
}
```

---

### Notifications

#### GET /api/notifications
List user notifications.

#### POST /api/notifications/[id]/read
Mark a notification as read.

---

### Push Subscriptions

#### POST /api/push/subscribe
Register a push subscription.

**Body:**
```json
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

#### DELETE /api/push/subscribe
Unregister a push subscription.

---

### Ads

#### GET /api/ads
List active advertisements.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| placement | string | Placement (homepage, category, search, sidebar) |
| categoryId | string | Target category |
| cityId | string | Target city |

#### POST /api/ads/[id]/click
Track an ad click.

---

### Payments

#### POST /api/payments/webhook
Stripe webhook endpoint.

#### GET /api/payments/simulate
Simulated payment completion (demo mode).

---

### Health

#### GET /api/health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-01T00:00:00Z"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "error_code",
  "message": "Human-readable error message"
}
```

**Common Error Codes:**
| Code | Description |
|------|-------------|
| unauthorized | Authentication required |
| forbidden | Insufficient permissions |
| not_found | Resource not found |
| validation_error | Invalid request data |
| rate_limited | Too many requests |
| internal_error | Server error |

---

## Verification

### POST /api/verification/send
Send a verification code via email, phone, or WhatsApp.

**Request Body:**
```json
{
  "userId": "u-customer",
  "channel": "email",
  "target": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "requestId": "ver_1234567890_abc123",
  "expiresIn": 600
}
```

### POST /api/verification/verify
Verify a 6-digit OTP code.

**Request Body:**
```json
{
  "userId": "u-customer",
  "channel": "email",
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "channel": "email"
}
```

---

## Geolocation

### GET /api/workers/near
Find workers within a radius of a geographic point.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| lat | number | Latitude |
| lng | number | Longitude |
| radius | number | Radius in km (default: 25) |
| category | string | Optional category filter |

**Response:** Workers sorted by distance with `distance` field added.

---

## Disputes

### POST /api/disputes
File a new dispute for a booking.

**Request Body:**
```json
{
  "bookingNumber": "WA-2024-1847",
  "category": "quality",
  "title": "Work quality was poor",
  "description": "Detailed description...",
  "evidence": ["url1", "url2"]
}
```

**Response:**
```json
{
  "id": "dispute_abc123",
  "status": "open",
  "createdAt": "2026-08-20T10:00:00Z"
}
```

### GET /api/disputes/:id
Get dispute details and timeline.

### POST /api/disputes/:id/respond
Add a message to a dispute thread.

---

## Analytics

### POST /api/analytics/page-view
Track a page view (used by offline queue).

**Request Body:**
```json
{
  "url": "/workers/khaled-al-harbi-plumbing",
  "referrer": "/search?category=plumbing",
  "timestamp": "2026-08-20T10:00:00Z"
}
```

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| /api/auth | 10 requests | 15 minutes |
| /api/contact | 5 requests | 1 minute |
| /api/reviews | 10 requests | 1 minute |
| /api/offline-queue | 30 requests | 1 minute |
| /api/verification/send | 3 requests | 10 minutes |
| Other /api/* | 60 requests | 1 minute |

---

## Demo Mode

In demo mode (`DEMO_MODE=true`):
- All data is embedded (no database required)
- Payments are simulated (instant completion)
- Emails are logged to console
- Push notifications use web-push with VAPID

---

## Production Mode

To switch to production mode:
1. Set `DEMO_MODE=false`
2. Configure `DATABASE_URL` for PostgreSQL
3. Configure `STRIPE_SECRET_KEY` for payments
4. Configure `SENDGRID_API_KEY` or `RESEND_API_KEY` for emails
5. Configure `SENTRY_DSN` for error tracking
6. Run `npx prisma migrate deploy`
