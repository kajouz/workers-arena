// @vitest-environment jsdom
/**
 * Admin activity history (/admin/activity) — the full-history table renders
 * the §Lebanon manual-payment confirms (booking deposit / campaign purchase /
 * paid upgrades) credited to the ACTING ADMIN: confirmManualPaymentAction
 * threads session.name + id, so the entries carry actor="Platform Admin" with
 * actorId="u-admin", which the feed resolves to the demo admin identity
 * (name + email + hue) and the table renders in the Actor column.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ActivityHistoryManager } from "@/components/dashboard/activity-history-manager";
import { LocaleProvider } from "@/components/providers/locale-provider";
import type { ActivityEntry } from "@/lib/data/types";
import type { ActivityPage } from "@/lib/data/activity";

afterEach(() => {
  cleanup();
});

const adminUser = { id: "u-admin", name: "Platform Admin", email: "admin@workersarena.com", hue: 280 };

/** The three manual confirms exactly as the adapters log them (actor = the
 * acting admin, actorId = the admin FK / demo session id). */
const confirms: ActivityEntry[] = [
  {
    id: "act-booking",
    code: "BOOKING_CONFIRMED",
    actionEn: "Khaled Al-Harbi confirmed BK-1001",
    actionAr: "Khaled Al-Harbi أكّد الحجز BK-1001",
    actor: "Platform Admin",
    actorId: "u-admin",
    actorUser: adminUser,
    type: "booking",
    bookingNo: "BK-1001",
    time: "2026-08-17T06:42:38.884Z",
  },
  {
    id: "act-campaign",
    code: "CAMPAIGN_PAID",
    actionEn: "Platform Admin confirmed campaign Beirut Whish 6 (pay-c-10)",
    actionAr: "Platform Admin أكّد دفع حملة بيروت ويش 6 (pay-c-10)",
    actor: "Platform Admin",
    actorId: "u-admin",
    actorUser: adminUser,
    type: "payment",
    time: "2026-08-17T06:46:44.000Z",
  },
  {
    id: "act-purchase",
    code: "PURCHASE_CONFIRMED",
    actionEn: "Platform Admin confirmed featured purchase for Khaled Al-Harbi (pay-pur-1)",
    actionAr: "Platform Admin أكّد شراء featured للعامل خالد الحربي (pay-pur-1)",
    actor: "Platform Admin",
    actorId: "u-admin",
    actorUser: adminUser,
    type: "payment",
    time: "2026-08-17T06:47:39.000Z",
  },
  // A legacy entry WITHOUT a resolvable actorId — the actor column must fall
  // back to the plain mono badge (no avatar/email block).
  {
    id: "act-legacy",
    code: "BOOKING_CANCELLED",
    actionEn: "Khaled Al-Harbi cancelled BK-1002",
    actionAr: "Khaled Al-Harbi ألغى الحجز BK-1002",
    actor: "Khaled Al-Harbi",
    type: "booking",
    bookingNo: "BK-1002",
    time: "2026-08-16T08:13:48.862Z",
  },
];

function makePage(items: ActivityEntry[]): ActivityPage {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

function renderPage(locale: "en" | "ar" = "en", items: ActivityEntry[] = confirms) {
  return render(
    <LocaleProvider locale={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <ActivityHistoryManager initial={makePage(items)} />
    </LocaleProvider>
  );
}

describe("ActivityHistoryManager — manual-payment confirms (admin identity)", () => {
  it("renders all three manual-confirm codes (BOOKING_CONFIRMED / CAMPAIGN_PAID / PURCHASE_CONFIRMED)", () => {
    renderPage("en");
    expect(screen.getByText("BOOKING_CONFIRMED")).toBeInTheDocument();
    expect(screen.getByText("CAMPAIGN_PAID")).toBeInTheDocument();
    expect(screen.getByText("PURCHASE_CONFIRMED")).toBeInTheDocument();
  });

  it("credits every manual confirm to the acting admin: name + email in the Actor column", () => {
    renderPage("en");
    // One avatar block per resolved confirm (3 rows × admin identity).
    expect(screen.getAllByText("Platform Admin").length).toBe(3);
    expect(screen.getAllByText("admin@workersarena.com").length).toBe(3);
    // The events themselves are present too.
    expect(screen.getByText("Khaled Al-Harbi confirmed BK-1001")).toBeInTheDocument();
    expect(screen.getByText(/confirmed campaign Beirut Whish 6/)).toBeInTheDocument();
    expect(screen.getByText(/confirmed featured purchase for Khaled Al-Harbi/)).toBeInTheDocument();
  });

  it("deep-links the booking confirm to its admin dispute view", () => {
    renderPage("en");
    const link = screen.getByRole("link", { name: "Khaled Al-Harbi confirmed BK-1001" });
    expect(link).toHaveAttribute("href", "/admin/bookings/BK-1001");
  });

  it("falls back to the mono actor badge for entries without a resolvable actorId", () => {
    renderPage("en");
    const badge = screen.getByText("Khaled Al-Harbi");
    expect(badge.className).toContain("font-mono");
    // The three admin rows must not render the fallback badge for the admin.
    expect(screen.getAllByText("Platform Admin").length).toBe(3);
  });

  it("localizes the event copy in Arabic while keeping the admin identity", () => {
    renderPage("ar");
    expect(screen.getByText("Khaled Al-Harbi أكّد الحجز BK-1001")).toBeInTheDocument();
    // The admin identity appears at least once in the actor column (and may
    // also ride the campaign action copy, which starts with the actor name).
    expect(screen.getAllByText("Platform Admin").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("admin@workersarena.com").length).toBe(3);
  });
});
