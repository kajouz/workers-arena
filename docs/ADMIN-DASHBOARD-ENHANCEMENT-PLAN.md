# Admin Dashboard Enhancement Plan

> Last updated: August 21, 2026

---

## Current State Assessment

The admin dashboard (`/admin`) already includes:

| Category | What Exists |
|----------|------------|
| **KPIs** | 8 stat cards — total workers, active/inactive, expired subs, revenue, monthly revenue, companies, active ads |
| **Revenue** | Area chart (monthly), platform fee stats (gross/net/refunded/avg) |
| **Worker Management** | Searchable table with plan/status audit, fee-waived filter |
| **Campaigns** | Revenue by campaign, payments table, refund flow, email previews |
| **Activity Feed** | Filterable by type, with booking deep-links |
| **Funnels** | Verification funnel (requests/approved/declined), Booking funnel (status distribution + conversion) |
| **Payouts** | Worker withdrawal requests with approve/reject |
| **Manual Payments** | Lebanon OMT/Whish confirmations |
| **Verifications** | Queue (approve/reject) + history page |
| **Alerts** | Expired subscriptions, pending verifications |
| **Search Trends** | Top search queries |

---

## Enhancement Plan

### Phase 1 — Real-Time Operational Dashboard (1-2 weeks)

> Priority: **Critical** — Gives the admin immediate visibility into live platform health.

#### 1.1 Live Metrics Panel
- Real-time WebSocket/SSE stream for active users, ongoing bookings, and pending actions
- Pulsing indicators showing "live" status
- Auto-refresh counters for pending items (verifications, payouts, manual payments)
- Estimated revenue ticker updated every 30 seconds

#### 1.2 System Health Monitor
- **API response times** — avg/median/p95 for each endpoint
- **Error rate** — 5xx/4xx counts over last 24h with spike detection
- **Database health** — connection pool status, query latency, slow query log
- **Cron job status** — last run time, success/failure for each scheduled job
- **Neon database** — connection count, storage usage, branching status

#### 1.3 Server-Side Notification Hub
- Bell icon with live unread count badge
- Dropdown showing latest notifications (new bookings, verifications, payments)
- Click to navigate directly to the relevant admin page
- Mark all as read / mark individual as read
- Filter by type: bookings, verifications, payments, system

#### 1.4 Today's Summary Widget
- Top of dashboard — prominent card showing:
  - Bookings today (count + revenue)
  - New worker registrations today
  - Pending verifications (urgent)
  - Pending payouts (amount)
  - Active visitors right now

**Files to create/modify:**
- `src/components/dashboard/live-metrics.tsx`
- `src/components/dashboard/system-health.tsx`
- `src/components/dashboard/notification-hub.tsx`
- `src/components/dashboard/today-summary.tsx`
- `src/app/api/admin/live-metrics/route.ts`
- `src/app/api/admin/health/route.ts`

---

### Phase 2 — Geographic & Behavioral Analytics (1-2 weeks)

> Priority: **High** — Enables data-driven expansion decisions.

#### 2.1 Geographic Heatmap
- Interactive map (Leaflet/OpenStreetMap) showing:
  - Worker density by city/area (heatmap layer)
  - Booking concentration (cluster markers)
  - Revenue by region (choropleth overlay)
- Click a region to drill down into city-level stats
- Time-range selector (last 7/30/90 days)
- Export region data as CSV

#### 2.2 Customer Acquisition Funnel
- Visual funnel chart:
  ```
  Visitors → Search → Profile View → Contact/Lead → Booking → Completed
  ```
- Drop-off percentages between each stage
- Trend over time (is conversion improving?)
- Breakdown by category (which trades convert best?)
- Breakdown by city (which cities have highest conversion?)

#### 2.3 User Behavior Analytics
- **Session duration** — avg time on site, per page
- **Bounce rate** — which pages lose visitors
- **Search-to-contact ratio** — how many searches lead to leads
- **Peak hours heatmap** — when users are most active (day × hour grid)
- **Device breakdown** — mobile vs desktop vs tablet
- **Language split** — Arabic vs English usage by region

#### 2.4 Worker Retention & Churn
- **Cohort analysis** — workers grouped by signup month, tracked over time
- **Churn rate** — % of workers who downgrade/cancel per month
- **Lifetime value (LTV)** — avg revenue per worker over their lifecycle
- **Plan upgrade/downgrade tracking** — which plan transitions are most common
- **At-risk workers** — workers whose subscription expires in <7 days

**Files to create/modify:**
- `src/components/dashboard/geo-heatmap.tsx`
- `src/components/dashboard/acquisition-funnel.tsx`
- `src/components/dashboard/behavior-analytics.tsx`
- `src/components/dashboard/retention-cohorts.tsx`
- `src/app/api/admin/geo/route.ts`
- `src/app/api/admin/behavior/route.ts`
- `src/lib/data/analytics-geo.ts`

---

### Phase 3 — Advanced Financial Dashboard (1 week)

> Priority: **High** — Financial visibility is critical for business operations.

#### 3.1 Revenue Dashboard Page (`/admin/revenue`)
- **Revenue breakdown** by source:
  - Subscription revenue (by plan tier)
  - Platform fees (booking take-rate)
  - Campaign/ad revenue
  - Manual payments (OMT/Whish)
- **Revenue trends** — daily/weekly/monthly views with comparison
- **Forecast** — simple linear projection for next 30 days
- **Refund tracking** — total refunds, reasons breakdown, refund rate
- **Outstanding payments** — pending OMT/Whish + overdue subscriptions

#### 3.2 Invoice Management (`/admin/invoices`)
- List all invoices with filters (status, date range, amount)
- Invoice detail view with line items
- Mark as paid / send reminder
- Export invoices as PDF
- Bulk export for accounting

#### 3.3 Tax & Compliance Report
- Quarterly revenue summary
- Platform fee collection breakdown
- Worker payout history
- Exportable CSV for accountant

**Files to create/modify:**
- `src/app/admin/revenue/page.tsx`
- `src/app/admin/invoices/page.tsx`
- `src/components/dashboard/revenue-breakdown.tsx`
- `src/components/dashboard/invoice-table.tsx`
- `src/app/api/admin/invoices/route.ts`

---

### Phase 4 — Content & User Management (1-2 weeks)

> Priority: **Medium** — Reduces manual admin work.

#### 4.1 Customer Management (`/admin/customers`)
- Searchable list of all customers (from bookings + leads)
- Customer profile view (booking history, reviews, spending)
- Ban/suspend customer
- Export customer list as CSV

#### 4.2 Enhanced Worker Management
- **Worker detail modal** — click any worker in the table to see full profile
  - Subscription history
  - Booking stats (completed/cancelled/no-show)
  - Revenue generated
  - Verification documents viewer
  - Communication log
- **Bulk actions** — select multiple workers to:
  - Change plan
  - Send email
  - Export selected as CSV
  - Verify/decline in batch
- **Worker impersonation** — "Login as worker" for support debugging

#### 4.3 Category & Content Management
- **Category admin** (`/admin/categories`)
  - Add/edit/delete categories
  - Reorder categories (drag & drop)
  - Toggle active/inactive
  - View worker count per category
- **FAQ management** (`/admin/faq`)
  - CRUD for FAQ entries
  - Reorder questions
  - Toggle publish/draft
- **Announcement banner** — create site-wide announcements
  - Title, body, link
  - Start/end date
  - Target audience (all / workers / customers)

#### 4.4 Role-Based Access Control (RBAC)
- Define admin roles: Super Admin, Support, Finance, Marketing
- Granular permissions:
  - View analytics
  - Manage workers
  - Process payments
  - Manage content
  - View financials
- Admin user management — invite/remove admins, assign roles
- Audit log for all admin actions (who did what, when)

**Files to create/modify:**
- `src/app/admin/customers/page.tsx`
- `src/app/admin/categories/page.tsx`
- `src/app/admin/settings/page.tsx`
- `src/components/admin/worker-detail-modal.tsx`
- `src/components/admin/bulk-actions-panel.tsx`
- `src/lib/data/admin-rbac.ts`

---

### Phase 5 — Communication & Marketing Tools (1 week)

> Priority: **Medium** — Enables growth and retention campaigns.

#### 5.1 Email Campaign Manager (`/admin/email`)
- Create and send email campaigns to:
  - All workers
  - All customers
  - Workers by category
  - Workers by plan tier
  - Workers expiring soon
- Email templates (welcome, re-engagement, promotional)
- Send history with open/click rates
- Schedule sends for optimal times

#### 5.2 Push Notification Manager (`/admin/push`)
- Send push notifications to:
  - All subscribers
  - Workers only
  - Customers only
  - Targeted by subscription status
- Notification history
- Delivery stats (sent/delivered/opened)
- Template library

#### 5.3 Promotional Tools
- **Discount code manager** — create/expire discount codes
  - Percentage or fixed amount
  - Usage limits
  - Expiry dates
  - Target plans
- **Featured placement scheduler** — schedule when workers appear as featured
- **Seasonal campaigns** — pre-built campaign templates for holidays/events

**Files to create/modify:**
- `src/app/admin/email/page.tsx`
- `src/app/admin/push/page.tsx`
- `src/app/admin/promotions/page.tsx`
- `src/components/admin/email-campaign-builder.tsx`
- `src/components/admin/discount-code-manager.tsx`
- `src/app/api/admin/email/send/route.ts`

---

### Phase 6 — Security & Audit (1 week)

> Priority: **Medium** — Essential for compliance and trust.

#### 6.1 Security Dashboard (`/admin/security`)
- **Login history** — all admin login attempts with IP, device, timestamp
- **Failed login alerts** — brute force detection
- **Active sessions** — who's logged in right now
- **API key management** — create/revoke API keys
- **Two-factor auth status** — which admins have 2FA enabled

#### 6.2 Comprehensive Audit Trail
- Every admin action logged:
  - Verification decisions
  - Plan changes
  - Payment processing
  - Content changes
  - User management actions
- Filterable by: admin, action type, date range
- Exportable as CSV for compliance

#### 6.3 Fraud Detection Alerts
- **Suspicious patterns:**
  - Workers with unusually high booking cancellation rates
  - Multiple accounts from same IP
  - Reviews from same phone number
  - Payment disputes spike
- **Risk scoring** — auto-flag high-risk accounts
- **Manual review queue** — admin approves/denies flagged items

**Files to create/modify:**
- `src/app/admin/security/page.tsx`
- `src/components/admin/audit-log.tsx`
- `src/components/admin/fraud-alerts.tsx`
- `src/lib/data/audit.ts`

---

### Phase 7 — Automated Operations (1 week)

> Priority: **Low-Medium** — Reduces manual toil.

#### 7.1 Automated Reports (Daily/Weekly/Monthly)
- Email digest to admin with:
  - Revenue summary
  - New registrations
  - Booking statistics
  - Pending actions count
  - System health summary
- Configurable schedule and recipients

#### 7.2 Smart Alerts & Triggers
- **Revenue drop alert** — if daily revenue < X% of 7-day average
- **Churn spike alert** — if >Y workers cancel in a day
- **Review crisis alert** — if average rating drops below threshold
- **Capacity alert** — if pending verifications > Z
- Configurable thresholds per alert type

#### 7.3 Scheduled Maintenance Tasks
- Auto-expire unpaid subscriptions after grace period
- Auto-prune old notifications
- Auto-generate weekly reports
- Database backup status monitoring
- Storage usage alerts

**Files to create/modify:**
- `src/app/api/cron/admin-reports/route.ts`
- `src/app/api/cron/smart-alerts/route.ts`
- `src/lib/data/alert-rules.ts`
- `src/components/admin/alert-config.tsx`

---

## Implementation Priority Matrix

| Phase | Impact | Effort | Priority | Dependencies |
|-------|--------|--------|----------|-------------|
| 1 — Real-Time Ops | 🔴 Critical | Medium | **P0** | None |
| 2 — Geo & Behavior | 🔴 Critical | High | **P0** | Phase 1 |
| 3 — Financial | 🟡 High | Medium | **P1** | None |
| 4 — User Management | 🟡 High | High | **P1** | Phase 1 |
| 5 — Communication | 🟢 Medium | Medium | **P2** | Phase 4 |
| 6 — Security | 🟢 Medium | Medium | **P2** | Phase 4 |
| 7 — Automation | 🟢 Low-Med | Medium | **P3** | Phases 1-4 |

---

## Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 1 — Real-Time Ops | 1-2 weeks | Week 2 |
| Phase 2 — Geo & Behavior | 1-2 weeks | Week 4 |
| Phase 3 — Financial | 1 week | Week 5 |
| Phase 4 — User Management | 1-2 weeks | Week 7 |
| Phase 5 — Communication | 1 week | Week 8 |
| Phase 6 — Security | 1 week | Week 9 |
| Phase 7 — Automation | 1 week | Week 10 |

**Total: ~10 weeks for full implementation**

---

## Technical Architecture

### Data Layer
```
src/lib/data/
├── analytics.ts          # Current analytics (existing)
├── analytics-geo.ts      # Geographic analytics (new)
├── analytics-behavior.ts # User behavior analytics (new)
├── analytics-finance.ts  # Financial analytics (new)
├── audit.ts              # Audit trail logging (new)
├── admin-rbac.ts         # Role-based access control (new)
├── alert-rules.ts        # Smart alert rules (new)
└── prisma-repo.ts        # Database queries (extend)
```

### Component Architecture
```
src/components/dashboard/
├── admin-dashboard.tsx   # Main dashboard (existing)
├── live-metrics.tsx      # Real-time metrics (new)
├── system-health.tsx     # System health monitor (new)
├── notification-hub.tsx  # Notification dropdown (new)
├── today-summary.tsx     # Today's summary card (new)
├── geo-heatmap.tsx       # Geographic heatmap (new)
├── acquisition-funnel.ts # Customer acquisition funnel (new)
├── behavior-analytics.ts # User behavior charts (new)
├── retention-cohorts.ts  # Worker retention analysis (new)
├── revenue-breakdown.ts  # Revenue by source (new)
├── invoice-table.tsx     # Invoice management (new)
├── audit-log.tsx         # Audit trail viewer (new)
├── fraud-alerts.tsx      # Fraud detection alerts (new)
└── alert-config.tsx      # Alert configuration (new)
```

### API Routes
```
src/app/api/admin/
├── live-metrics/route.ts   # Real-time metrics endpoint
├── health/route.ts         # System health check
├── geo/route.ts            # Geographic analytics
├── behavior/route.ts       # User behavior data
├── invoices/route.ts       # Invoice management
├── email/send/route.ts     # Email campaign sending
├── security/route.ts       # Security audit data
└── cron/
    ├── admin-reports/route.ts  # Automated reports
    └── smart-alerts/route.ts   # Smart alert checks
```

---

## Key Metrics to Track

### Business Health
- **MRR** (Monthly Recurring Revenue)
- **ARR** (Annual Recurring Revenue)
- **ARPU** (Average Revenue Per User)
- **LTV** (Lifetime Value)
- **CAC** (Customer Acquisition Cost)
- **Churn Rate**

### Platform Health
- **DAU/MAU** (Daily/Monthly Active Users)
- **Booking completion rate**
- **Average time to first booking**
- **Worker utilization rate**
- **Search-to-lead conversion**
- **Platform NPS** (Net Promoter Score)

### Operational Health
- **API uptime**
- **P95 response time**
- **Error rate**
- **Database query latency**
- **Cron job success rate**
- **Queue depth** (pending actions)

---

## Success Criteria

| Metric | Current | Target (3 months) |
|--------|---------|-------------------|
| Admin actions per day | Manual | 50% automated |
| Time to resolve dispute | Unknown | <24 hours |
| Worker churn rate | Unknown | <5%/month |
| Revenue visibility | Monthly | Real-time |
| Fraud detection | Manual | 80% automated |
| Report generation | Manual | Automated daily |
