# Trade × city landing pages — the long tail, generated and kept honest (`docs/ENHANCEMENT-PLAN.md` Phase 2)

Search demand for a marketplace is shaped `{trade} in {city}`: "plumber in Beirut",
"سباك في بيروت". The catalogue already knows both axes — 21 trades, and every city and
area the tenant serves — so that demand is a **matrix**, not a page:

```
/{locale}/trades/{trade}/{city}      →  /en/trades/plumbing/beirut
```

## Why the copy is generated, not written

The trade hub (`/trades/{trade}`) carries a hand-written `TRADE_DESCRIPTIONS` table.
It works, but it only covers the trades someone remembered to write, and every
unlisted trade silently falls back to generic copy — a drift no test can see because
the fallback is valid output.

The cross pages derive their words from the catalogue instead
(`crossLandingCopy` in `src/lib/data/cross-landing.ts`): trade name, the profession
noun, the tagline, the city, the country, and the **real supply count**. Two
consequences worth stating:

- A catalogue change (a renamed trade, a new city) propagates without a copy edit.
- The sentence "3 plumbers available in Beirut" is computed from the same read the
  page lists, so it can never become a stale marketing number.

## The honesty rules are decisions in code

| Rule | Where | Why |
| --- | --- | --- |
| A pair with **no supply is `noindex`** (`follow: true`) | `indexVerdict(supply)` | A page whose content is "nobody here yet" ranks for nothing and teaches a crawler this site pads pages |
| The index floor is **1**, named `MIN_INDEXABLE_SUPPLY` | `cross-landing.ts` | One worker is a real answer to the query; the floor is a policy knob, not a detail |
| A **failed read** is not supply | `indexVerdict` floors `NaN`/negative to 0 | An error must not be read as "we have someone" |
| The **sitemap lists only served pairs** | `src/app/sitemap.ts` | A sitemap entry is a promise that the URL answers the query it is named after |
| Hubs link only to **served** pairs | `/trades/{trade}`, `/cities/{city}` | A hub linking to an empty page is a dead end for the visitor and a soft-404 for the crawler |
| Titles carry **no brand suffix** | `crossLandingCopy` | The app template already appends `· WorkersArena` — the engine used to add its own, rendering the brand twice |

The verdict is computed at **render** time and revalidated daily (`export const
revalidate = 86400`), so supply that appears or disappears flips the verdict without
a deploy. Unlisted pairs still resolve on demand (`dynamicParams` is left default) —
they render honestly and are `noindex`ed if empty, so an internal link never 404s.

## What the page contains

- Breadcrumb (`Home / {trade} / {city}`) with `BreadcrumbList` structured data.
- `h1` = the searched phrase; intro naming the trade's services and the true supply.
- The worker cards for that pair — the same `WorkerCard` the search uses.
- An `ItemList` of the top 10 workers, emitted **only when supply > 0**.
- `FAQPage` structured data for the three questions this page answers (how to find,
  what it costs, what makes them trustworthy) — this is what gives a low-supply page
  something to rank with.
- Area chips linking to `?category=…&city=…&area=…` filtered **search**, deliberately
  not separate area pages: 5 areas × 21 trades is 105 thin pages for a page whose
  content is one filtered list.
- Matrix links in both directions: other trades in this city, this trade elsewhere.
  Ordered by supply (`rankPairsBySupply`) with a deterministic tie-break, so a page
  cannot reshuffle its own internal links between renders and waste the crawl.

## Verified

- `tests/cross-landing.test.ts` — 15 unit tests: the path, the index policy
  (including `NaN` and fractional counts), singular/plural supply copy in both
  languages, the empty page's honest wording, the brand-free title, ranking
  determinism and non-mutation, and the search-link builder.
- Live (dev): `/en/trades/plumbing/beirut` renders the page with the single brand in
  `<title>`, `BreadcrumbList + ItemList + FAQPage` JSON-LD, and the five area chips;
  `/en/trades/interior-design/beirut` (no supply) emits
  `<meta name="robots" content="noindex, follow"/>` while a served pair emits no
  robots tag at all.
