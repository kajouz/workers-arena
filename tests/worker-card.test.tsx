// @vitest-environment jsdom
/**
 * WorkerCard Business-rate test (docs/fee-rules.md): the Business plan uses
 * the reduced take rate and therefore does not carry a misleading "Fee waived"
 * chip. Mirrors the
 * RespondDialog/BookingDialog render-test pattern; i18n parity covers AR.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { WorkerCard } from "@/components/shared/worker-card";
import { LocaleProvider } from "@/components/providers/locale-provider";
import type { Worker } from "@/lib/data/types";

// next/link — WorkerCard renders the whole card as a Link; in jsdom it would
// need Next's router context, so render a plain anchor instead.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// vitest `globals` is off, so RTL cannot auto-register its cleanup — unmount
// between tests or rendered cards leak into the next case.
afterEach(cleanup);

const baseWorker = {
  slug: "khaled-al-harbi-plumbing",
  nameEn: "Khaled Al-Harbi",
  nameAr: "خالد الحربي",
  categorySlug: "plumbing",
  citySlug: "riyadh",
  hue: 210,
  rating: 4.9,
  reviewCount: 132,
  yearsExp: 12,
  bioEn: "Plumbing expert with 12 years of experience.",
  bioAr: "خبير سباكة بخبرة 12 عاماً.",
  priceMin: 80,
  currency: "USD",
  emergency: false,
  premium: true,
  featured: false,
  verified: false,
} as unknown as Worker;

// No availableThisWeek / responseRate on either fixture — the fee chip must
// render even when the trust-signal row would otherwise be empty.
const enterpriseWorker = {
  ...baseWorker,
  subscription: { plan: "enterprise", status: "active" },
} as unknown as Worker;

const premiumWorker = {
  ...baseWorker,
  subscription: { plan: "premium", status: "active" },
} as unknown as Worker;

function renderCard(worker: Worker) {
  return render(
    <LocaleProvider locale="en" dir="ltr">
      <WorkerCard worker={worker} />
    </LocaleProvider>
  );
}

describe("WorkerCard Business take-rate badge", () => {
  it("does not show a fee-waived chip for Business when the reduced rate applies", () => {
    renderCard(enterpriseWorker);

    expect(screen.queryByText("Fee waived")).not.toBeInTheDocument();
    expect(screen.queryByTitle("No platform fee — covered by the worker's plan.")).not.toBeInTheDocument();
    expect(screen.getByText("Khaled Al-Harbi")).toBeInTheDocument();
  });

  it("does not show the fee chip for a premium worker, while the card still renders", () => {
    renderCard(premiumWorker);

    expect(screen.queryByText("Fee waived")).not.toBeInTheDocument();
    expect(screen.queryByTitle("No platform fee — covered by the worker's plan.")).not.toBeInTheDocument();
    expect(screen.getByText("Khaled Al-Harbi")).toBeInTheDocument();
  });

  it("sits alongside the availability chip when both apply", () => {
    const enterpriseAvailable = {
      ...enterpriseWorker,
      availableThisWeek: true,
    } as unknown as Worker;
    renderCard(enterpriseAvailable);

    expect(screen.queryByText("Fee waived")).not.toBeInTheDocument();
    expect(screen.getByText("Free this week")).toBeInTheDocument();
  });
});
