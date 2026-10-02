# WorkersArena — Study: a pure SaaS subscription model (OMT/Whish, direct contact)

[← Back to docs index](README.md)

> **Status:** study and simulation only — **nothing in the application has been changed** for this model. Date: 2026-10-02.
> **Reproduce / re-run with your own numbers:** `python3 docs/simulations/saas_model_simulation.py` (Python 3, no dependencies). Every number in this document is an **assumption**; replace them with real figures as soon as the platform has them.

---

## 1. The model being studied

| | Today (hybrid marketplace) | Proposed pure SaaS |
|---|---|---|
| Worker pays | Subscription **+** commission on platform-paid jobs **+** lead purchases | **Subscription only** (Basic $10 · Pro $20 · Business $45 per month; annual = 10 months for 12) + optional Featured slot $25/month |
| Customer pays | Deposit and balance through the platform | **Nothing to the platform** — pays the worker directly (cash, OMT, Whish, as they agree) |
| Customer ⇄ worker | Booking, deposit, settlement, disputes, guarantee — the platform and the admin sit in the middle | **Direct**: the customer calls or WhatsApps the worker; the platform is a directory and a toolbox (profile, calendar, reviews, quotes) |
| Companies | Ads (OMT/Whish) | Ads, prepaid packages (OMT/Whish) |
| Admin's money work | Subscriptions, credits, upgrades, ads, **every deposit, every balance, refunds, dunning, disputes, payouts** | **Subscriptions, featured slots and ads only** |

All payments to the platform go through OMT/Whish and are confirmed with evidence (amount + transaction number) as built in workflow v2 — that part does not change.

## 2. Key assumptions

| Assumption | Conservative | Base | Optimistic |
|---|---|---|---|
| New worker sign-ups, month 1 (then growing monthly) | 25 (+3%/mo) | 40 (+5%/mo) | 60 (+7%/mo) |
| Share of new sign-ups that start paying | 8% | 12% | 18% |
| Free workers upgrading each month | 0.5% | 1% | 1.5% |
| Paying workers leaving each month (churn) | 7% | 5% | 3.5% |
| Paying workers on annual plans | 20% | 30% | 40% |
| Paying workers buying a Featured slot | 5% | 8% | 10% |
| New advertisers per month (once traffic is credible) | 1 | 2 | 4 |
| Average ad spend per advertiser per month | $60 | $100 | $150 |
| Acquisition cost per new paying worker | $15 | $12 | $10 |

Common: blended subscription price **$17.50/month** (50% Basic, 40% Pro, 10% Business) · reachable tradespeople in Lebanon 15,000 · OMT/Whish receiving cost 1% **[verify]** · 3 minutes of admin time per payment confirmation · one full-time admin $800/month · fixed costs (hosting, messaging, developer maintenance, baseline marketing) $2,500/month in year 1, $3,500 in year 2, $4,500 in year 3.

For the comparison with today's model, the hybrid adds: jobs per paying worker per month 1 / 2 / 3, share of those paid through the platform 20% / 30% / 40%, average job $60–70, 7% commission, lead sales $3 / $6 / $9 per paying worker per month, two extra payment confirmations per platform-paid job and $0.50 of dispute/refund handling per job.

## 3. Results

Blended subscription price: $17.50/month

### Pure SaaS — three scenarios

| Scenario | | Year 1 | Year 2 | Year 3 | 3-year total |
|---|---|---|---|---|---|
| conservative | revenue | $3,049 | $9,894 | $19,271 | $32,213 |
| | profit | $-37,133 | $-42,878 | $-46,331 | $-126,342 |
| base | revenue | $9,000 | $41,779 | $107,759 | $158,539 |
| | profit | $-31,931 | $-13,225 | $37,010 | $-8,146 |
| optimistic | revenue | $34,573 | $167,110 | $360,316 | $562,000 |
| | profit | $-7,905 | $106,708 | $279,949 | $378,752 |

### Base scenario month by month

| Month | Paying workers | Free listed | Advertisers | Subscriptions | Featured | Ads | Revenue/mo | Costs/mo | Profit/mo | Payments to confirm/mo | Admins |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 5 | 35 | 0 | $80 | $10 | $0 | $89 | $3,358 | $-3,269 | 4 | 1 |
| 3 | 15 | 110 | 0 | $257 | $31 | $0 | $288 | $3,375 | $-3,087 | 12 | 1 |
| 6 | 34 | 236 | 0 | $570 | $69 | $0 | $639 | $3,403 | $-2,764 | 28 | 1 |
| 9 | 57 | 379 | 0 | $944 | $114 | $0 | $1,058 | $3,435 | $-2,377 | 46 | 1 |
| 12 | 83 | 543 | 0 | $1,387 | $167 | $0 | $1,554 | $3,472 | $-1,918 | 67 | 1 |
| 18 | 151 | 948 | 2 | $2,514 | $302 | $248 | $3,065 | $4,567 | $-1,503 | 124 | 1 |
| 24 | 243 | 1482 | 13 | $4,042 | $486 | $1,257 | $5,785 | $4,701 | $1,084 | 208 | 1 |
| 30 | 367 | 2193 | 18 | $6,095 | $733 | $1,797 | $8,625 | $5,871 | $2,755 | 313 | 1 |
| 36 | 532 | 3138 | 21 | $8,846 | $1,064 | $2,119 | $12,029 | $6,093 | $5,936 | 450 | 1 |

First profitable month: **22**.

### Base scenario revenue mix

| Stream | 3-year revenue | Share |
|---|---|---|
| Worker subscriptions | $117,299 | 74% |
| Featured slots | $14,111 | 9% |
| Company ads | $27,129 | 17% |

### Uncertainty range (Monte Carlo)

| Measure | Pessimistic (P10) | Most likely (P50) | Good case (P90) |
|---|---|---|---|
| Year-1 revenue | $6,282 | $9,770 | $14,529 |
| Year-3 revenue | $75,084 | $117,987 | $173,753 |
| 3-year revenue | $108,530 | $174,772 | $260,235 |
| Monthly revenue at month 36 | $8,485 | $13,015 | $19,246 |
| 3-year cumulative profit | $-54,899 | $6,901 | $85,071 |
| First profitable month | 30 | 21 | 17 |

Share of runs never profitable within 36 months: **1%**. Runs: 5000.

### Pure SaaS vs current hybrid model

| Scenario | Pure SaaS 3-yr revenue | Current hybrid 3-yr revenue | SaaS 3-yr profit | Hybrid 3-yr profit | Hybrid admins needed at month 36 |
|---|---|---|---|---|---|
| conservative | $32,213 | $39,022 | $-126,342 | $-119,779 | 1 (SaaS: 1) |
| base | $158,539 | $218,653 | $-8,146 | $49,250 | 1 (SaaS: 1) |
| optimistic | $562,000 | $880,704 | $378,752 | $672,619 | 2 (SaaS: 1) |

### What moves the result most

| Change (base scenario, one at a time) | 3-year revenue | vs base |
|---|---|---|
| Monthly churn 5% → 8% | $132,623 | -16% |
| Monthly churn 5% → 3% | $180,069 | +14% |
| Conversion of new sign-ups 12% → 8% | $129,849 | -18% |
| Conversion of new sign-ups 12% → 18% | $198,799 | +25% |
| Annual plans 30% → 50% | $154,423 | -3% |
| Sign-ups 40/mo → 25/mo | $98,230 | -38% |
| Ad spend $100 → $60/advertiser | $147,687 | -7% |


## 4. What the numbers say, in plain English

- **It is a slow, steady business, not a fast one.** In the base case the platform earns about **$9K in year 1, $42K in year 2 and $108K in year 3** (≈ $159K over three years), reaching about **$12K a month by month 36** with ~530 paying workers. It turns its first profitable month around **month 21–22** and roughly breaks even over the three years.
- **The range is wide.** Across 5,000 randomized runs the three-year revenue is most likely around **$175K**, with a pessimistic case near **$110K** and a good case near **$260K**. The conservative scenario (slow sign-ups, high churn) loses money for all three years — this is a real possibility, not a formality.
- **Subscriptions carry the business (≈ 74%)**, ads ≈ 17%, featured slots ≈ 9%. Ads only start once there are enough paying workers (about 150) to make the traffic credible to companies.
- **What moves the result most** is the number of workers who sign up and the share who start paying; churn is next. Price matters less than volume at these levels.
- **Versus today's hybrid model**, the pure SaaS model gives up roughly **17–36% of revenue** (commission and lead sales) depending on the scenario — about $60K over three years in the base case (−27%). In return it removes almost all money-handling risk and admin work on jobs (deposits, balances, refunds, disputes, payouts, bad debt), which the simulation only partly prices in.
- **Admin workload stays small:** about 450 OMT/Whish confirmations a month by month 36 in the base case — roughly 20–25 hours of one person's month. The hybrid model would need a second admin in the optimistic case.

## 5. Risks, in plain English

| Risk | What could happen | How to reduce it |
|---|---|---|
| **Workers don't see the value** | With no bookings or payments going through the platform, a worker cannot see which jobs came from it, so many cancel after a month or two (high churn). | Show every worker a monthly report: profile views, calls and WhatsApp taps, quote requests. Count "contact taps" as the proof of value. |
| **Free listing is too good** | If free workers show their phone number, few will pay. | Keep the free listing, but show phone/WhatsApp only for paying workers (or a few contacts per month for free ones); paying workers rank first. |
| **Manual monthly renewals** | Paying by OMT/Whish every month is a chore; people forget and drop off. | Push annual and 6-month plans, the in-app wallet, WhatsApp reminders 7/3/1 days before expiry, and a short grace period. |
| **Customers lose protection** | No deposit, no guarantee, no dispute help — a bad job is between the customer and the worker. Trust in the platform can suffer. | Verified badges, reviews only from phone-verified customers, quick removal of bad workers, a clear "report a worker" button. Say plainly that payment is between customer and worker. |
| **Fake reviews** | Without bookings through the platform, it is harder to prove a review is from a real customer. | OTP-verified phone for reviewers, the worker confirms "I did a job for this number", moderation (already built). |
| **Ad revenue depends on traffic** | Companies only pay for ads once many customers visit. If traffic is low, ads stay near zero. | Sell small prepaid packages first, publish traffic numbers, start with local suppliers that already serve tradespeople. |
| **Competition** | Facebook groups, OLX, WhatsApp groups and word of mouth are free. | Be better at what they do badly: verified workers, reviews, search by area/availability, emergency workers 24/7. |
| **Economy and currency** | Lebanon's economy and the USD/LBP situation can cut what workers are willing to pay. | Keep prices low ($10 entry), allow LBP payments at a published rate, offer category discounts for low-income trades. |
| **Admin dependency** | Every payment still needs a person to confirm it; one admin is a single point of failure and of error. | Workflow v2 evidence + audit CSV; ask OMT/Whish for statement exports; add a second admin when volume grows. |
| **Legal / tax** | Selling subscriptions and ads is simpler than handling job money, but invoices and VAT still apply. | Keep the WA- invoices (already built); confirm VAT obligations with an accountant. |

**Risks that go away** with this model: holding customers' money, deposits that are not paid, balances that are not paid, refunds and overpayments on jobs, disputes about job payment, worker payouts, unpaid commission on cash jobs, and fraud around job payments. This is the main advantage.

## 6. Recommendation

1. **The SaaS model is viable but modest.** It is lower-risk and much simpler to operate than today's model, but it earns less and depends heavily on how many workers sign up and stay. Plan for the base case (about $160K over three years, first profitable month around month 21–22) and be ready for the conservative one.
2. **Do not delete the marketplace features — switch them off.** Commission, deposits and leads can be turned back on later for workers who want them (for example a "Bookings & payments" add-on), without rebuilding.
3. **Test before switching everyone:** run the SaaS offer in one or two categories or cities for 3 months and measure three numbers — the share of sign-ups who pay, monthly churn, and contact taps per paying worker. Re-run this simulation with those real numbers before deciding.
4. **Decisions needed before any change:** subscription prices; what free workers can and cannot show (phone visibility); whether to keep paid leads as a plan feature; whether to keep a "pay through the platform" option for customers who want protection; and the ad packages and prices.

## 7. What would change in the application (not done — for a later implementation plan)

Most of it is switching things off rather than building: commission set to 0% for all plans, deposits and the balance/settlement flow disabled, the lead marketplace folded into plans, the guarantee hidden, contact details shown directly (respecting the free/paid rule), and a worker "contact taps" report added. Subscription, featured-slot and ad payments keep the existing OMT/Whish workflow v2. A detailed, tested change plan should be written once the decisions in §6 are made.
