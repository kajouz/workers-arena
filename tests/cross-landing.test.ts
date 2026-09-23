import { describe, expect, it } from "vitest";
import {
  MIN_INDEXABLE_SUPPLY,
  crossLandingCopy,
  crossLandingPath,
  crossLandingSearchHref,
  indexVerdict,
  rankPairsBySupply,
  type CrossLandingInput,
} from "../src/lib/data/cross-landing";

const category = {
  slug: "plumbing",
  nameEn: "Plumbing",
  nameAr: "سباكة",
  professionEn: "plumber",
  professionAr: "سباك",
  taglineEn: "Leaks, pipes, water heaters",
  taglineAr: "تسريبات، مواسير، سخانات",
};

const city = { slug: "beirut", nameEn: "Beirut", nameAr: "بيروت" };
const country = { nameEn: "Lebanon", nameAr: "لبنان" };

function input(overrides: Partial<CrossLandingInput> = {}): CrossLandingInput {
  return { category, city, country, supply: 3, locale: "en", ...overrides };
}

describe("crossLandingPath", () => {
  it("is locale-prefixed and trade-first", () => {
    expect(crossLandingPath("en", "plumbing", "beirut")).toBe("/en/trades/plumbing/beirut");
    expect(crossLandingPath("ar", "plumbing", "beirut")).toBe("/ar/trades/plumbing/beirut");
  });
});

describe("indexVerdict", () => {
  it("indexes a served pair and refuses an unserved one", () => {
    expect(indexVerdict(1)).toEqual({ indexable: true, reason: "served" });
    expect(indexVerdict(12)).toEqual({ indexable: true, reason: "served" });
    expect(indexVerdict(0)).toEqual({ indexable: false, reason: "no-supply" });
  });

  it("treats junk supply as none rather than as a reason to index", () => {
    // A NaN or negative count means the read failed, not that there is supply.
    expect(indexVerdict(Number.NaN).indexable).toBe(false);
    expect(indexVerdict(-4).indexable).toBe(false);
    expect(indexVerdict(0.9).indexable).toBe(false); // 0.9 floors to 0
  });

  it("pins the policy floor as a constant that matches the verdict", () => {
    expect(indexVerdict(MIN_INDEXABLE_SUPPLY).indexable).toBe(true);
    expect(indexVerdict(MIN_INDEXABLE_SUPPLY - 1).indexable).toBe(false);
  });
});

describe("crossLandingCopy", () => {
  it("leads the English page with the searched phrase", () => {
    const copy = crossLandingCopy(input());
    expect(copy.heading).toBe("plumber in Beirut");
    expect(copy.title).toContain("plumber in Beirut");
    expect(copy.description).toContain("Beirut, Lebanon");
  });

  it("leads the Arabic page with the searched phrase", () => {
    const copy = crossLandingCopy(input({ locale: "ar" }));
    expect(copy.heading).toBe("سباك في بيروت");
    expect(copy.title).toContain("سباك في بيروت");
    expect(copy.description).toContain("بيروت، لبنان");
  });

  it("states the REAL supply count, singular and plural", () => {
    expect(crossLandingCopy(input({ supply: 1 })).intro).toContain("1 plumber available in Beirut");
    expect(crossLandingCopy(input({ supply: 3 })).intro).toContain("3 plumbers available in Beirut");
    expect(crossLandingCopy(input({ supply: 1, locale: "ar" })).intro).toContain("1 سباك متاح في بيروت");
    expect(crossLandingCopy(input({ supply: 4, locale: "ar" })).intro).toContain("4 سباك متاحون في بيروت");
  });

  it("does not pretend an unserved pair is served", () => {
    const copy = crossLandingCopy(input({ supply: 0 }));
    expect(copy.intro).toContain("No plumbers listed in Beirut yet");
    expect(copy.workersHeading).toContain("coming soon");
    // The page still answers the question — the FAQ is the content of an empty page.
    expect(copy.faq.length).toBeGreaterThanOrEqual(3);
    expect(crossLandingCopy(input({ supply: 0, locale: "ar" })).intro).toContain("لا يوجد سباك مسجّل في بيروت بعد");
  });

  it("floors a fractional or failed count instead of printing it", () => {
    expect(crossLandingCopy(input({ supply: 2.7 })).intro).toContain("2 plumbers");
    expect(crossLandingCopy(input({ supply: Number.NaN })).intro).not.toContain("NaN");
  });

  it("names the trade's own services in every language of the page", () => {
    expect(crossLandingCopy(input()).intro).toContain("leaks, pipes, water heaters");
    expect(crossLandingCopy(input({ locale: "ar" })).intro).toContain("تسريبات، مواسير، سخانات");
  });

  it("carries no brand of its own — the metadata template appends it", () => {
    // Regression: the engine used to end the title with "| WorkersArena", which
    // rendered as "… | WorkersArena · WorkersArena" under the app template.
    expect(crossLandingCopy(input()).title).not.toContain("WorkersArena");
    expect(crossLandingCopy(input({ locale: "ar" })).title).not.toContain("وركرز أرينا");
  });

  it("covers the areas block heading for the city", () => {
    expect(crossLandingCopy(input()).areasHeading).toBe("Areas of Beirut we cover");
    expect(crossLandingCopy(input({ locale: "ar" })).areasHeading).toBe("مناطق بيروت التي نغطيها");
  });
});

describe("rankPairsBySupply", () => {
  it("puts the deepest supply first and breaks ties deterministically", () => {
    const ranked = rankPairsBySupply([
      { categorySlug: "painting", citySlug: "beirut", supply: 1 },
      { categorySlug: "plumbing", citySlug: "beirut", supply: 4 },
      { categorySlug: "cleaning", citySlug: "beirut", supply: 4 },
    ]);
    expect(ranked.map((p) => p.categorySlug)).toEqual(["cleaning", "plumbing", "painting"]);
    // Same input, same output — a page that reshuffles its own links wastes crawl.
    expect(rankPairsBySupply(ranked).map((p) => p.categorySlug)).toEqual(["cleaning", "plumbing", "painting"]);
  });

  it("does not mutate the caller's array", () => {
    const pairs = [
      { categorySlug: "a", citySlug: "x", supply: 1 },
      { categorySlug: "b", citySlug: "x", supply: 9 },
    ];
    rankPairsBySupply(pairs);
    expect(pairs[0].categorySlug).toBe("a");
  });
});

describe("crossLandingSearchHref", () => {
  it("narrows to the category and city, and to an area when given one", () => {
    expect(crossLandingSearchHref({ categorySlug: "plumbing", citySlug: "beirut" })).toBe(
      "/search?category=plumbing&city=beirut"
    );
    expect(
      crossLandingSearchHref({ categorySlug: "plumbing", citySlug: "beirut", areaSlug: "achrafieh" })
    ).toBe("/search?category=plumbing&city=beirut&area=achrafieh");
  });
});
