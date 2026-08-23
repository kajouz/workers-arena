# WorkersArena Advertising System Architecture

## Overview

The WorkersArena advertising system is a comprehensive platform for managing, displaying, and tracking sponsored content across the application. It enables companies to create campaigns, target specific audiences, and measure ROI through detailed analytics.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Ad Placements](#ad-placements)
3. [Campaign Management](#campaign-management)
4. [Targeting & Personalization](#targeting--personalization)
5. [Analytics & Tracking](#analytics--tracking)
6. [Email Integration](#email-integration)
7. [Retargeting System](#retargeting-system)
8. [API Reference](#api-reference)
9. [Component Reference](#component-reference)

---

## System Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER JOURNEY                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  Search  │───▶│  View    │───▶│  Booking │───▶│  Email   │  │
│  │  Results │    │  Profile │    │  Intent  │    │  Digest  │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│       │              │              │              │            │
│       ▼              ▼              ▼              ▼            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              AD SERVING & TRACKING LAYER                  │  │
│  │  • Sponsored Results  • Profile Ads  • Email Ads         │  │
│  │  • Mobile Banners     • Retargeting  • Analytics         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                    │
│                           ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  CAMPAIGN DATABASE                        │  │
│  │  • Campaigns  • Ads  • Impressions  • Clicks  • Revenue  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Company creates campaign
         │
         ▼
┌─────────────────┐
│  Campaign Store  │
│  (In-Memory/DB)  │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Ad Selection    │  ← Targeting rules (city, category, placement)
│  Algorithm       │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Ad Rendering    │  ← Component selection based on placement
│  Components      │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Impression &    │  ← API endpoints track views/clicks
│  Click Tracking  │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Analytics       │  ← ROI metrics, CPC, CPM, ROAS
│  Dashboard       │
└─────────────────┘
```

---

## Ad Placements

### 1. Search Result Ads (`search`)

**Location:** Top of search results pages  
**Component:** `SponsoredSearchResults`  
**File:** `src/components/search/sponsored-result.tsx`

```tsx
// Shows up to 2 sponsored ads at the top of search results
<SponsoredSearchResults
  placement="search"
  category={filters.category}  // Target by category
  city={filters.city}          // Target by city
/>
```

**Behavior:**
- Displays before organic results
- Shows "Sponsored results" header with sparkle icon
- Ad card includes: name, category, city, CTR stats, CTA button
- Tracks clicks via `/api/ads/:id/click`

---

### 2. Category Page Ads (`category`)

**Location:** Top of `/categories` page  
**Component:** Inline in `CategoriesClient`  
**File:** `src/components/categories/categories-client.tsx`

```tsx
// Featured campaign banner at top of categories grid
<div className="mb-6 overflow-hidden rounded-2xl border border-violet-400/30">
  <Sparkles /> Featured Campaign
  <Badge>Sponsored</Badge>
  <a href="/company">Create campaign →</a>
</div>
```

**Behavior:**
- Static promotional banner
- Encourages companies to create campaigns
- Links to `/company` for campaign creation

---

### 3. Worker Profile Ads (`workerProfile`)

**Location:** Sidebar on worker profile pages  
**Component:** `WorkerSponsor`  
**File:** `src/components/worker/worker-sponsor.tsx`

```tsx
// Shows in sidebar below contact card
<WorkerSponsor
  workerCategory={cat?.nameEn}  // Target by worker's category
  workerCity={city?.nameEn}      // Target by worker's city
/>
```

**Behavior:**
- Fetches ads matching worker's category/city
- Shows related sponsored content
- Orange/amber themed to distinguish from profile content

---

### 4. Mobile Banner Ads (`mobileBanner`)

**Location:** Fixed bottom of screen (mobile only)  
**Component:** `MobileBannerAd`  
**File:** `src/components/ads/mobile-banner-ad.tsx`

```tsx
// Sticky bottom banner on mobile viewports
// Position: fixed, bottom: 16 (above bottom nav)
// Z-index: 45 (above nav, below modals)
// Hidden on lg+ screens
```

**Behavior:**
- Shows on mobile/tablet only (hidden on desktop)
- User can dismiss for 24 hours (localStorage)
- Dismiss state: `ad_dismissed_mobileBanner`
- Includes dismiss button with X icon

---

### 5. Email Digest Ads (`emailDigest`)

**Location:** Weekly email digest newsletters  
**File:** `src/lib/email/digest.ts`

```html
<!-- Sponsored section in email -->
<div style="border: 2px dashed #d946ef; border-radius: 12px;">
  <div style="background: linear-gradient(90deg, #d946ef, #a855f7);">
    ✦ SPONSORED
  </div>
  <div>
    <h3>{Ad Title}</h3>
    <p>{Description}</p>
    <a href="{tracking_url}">Learn More →</a>
  </div>
</div>

<!-- Tracking pixel -->
<img src="/api/ads/{id}/impression" width="1" height="1" />
```

**Behavior:**
- Appears in both worker and customer digest emails
- Styled with dashed purple border
- Includes tracking pixel for open measurement
- CTA links through click tracking endpoint

---

### 6. Retargeting Ads (`retargeting`)

**Location:** Floating overlay on return visits  
**Component:** `RetargetingAd`  
**File:** `src/components/ads/retargeting-ad.tsx`

```tsx
// Personalized ad based on visitor's browsing history
// Shows after 2s delay for better UX
// Positioned: fixed, bottom: 36 (mobile) / bottom: 8, right: 6 (desktop)
```

**Behavior:**
- Triggers when visitor:
  - Views 2+ pages, OR
  - Bounces (< 30 seconds on site)
- Ad selection based on:
  - Most viewed category
  - Cities searched
  - Recent activity
- Dismissable for 24 hours

---

## Campaign Management

### Campaign Data Structure

```typescript
interface Campaign {
  id: string;
  nameEn: string;
  nameAr: string;
  status: "active" | "paused" | "ended" | "pending";
  adType: "banner" | "slider" | "featuredCard" | "sponsoredSearch" 
        | "sponsoredCategory" | "popup" | "native" | "video";
  placement: string;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  ctr: number;
  startDate: string;
  endDate: string;
  targeting: {
    cities?: string[];
    categories?: string[];
  };
}
```

### Campaign Status Flow

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ PENDING │────▶│ ACTIVE  │────▶│ PAUSED  │────▶│  ENDED  │
│ (Unpaid)│     │ (Live)  │     │ (Held)  │     │ (Done)  │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
     │                               │
     │         ┌─────────┐           │
     └────────▶│  PAID   │◀──────────┘
               │ (Resume)│
               └─────────┘
```

### Campaign Builder

**File:** `src/components/dashboard/campaign-builder.tsx`

Companies can create campaigns with:
1. Campaign name (EN/AR)
2. Ad type selection
3. Placement targeting
4. Budget setting
5. Date range
6. Payment (Stripe/OMT/Whish)

---

## Targeting & Personalization

### Geographic Targeting

```typescript
// Ads can target specific cities
const targeting = {
  cities: ["riyadh", "jeddah", "dammam"],
  categories: ["plumbing", "electrical"]
};
```

### Category Targeting

```typescript
// Ads filtered by category context
<SponsoredSearchResults
  category="plumbing"  // Shows plumbing-related ads
  city="riyadh"        // Shows Riyadh-targeted ads
/>
```

### Behavioral Targeting (Retargeting)

```typescript
// Visitor profile stored in localStorage
interface RetargetingProfile {
  visitorId: string;
  interests: string[];  // Categories viewed
  cities: string[];     // Cities searched
  lastVisit: number;
  visitCount: number;
  bounced: boolean;
}
```

**Targeting Rules:**
- **Page Views:** 2+ pages → show retargeting ad
- **Bounce:** < 30 seconds on site → show retargeting ad
- **No Conversion:** No booking intent in 24h → show ad
- **Interest Match:** Show ads for most viewed category

---

## Analytics & Tracking

### Tracking Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ads/:id/click` | POST | Track ad click |
| `/api/ads/:id/impression` | GET | Track email open (pixel) |
| `/api/company/analytics` | GET | Campaign ROI metrics |

### Key Metrics

#### ROI Metrics (Campaign Analytics)

```typescript
interface CampaignAnalytics {
  summary: {
    totalImpressions: number;
    totalClicks: number;
    totalSpent: number;
    totalBudget: number;
    remaining: number;
    ctr: number;           // Click-through rate (%)
    cpc: number;           // Cost per click ($)
    cpm: number;           // Cost per 1000 impressions ($)
    roas: number;          // Return on ad spend (x)
    estimatedConversions: number;
    estimatedRevenue: number;
  };
  placementStats: Record<string, {
    impressions: number;
    clicks: number;
    spent: number;
    count: number;
  }>;
  dailyPerformance: Array<{
    date: string;
    impressions: number;
    clicks: number;
    spent: number;
    ctr: number;
  }>;
}
```

#### Metric Formulas

```
CTR = (Clicks / Impressions) × 100
CPC = Total Spent / Total Clicks
CPM = (Total Spent / Total Impressions) × 1000
ROAS = Estimated Revenue / Total Spent
```

### Analytics Dashboard

**File:** `src/components/dashboard/campaign-analytics.tsx`

**Access:** `/company?view=analytics`

**Features:**
- ROAS, CPC, CPM, Revenue cards
- Daily performance bar chart
- Placement breakdown with progress bars
- Top performing campaigns table
- Budget utilization circular progress
- Period selector (7D/30D/90D)
- Export functionality

---

## Email Integration

### Digest Email Structure

```
┌─────────────────────────────────┐
│         HEADER                  │
│    Weekly Digest                │
│    Jan 1 - Jan 7, 2024         │
├─────────────────────────────────┤
│         STATS                   │
│  ┌─────┐ ┌─────┐ ┌─────┐      │
│  │  $  │ │  #  │ │ ⭐  │      │
│  └─────┘ └─────┘ └─────┘      │
├─────────────────────────────────┤
│       UPCOMING SCHEDULE         │
│  • Booking 1 - Confirmed       │
│  • Booking 2 - Pending         │
├─────────────────────────────────┤
│       ★ SPONSORED ★            │  ← Ad Section
│  ┌─────────────────────────┐   │
│  │ Premium Tools Sale      │   │
│  │ 30% Off - Limited Time  │   │
│  │ [Learn More →]          │   │
│  └─────────────────────────┘   │
├─────────────────────────────────┤
│       CTA BUTTON                │
│    [View Dashboard]             │
├─────────────────────────────────┤
│         FOOTER                  │
│    © 2024 WorkersArena          │
└─────────────────────────────────┘
```

### Email Tracking

**Impression Pixel:**
```html
<img 
  src="https://workersarena.com/api/ads/{adId}/impression" 
  width="1" 
  height="1" 
  style="display:none" 
/>
```

**Click Tracking:**
```
CTA URL → /api/ads/{adId}/click → Redirect to destination
```

---

## Retargeting System

### Visitor Tracking

**File:** `src/hooks/use-retargeting.ts`

```typescript
// Tracks visitor behavior in localStorage
const { 
  trackCategory,      // Log category interest
  trackCity,          // Log city search
  trackWorkerView,    // Log worker profile view
  trackBookingIntent, // Log booking attempt
  shouldShowRetargetingAd  // Check if should show ad
} = useRetargeting();
```

### Retargeting Logic

```
┌─────────────────────────────────────────────────────────────┐
│                    RETARGETING DECISION TREE                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Visitor arrives                                            │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐     NO     ┌─────────────────────────┐   │
│  │ Has profile? │──────────▶│ Create new profile       │   │
│  └─────────────┘            └─────────────────────────┘   │
│         │ YES                                                │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Update profile:                                      │   │
│  │ • Increment visit count                              │   │
│  │ • Add page view event                                │   │
│  │ • Update interests/cities                            │   │
│  └─────────────────────────────────────────────────────┘   │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐     YES    ┌─────────────────────────┐   │
│  │ Time < 30s? │──────────▶│ Mark as bounced          │   │
│  └─────────────┘            └─────────────────────────┘   │
│         │ NO                                                │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Should show retargeting ad?                          │   │
│  │ • 2+ page views, OR                                  │   │
│  │ • Bounced, AND                                       │   │
│  │ • No booking intent in 24h                           │   │
│  └─────────────────────────────────────────────────────┘   │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Show personalized ad after 2s delay                  │   │
│  │ • Based on top interest category                     │   │
│  │ • Or default retargeting ad                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Ad Personalization

| Visitor Behavior | Ad Shown |
|------------------|----------|
| Viewed plumbing 3x | Plumbing service ad |
| Searched Riyadh | Riyadh-targeted ad |
| Bounced from search | "Complete your booking" ad |
| New visitor (2+ pages) | "Top workers near you" ad |

---

## API Reference

### Ad Endpoints

#### GET `/api/ads`

Fetch ads for a placement.

**Query Params:**
- `placement` (required): Ad placement type
- `category` (optional): Filter by category
- `city` (optional): Filter by city

**Response:**
```json
{
  "ad": {
    "id": "ad-123",
    "nameEn": "Premium Tools Sale",
    "nameAr": "تخفيض على الأدوات",
    "placement": "search",
    "adType": "native",
    "ctr": 2.5,
    "clicks": 150,
    "impressions": 6000
  }
}
```

#### POST `/api/ads/:id/click`

Track ad click.

**Response:**
```json
{
  "success": true,
  "clickId": "click-456"
}
```

#### GET `/api/ads/:id/impression`

Email tracking pixel (returns 1x1 GIF).

**Response:** `image/gif`

---

### Analytics Endpoints

#### GET `/api/company/analytics`

Get campaign analytics (requires company/admin auth).

**Response:**
```json
{
  "summary": {
    "totalImpressions": 45000,
    "totalClicks": 1200,
    "totalSpent": 2500,
    "ctr": 2.67,
    "cpc": 2.08,
    "cpm": 55.56,
    "roas": 3.2
  },
  "placementStats": { ... },
  "dailyPerformance": [ ... ],
  "topCampaigns": [ ... ]
}
```

---

### Cron Endpoints

#### POST `/api/cron/digest`

Send weekly email digests (requires cron secret).

**Headers:**
```
Authorization: Bearer {CRON_SECRET}
```

**Response:**
```json
{
  "success": true,
  "results": {
    "workersSent": 150,
    "customersSent": 300,
    "errors": 0
  }
}
```

---

## Component Reference

### Ad Components

| Component | File | Purpose |
|-----------|------|---------|
| `SponsoredSearchResults` | `src/components/search/sponsored-result.tsx` | Search result ads |
| `WorkerSponsor` | `src/components/worker/worker-sponsor.tsx` | Worker profile ads |
| `MobileBannerAd` | `src/components/ads/mobile-banner-ad.tsx` | Mobile sticky banner |
| `RetargetingAd` | `src/components/ads/retargeting-ad.tsx` | Retargeting overlay |
| `CampaignAnalytics` | `src/components/dashboard/campaign-analytics.tsx` | Analytics dashboard |

### Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useRetargeting` | `src/hooks/use-retargeting.ts` | Visitor tracking & ad targeting |

### Utilities

| Function | File | Purpose |
|----------|------|---------|
| `generateSponsoredSection` | `src/lib/email/digest.ts` | Email ad HTML |
| `fetchSponsoredContentForEmail` | `src/lib/email/digest.ts` | Fetch ads for email |
| `generateWorkerDigestHTML` | `src/lib/email/digest.ts` | Worker digest template |
| `generateCustomerDigestHTML` | `src/lib/email/digest.ts` | Customer digest template |

---

## Configuration

### Environment Variables

```bash
# Email Provider
EMAIL_PROVIDER=resend|sendgrid
RESEND_API_KEY=re_xxx
SENDGRID_API_KEY=SG.xxx
EMAIL_FROM=noreply@workersarena.com

# Cron Security
CRON_SECRET=your-secret-key

# Analytics
NEXT_PUBLIC_ANALYTICS_ID=xxx
```

### Ad Configuration

**File:** `src/components/ads/retargeting-ad.tsx`

```typescript
// Retargeting ad templates by category
const RETARGETING_ADS = {
  plumbing: [...],
  electrical: [...],
  default: [...]
};

// Bounce threshold (ms)
const BOUNCE_THRESHOLD_MS = 30000;

// Dismiss duration (ms)
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;
```

---

## Best Practices

### Performance

1. **Lazy Loading:** Ads load after main content
2. **Client-Side Fetching:** Ads fetched via API, not SSR
3. **Debounced Tracking:** Avoid spam clicks
4. **LocalStorage:** Visitor profile stored locally (no DB calls)

### UX

1. **Non-Intrusive:** Ads don't block content
2. **Dismissible:** Users can hide ads for 24h
3. **Relevant:** Ads match user's interests/location
4. **Clear Labeling:** "Sponsored" badges on all ads

### Privacy

1. **Local Storage Only:** No third-party tracking
2. **Opt-Out:** Users can dismiss ads
3. **No PII:** Visitor IDs are random, not tied to accounts
4. **GDPR-Friendly:** No cookies required

---

## Deployment Notes

### Vercel Configuration

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/digest",
      "schedule": "0 9 * * 1"
    }
  ]
}
```

### Build Considerations

- Ad components are client-side only (no SSR)
- Retargeting hook checks `typeof window`
- Email templates are server-rendered strings

---

## Future Enhancements

1. **A/B Testing:** Compare ad creatives
2. **Machine Learning:** Predict best ad placement
3. **Real-Time Bidding:** Auction-based ad serving
4. **Cross-Device Tracking:** Unified visitor profiles
5. **Video Ads:** In-stream video advertisements
6. **Native Ads:** Matched to content style

---

*Last Updated: August 2024*
*Version: 1.0.0*
