// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewSolicitation } from "../src/components/bookings/review-solicitation";
import { LocaleProvider } from "../src/components/providers/locale-provider";

/**
 * The prompt's contract: it says what it is about, it links to the review form
 * on the right profile, and "Not now" hides THIS ask without hiding the others.
 */

afterEach(() => {
  cleanup();
});

function renderPrompt(items: Parameters<typeof ReviewSolicitation>[0]["items"], locale: "en" | "ar" = "en") {
  return render(
    <LocaleProvider locale={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <ReviewSolicitation items={items} />
    </LocaleProvider>
  );
}

const item = {
  bookingId: "bk-1",
  workerName: "Khaled Al-Harbi",
  workerSlug: "khaled-al-harbi-plumbing",
  jobTitle: "Leak repair",
  stage: "first" as const,
  daysSinceCompletion: 0,
};

describe("ReviewSolicitation", () => {
  it("names the worker and the job, and links to the review form on the profile", () => {
    renderPrompt([item]);
    expect(screen.getByText(/how did Khaled Al-Harbi do/i)).toBeTruthy();
    const cta = screen.getByRole("link", { name: /rate the job/i });
    // The locale comes from the <Link> itself — exactly one prefix, never two.
    expect(cta.getAttribute("href")).toBe("/en/workers/khaled-al-harbi-plumbing#reviews");
  });

  it("renders the reminder wording for a job nobody answered", () => {
    renderPrompt([{ ...item, stage: "reminder", daysSinceCompletion: 6 }]);
    expect(screen.getByText(/Reminder: how was your experience/i)).toBeTruthy();
  });

  it("writes Arabic copy on the Arabic page", () => {
    renderPrompt([item], "ar");
    expect(screen.getByText(/كيف كان/)).toBeTruthy();
    const cta = screen.getByRole("link", { name: "قيّم التجربة" });
    expect(cta.getAttribute("href")).toBe("/ar/workers/khaled-al-harbi-plumbing#reviews");
  });

  it("hides only the dismissed ask, leaving the other one alone", async () => {
    const user = userEvent.setup();
    renderPrompt([item, { ...item, bookingId: "bk-2", jobTitle: "Water heater install" }]);
    expect(screen.getAllByRole("link", { name: /rate the job/i })).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: /not now/i })[0]);

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: /rate the job/i })).toHaveLength(1);
    });
    // The survivor is the OTHER booking's, not a half-rendered card.
    expect(screen.getByText(/Water heater install/)).toBeTruthy();
    expect(screen.queryByText(/Leak repair/)).toBeNull();
  });

  it("renders nothing at all when there is nothing to ask", () => {
    const { container } = renderPrompt([]);
    expect(container.textContent).toBe("");
  });
});
