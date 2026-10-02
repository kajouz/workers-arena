#!/usr/bin/env python3
"""
WorkersArena — 3-year simulation of a pure SaaS model (docs/SAAS-MODEL-STUDY.md).

The SaaS model:
  * workers pay a monthly / annual subscription (no commission, no lead fees);
  * customers use the platform free and contact workers DIRECTLY (call /
    WhatsApp) — the platform never holds job money, no deposits, no admin in
    the customer <-> worker interaction;
  * companies buy prepaid ad packages;
  * every payment (subscriptions, featured add-on, ads) goes through OMT / Whish
    and is confirmed by the admin (workflow v2).

It is compared with the CURRENT hybrid model (the same subscriptions PLUS a take
rate on jobs paid through the platform and paid leads), on the same worker base.

Run:  python3 docs/simulations/saas_model_simulation.py   (stdlib only)
All figures are USD per month unless stated. Every number below is an
ASSUMPTION to be replaced with real data as it accumulates.
"""
from __future__ import annotations

import random
import statistics

MONTHS = 36

# --------------------------------------------------------------------------- #
# Scenario assumptions (conservative / base / optimistic)
# --------------------------------------------------------------------------- #
SCENARIOS = {
    "conservative": dict(
        signups_m1=25, signup_growth=0.03,        # new worker sign-ups per month, monthly growth of that flow
        conv_new=0.08, conv_free_monthly=0.005,   # share of new sign-ups that become paid; monthly upgrade of the free base
        churn_paid=0.07,                           # monthly churn of paying workers (manual OMT/Whish renewal)
        annual_share=0.20,                         # paying workers on annual plans
        featured_take=0.05,                        # share of paid workers buying a featured slot
        adv_new_m=1.0, adv_spend=60, adv_churn=0.15,
        ads_start_paid=200,                        # ads only sell once this many paid workers make traffic credible
        # current-model comparison (transactional streams on top of subscriptions)
        jobs_per_paid=1.0, on_platform=0.20, job_value=60, take=0.07, lead_rev_per_paid=3.0,
        cac=15,                                    # acquisition cost per NEW PAYING worker (agents, ads)
    ),
    "base": dict(
        signups_m1=40, signup_growth=0.05,
        conv_new=0.12, conv_free_monthly=0.01,
        churn_paid=0.05,
        annual_share=0.30,
        featured_take=0.08,
        adv_new_m=2.0, adv_spend=100, adv_churn=0.12,
        ads_start_paid=150,
        jobs_per_paid=2.0, on_platform=0.30, job_value=60, take=0.07, lead_rev_per_paid=6.0,
        cac=12,
    ),
    "optimistic": dict(
        signups_m1=60, signup_growth=0.07,
        conv_new=0.18, conv_free_monthly=0.015,
        churn_paid=0.035,
        annual_share=0.40,
        featured_take=0.10,
        adv_new_m=4.0, adv_spend=150, adv_churn=0.10,
        ads_start_paid=100,
        jobs_per_paid=3.0, on_platform=0.40, job_value=70, take=0.07, lead_rev_per_paid=9.0,
        cac=10,
    ),
}

# Common assumptions
ADDRESSABLE_WORKERS = 15_000       # digitally reachable tradespeople in Lebanon (assumption)
MAX_SIGNUP_SHARE = 0.03            # at most 3% of the remaining pool joins in a month
PLANS = {"basic": (10, 0.50), "pro": (20, 0.40), "business": (45, 0.10)}  # price/mo, share of payers
ANNUAL_FACTOR = 10 / 12            # annual = pay 10 months, get 12
FEATURED_PRICE = 25                # per slot per month
FEATURED_INVENTORY = 225           # 25 categories x 3 cities x 3 slots (scarce on purpose)
OMT_WHISH_FEE = 0.01               # receiving cost on manual rails (assumption — verify with providers)
MINUTES_PER_CONFIRMATION = 3       # admin time per OMT/Whish payment (workflow v2 evidence entry)
ADMIN_MONTHLY_COST = 800           # one full-time admin/ops person in Lebanon
ADMIN_MINUTES_PER_MONTH = 160 * 60 # one FTE
# Fixed overhead: hosting, SMS/WhatsApp, developer maintenance, marketing baseline — by year
FIXED_COST_BY_YEAR = {1: 2_500, 2: 3_500, 3: 4_500}
# Extra ops for the current (hybrid) model: every on-platform job = deposit + balance
# confirmations, refunds, dunning and disputes.
HYBRID_PAYMENTS_PER_JOB = 2.0
HYBRID_DISPUTE_COST_PER_JOB = 0.50  # support time on disputes/refunds/dunning, per on-platform job

BLENDED_PRICE = sum(price * share for price, share in PLANS.values())


def simulate(p: dict, model: str = "saas") -> dict:
    """Monthly simulation. model = 'saas' | 'hybrid'."""
    free = paid = advertisers = 0.0
    signed_up = 0.0
    signups = p["signups_m1"]
    months = []
    cum_profit = 0.0
    breakeven = None
    for m in range(1, MONTHS + 1):
        year = (m - 1) // 12 + 1
        # --- supply --------------------------------------------------------
        remaining = max(ADDRESSABLE_WORKERS - signed_up, 0)
        new = min(signups, remaining * MAX_SIGNUP_SHARE)
        signed_up += new
        new_paid = new * p["conv_new"] + free * p["conv_free_monthly"]
        free = free + new * (1 - p["conv_new"]) - free * p["conv_free_monthly"]
        churned = paid * p["churn_paid"]
        paid = paid + new_paid - churned
        free += churned * 0.5  # half of churned payers stay listed for free
        signups *= 1 + p["signup_growth"]

        # --- revenue -------------------------------------------------------
        monthly_payers = paid * (1 - p["annual_share"])
        annual_payers = paid * p["annual_share"]
        subs = monthly_payers * BLENDED_PRICE + annual_payers * BLENDED_PRICE * ANNUAL_FACTOR
        featured = min(paid * p["featured_take"], FEATURED_INVENTORY) * FEATURED_PRICE
        if paid >= p["ads_start_paid"]:
            advertisers = advertisers * (1 - p["adv_churn"]) + p["adv_new_m"] * (1 + 0.04 * (m // 3))
        ads = advertisers * p["adv_spend"]
        transactional = 0.0
        on_platform_jobs = 0.0
        if model == "hybrid":
            on_platform_jobs = paid * p["jobs_per_paid"] * p["on_platform"]
            transactional = on_platform_jobs * p["job_value"] * p["take"] + paid * p["lead_rev_per_paid"]
        revenue = subs + featured + ads + transactional

        # --- costs ---------------------------------------------------------
        confirmations = monthly_payers + annual_payers / 12 + advertisers + paid * p["featured_take"]
        if model == "hybrid":
            confirmations += on_platform_jobs * HYBRID_PAYMENTS_PER_JOB + paid * 0.5  # + credit top-ups
        admin_minutes = confirmations * MINUTES_PER_CONFIRMATION
        admin_cost = max(1, -(-admin_minutes // ADMIN_MINUTES_PER_MONTH)) * ADMIN_MONTHLY_COST
        rail_fees = revenue * OMT_WHISH_FEE
        acquisition = new_paid * p["cac"]
        disputes = on_platform_jobs * HYBRID_DISPUTE_COST_PER_JOB if model == "hybrid" else 0.0
        costs = FIXED_COST_BY_YEAR[year] + admin_cost + rail_fees + acquisition + disputes
        profit = revenue - costs
        cum_profit += profit
        if breakeven is None and profit > 0:
            breakeven = m
        months.append(
            dict(m=m, free=free, paid=paid, advertisers=advertisers, subs=subs, featured=featured, ads=ads,
                 transactional=transactional, revenue=revenue, costs=costs, profit=profit, cum_profit=cum_profit,
                 confirmations=confirmations, admins=admin_cost / ADMIN_MONTHLY_COST)
        )
    return dict(months=months, breakeven=breakeven)


def yearly(months: list[dict], key: str, year: int) -> float:
    return sum(r[key] for r in months[(year - 1) * 12 : year * 12])


def money(x: float) -> str:
    return f"${x:,.0f}"


def scenario_table(model: str) -> str:
    out = ["| Scenario | | Year 1 | Year 2 | Year 3 | 3-year total |", "|---|---|---|---|---|---|"]
    for name, p in SCENARIOS.items():
        r = simulate(p, model)["months"]
        rev = [yearly(r, "revenue", y) for y in (1, 2, 3)]
        prof = [yearly(r, "profit", y) for y in (1, 2, 3)]
        out.append(f"| {name} | revenue | " + " | ".join(money(v) for v in rev) + f" | {money(sum(rev))} |")
        out.append(f"| | profit | " + " | ".join(money(v) for v in prof) + f" | {money(sum(prof))} |")
    return "\n".join(out)


def detail_table(name: str) -> str:
    p = SCENARIOS[name]
    r = simulate(p, "saas")
    out = [
        "| Month | Paying workers | Free listed | Advertisers | Subscriptions | Featured | Ads | Revenue/mo | Costs/mo | Profit/mo | Payments to confirm/mo | Admins |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for row in r["months"]:
        if row["m"] in (1, 3, 6, 9, 12, 18, 24, 30, 36):
            out.append(
                f"| {row['m']} | {row['paid']:.0f} | {row['free']:.0f} | {row['advertisers']:.0f} | {money(row['subs'])} | "
                f"{money(row['featured'])} | {money(row['ads'])} | {money(row['revenue'])} | {money(row['costs'])} | "
                f"{money(row['profit'])} | {row['confirmations']:.0f} | {row['admins']:.0f} |"
            )
    out.append(f"\nFirst profitable month: **{r['breakeven'] or 'not within 36 months'}**.")
    return "\n".join(out)


def mix_table(name: str) -> str:
    r = simulate(SCENARIOS[name], "saas")["months"]
    tot = {k: sum(x[k] for x in r) for k in ("subs", "featured", "ads", "revenue")}
    return (
        "| Stream | 3-year revenue | Share |\n|---|---|---|\n"
        + "\n".join(
            f"| {label} | {money(tot[k])} | {tot[k] / tot['revenue']:.0%} |"
            for k, label in (("subs", "Worker subscriptions"), ("featured", "Featured slots"), ("ads", "Company ads"))
        )
    )


def monte_carlo(runs: int = 5000, seed: int = 7) -> str:
    rng = random.Random(seed)
    lo, hi = SCENARIOS["conservative"], SCENARIOS["optimistic"]
    rev3, y1, y3, mrr36, cum, be = [], [], [], [], [], []
    for _ in range(runs):
        p = {k: rng.uniform(min(lo[k], hi[k]), max(lo[k], hi[k])) for k in lo}
        r = simulate(p, "saas")
        ms = r["months"]
        y1.append(yearly(ms, "revenue", 1))
        y3.append(yearly(ms, "revenue", 3))
        rev3.append(sum(x["revenue"] for x in ms))
        mrr36.append(ms[-1]["revenue"])
        cum.append(ms[-1]["cum_profit"])
        be.append(r["breakeven"] or 99)

    def pct(xs, q):
        xs = sorted(xs)
        return xs[int(q * (len(xs) - 1))]

    rows = [("Year-1 revenue", y1), ("Year-3 revenue", y3), ("3-year revenue", rev3), ("Monthly revenue at month 36", mrr36), ("3-year cumulative profit", cum)]
    out = ["| Measure | Pessimistic (P10) | Most likely (P50) | Good case (P90) |", "|---|---|---|---|"]
    for label, xs in rows:
        out.append(f"| {label} | {money(pct(xs, 0.10))} | {money(pct(xs, 0.50))} | {money(pct(xs, 0.90))} |")
    never = sum(1 for b in be if b == 99) / runs
    out.append(
        f"| First profitable month | {'never' if pct(be, 0.9) == 99 else pct(be, 0.9)} | {pct(be, 0.5) if pct(be, 0.5) != 99 else 'never'} | {pct(be, 0.1)} |"
    )
    out.append(f"\nShare of runs never profitable within 36 months: **{never:.0%}**. Runs: {runs}.")
    return "\n".join(out)


def comparison_table() -> str:
    out = ["| Scenario | Pure SaaS 3-yr revenue | Current hybrid 3-yr revenue | SaaS 3-yr profit | Hybrid 3-yr profit | Hybrid admins needed at month 36 |", "|---|---|---|---|---|---|"]
    for name, p in SCENARIOS.items():
        s = simulate(p, "saas")["months"]
        h = simulate(p, "hybrid")["months"]
        out.append(
            f"| {name} | {money(sum(x['revenue'] for x in s))} | {money(sum(x['revenue'] for x in h))} | "
            f"{money(s[-1]['cum_profit'])} | {money(h[-1]['cum_profit'])} | {h[-1]['admins']:.0f} (SaaS: {s[-1]['admins']:.0f}) |"
        )
    return "\n".join(out)


def sensitivity() -> str:
    base = SCENARIOS["base"]
    ref = sum(x["revenue"] for x in simulate(base, "saas")["months"])
    out = ["| Change (base scenario, one at a time) | 3-year revenue | vs base |", "|---|---|---|"]
    tests = [
        ("Monthly churn 5% → 8%", "churn_paid", 0.08),
        ("Monthly churn 5% → 3%", "churn_paid", 0.03),
        ("Conversion of new sign-ups 12% → 8%", "conv_new", 0.08),
        ("Conversion of new sign-ups 12% → 18%", "conv_new", 0.18),
        ("Annual plans 30% → 50%", "annual_share", 0.50),
        ("Sign-ups 40/mo → 25/mo", "signups_m1", 25),
        ("Ad spend $100 → $60/advertiser", "adv_spend", 60),
    ]
    for label, key, val in tests:
        p = dict(base, **{key: val})
        v = sum(x["revenue"] for x in simulate(p, "saas")["months"])
        out.append(f"| {label} | {money(v)} | {(v - ref) / ref:+.0%} |")
    return "\n".join(out)


if __name__ == "__main__":
    print(f"Blended subscription price: ${BLENDED_PRICE:.2f}/month\n")
    print("## Pure SaaS — three scenarios\n")
    print(scenario_table("saas"))
    print("\n## Base scenario month by month\n")
    print(detail_table("base"))
    print("\n## Base scenario revenue mix\n")
    print(mix_table("base"))
    print("\n## Uncertainty range (Monte Carlo)\n")
    print(monte_carlo())
    print("\n## Pure SaaS vs current hybrid model\n")
    print(comparison_table())
    print("\n## What moves the result most\n")
    print(sensitivity())
