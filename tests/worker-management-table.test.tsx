// @vitest-environment jsdom
/**
 * Admin worker-management audit (docs/booking-take-rate.md): every worker
 * renders with its plan + status, and the fee-waived filter narrows to
 * Enterprise rows — the audit counterpart of the /search fee-waived toggle.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { WorkerManagementTable } from "@/components/dashboard/worker-management-table";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { useToastStore } from "@/components/ui/toast";
import type { Worker } from "@/lib/data/types";

// next/link — renders a plain anchor in jsdom (like the WorkerCard test).
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// next/navigation — the table syncs its audit state back into the URL via
// router.replace, and refreshes after a plan change, so the mock records the
// calls for the persistence test and stubs the refresh.
const { replaceMock, refreshMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
}));

// The inline plan-change action — mocked so the row select's onChange can be
// asserted without hitting the server.
const { changeWorkerPlanActionMock } = vi.hoisted(() => ({
  changeWorkerPlanActionMock: vi.fn(),
}));
vi.mock("@/app/actions/business", () => ({
  changeWorkerPlanAction: changeWorkerPlanActionMock,
}));

// vitest `globals` is off, so RTL cannot auto-register its cleanup.
afterEach(() => {
  cleanup();
  changeWorkerPlanActionMock.mockReset();
});

const premiumWorker = {
  id: "khaled-plum",
  slug: "khaled-al-harbi-plumbing",
  nameEn: "Khaled Al-Harbi",
  nameAr: "خالد الحربي",
  categorySlug: "plumbing",
  citySlug: "riyadh",
  hue: 210,
  subscription: { plan: "premium", status: "active" },
} as unknown as Worker;

const enterpriseWorker = {
  id: "bilal-clea",
  slug: "bilal-mansour-cleaning",
  nameEn: "Bilal Mansour",
  nameAr: "بلال منصور",
  categorySlug: "cleaning",
  citySlug: "dubai",
  hue: 150,
  subscription: { plan: "enterprise", status: "active" },
} as unknown as Worker;

const expiringWorker = {
  id: "nasser-move",
  slug: "nasser-al-qahtani-movers",
  nameEn: "Nasser Al-Qahtani",
  nameAr: "ناصر القحطاني",
  categorySlug: "movers",
  citySlug: "riyadh",
  hue: 30,
  subscription: { plan: "professional", status: "expiring" },
} as unknown as Worker;

const expiredEnterpriseWorker = {
  id: "tariq-roof",
  slug: "tariq-al-shammari-roofing",
  nameEn: "Tariq Al-Shammari",
  nameAr: "طارق الشمري",
  categorySlug: "roofing",
  citySlug: "riyadh",
  hue: 90,
  subscription: { plan: "enterprise", status: "expired" },
} as unknown as Worker;

function renderTable(workers: Worker[]) {
  return render(
    <LocaleProvider locale="en" dir="ltr">
      <WorkerManagementTable workers={workers} />
    </LocaleProvider>
  );
}

describe("WorkerManagementTable", () => {
  it("renders every worker with plan badge and subscription status", () => {
    renderTable([premiumWorker, enterpriseWorker, expiringWorker]);

    expect(screen.getByText("Khaled Al-Harbi")).toBeInTheDocument();
    expect(screen.getByText("Bilal Mansour")).toBeInTheDocument();
    expect(screen.getByText("Nasser Al-Qahtani")).toBeInTheDocument();

    // Plan column: each row's inline plan select (the badge overlay) carries
    // the worker's tier — assert the select value, unambiguous where the
    // badge text and the select's option labels would both match.
    const rowOf = (name: string) => screen.getByText(name).closest("tr")!;
    expect(within(rowOf("Bilal Mansour")).getByLabelText("Change plan")).toHaveValue("enterprise");
    expect(within(rowOf("Khaled Al-Harbi")).getByLabelText("Change plan")).toHaveValue("premium");
    expect(within(rowOf("Nasser Al-Qahtani")).getByLabelText("Change plan")).toHaveValue("professional");

    // Status column: both active rows show Active, the expiring row differs.
    expect(screen.getAllByText("Active").length).toBe(2);
    expect(screen.getByText("Expiring soon")).toBeInTheDocument();

    // Unfiltered count line: all three results.
    expect(screen.getByText("3 results")).toBeInTheDocument();
  });

  it("summarizes the Enterprise audit: live vs expired at a glance", () => {
    renderTable([enterpriseWorker, expiredEnterpriseWorker, premiumWorker]);

    // Chips only render for states that have rows.
    expect(screen.getByText("1 Enterprise live")).toBeInTheDocument();
    expect(screen.getByText("1 Enterprise expired")).toBeInTheDocument();
    expect(screen.queryByText(/Expiring soon/)).not.toBeInTheDocument();

    // With no Enterprise workers at all, both chips disappear.
    cleanup();
    renderTable([premiumWorker, expiringWorker]);
    expect(screen.queryByText(/Enterprise live/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Enterprise expired/)).not.toBeInTheDocument();
  });

  it("narrows to Enterprise (fee-waived) workers when the filter is on", () => {
    renderTable([premiumWorker, enterpriseWorker, expiringWorker]);

    fireEvent.click(screen.getByRole("switch"));

    expect(screen.getByText("Bilal Mansour")).toBeInTheDocument();
    expect(screen.queryByText("Khaled Al-Harbi")).not.toBeInTheDocument();
    expect(screen.queryByText("Nasser Al-Qahtani")).not.toBeInTheDocument();
    // Count line: 1 result · 1 fee-waived.
    expect(screen.getByText(/1 results/)).toBeInTheDocument();
    expect(screen.getByText(/1 Fee waived/)).toBeInTheDocument();
  });

  it("searches by worker name (active locale) and category", () => {
    renderTable([premiumWorker, enterpriseWorker, expiringWorker]);

    const search = screen.getByLabelText("Search name or category…");
    fireEvent.change(search, { target: { value: "bilal" } });
    expect(screen.getByText("Bilal Mansour")).toBeInTheDocument();
    expect(screen.queryByText("Khaled Al-Harbi")).not.toBeInTheDocument();

    // Category search — "plumbing" (khaled) matches only his row.
    fireEvent.change(search, { target: { value: "plumbing" } });
    expect(screen.getByText("Khaled Al-Harbi")).toBeInTheDocument();
    expect(screen.queryByText("Bilal Mansour")).not.toBeInTheDocument();

    // No match → empty state.
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("No results found")).toBeInTheDocument();
  });

  it("sorts by plan tier (basic → enterprise) and reversed", () => {
    const basicWorker = {
      ...premiumWorker,
      id: "majed-glas",
      slug: "majed-haddad-glass-works",
      nameEn: "Majed Haddad",
      categorySlug: "glass-works",
      subscription: { plan: "basic", status: "active" },
    } as unknown as Worker;
    renderTable([premiumWorker, enterpriseWorker, basicWorker]);

    const rowNames = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((r) => r.textContent ?? "");

    // Default planAsc: basic → premium → enterprise.
    let names = rowNames();
    expect(names[0]).toContain("Majed Haddad");
    expect(names[1]).toContain("Khaled Al-Harbi");
    expect(names[2]).toContain("Bilal Mansour");

    // planDesc: enterprise first. (The sort trigger is the combobox whose
    // aria-label is the search.sortBy "Sort by" label — the plan selects in
    // the rows are also comboboxes, so scope by name.)
    fireEvent.click(screen.getByRole("combobox", { name: "Sort by" }));
    fireEvent.click(screen.getByText("Plan (enterprise → basic)"));
    names = rowNames();
    expect(names[0]).toContain("Bilal Mansour");
    expect(names[2]).toContain("Majed Haddad");

    // Name A–Z: Bilal → Khaled → Majed.
    fireEvent.click(screen.getByRole("combobox", { name: "Sort by" }));
    fireEvent.click(screen.getByText("Name A–Z"));
    names = rowNames();
    expect(names[0]).toContain("Bilal Mansour");
    expect(names[1]).toContain("Khaled Al-Harbi");
    expect(names[2]).toContain("Majed Haddad");
  });

  it("deep-links each row to the customer search: fee-waived for Enterprise, plain name otherwise", () => {
    renderTable([enterpriseWorker, premiumWorker]);

    const links = screen.getAllByRole("link", { name: /View search result/ });
    expect(links).toHaveLength(2);
    // Enterprise row → the fee-waived search proves the exemption surfaces.
    // (Row order follows the default planAsc sort, so match by href, not index.)
    const feeWaivedLink = links.find((l) => (l.getAttribute("href") ?? "").includes("feeWaived=1"));
    const plainLink = links.find((l) => !(l.getAttribute("href") ?? "").includes("feeWaived=1"));
    expect(feeWaivedLink).toHaveAttribute("href", "/search?feeWaived=1&q=Bilal%20Mansour");
    expect(feeWaivedLink).toHaveAttribute("target", "_blank");
    // Premium row → the fee filter would exclude them, so the plain name query.
    expect(plainLink).toHaveAttribute("href", "/search?q=Khaled%20Al-Harbi");
  });

  it("shows the empty state when the filter matches nothing", () => {
    // No Enterprise workers in the set → filtered view is empty.
    renderTable([premiumWorker, expiringWorker]);

    fireEvent.click(screen.getByRole("switch"));

    expect(screen.queryByText("Khaled Al-Harbi")).not.toBeInTheDocument();
    expect(screen.getByText("No results found")).toBeInTheDocument();
  });

  it("persists search/sort/filter state in the URL via router.replace", () => {
    renderTable([premiumWorker, enterpriseWorker]);
    replaceMock.mockClear();

    // Typing syncs the query param — defaults (planAsc) stay omitted.
    fireEvent.change(screen.getByLabelText("Search name or category…"), {
      target: { value: "bilal" },
    });
    expect(replaceMock).toHaveBeenCalledWith("/admin?wm=bilal", { scroll: false });

    // The fee-waived switch composes with the existing query.
    fireEvent.click(screen.getByRole("switch"));
    expect(replaceMock).toHaveBeenLastCalledWith("/admin?wm=bilal&feeWaived=1", { scroll: false });

    // Non-default sort appends its param.
    fireEvent.click(screen.getByRole("combobox", { name: "Sort by" }));
    fireEvent.click(screen.getByText("Plan (enterprise → basic)"));
    expect(replaceMock).toHaveBeenLastCalledWith(
      "/admin?wm=bilal&sort=planDesc&feeWaived=1",
      { scroll: false }
    );
  });

  it("exports the current filtered view as a CSV file", async () => {
    // Capture the blob the download is built from (jsdom can't navigate on the
    // anchor click, so assert on what URL.createObjectURL received).
    const captured: { blob: Blob | null; href: string; download: string } = {
      blob: null,
      href: "",
      download: "",
    };
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((b: Blob) => {
      captured.blob = b;
      return "blob:mock";
    });
    URL.revokeObjectURL = vi.fn();
    // Anchor click is a no-op in jsdom — spy on the element's attributes instead.
    const origCreateElement = document.createElement.bind(document);
    document.createElement = vi.fn((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === "a") {
        const a = el as HTMLAnchorElement;
        Object.defineProperty(a, "click", {
          value: () => {
            captured.href = a.href;
            captured.download = a.download;
          },
          configurable: true,
        });
      }
      return el;
    });

    try {
      renderTable([premiumWorker, enterpriseWorker, expiringWorker]);
      fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

      expect(captured.href).toBe("blob:mock");
      expect(captured.download).toMatch(/^worker-management-\d{4}-\d{2}-\d{2}\.csv$/);

      // Full unfiltered view (planAsc default: professional → premium → enterprise)
      // with RFC-4180 quoting on every field.
      const text = await captured.blob!.text();
      expect(text.split("\n")).toEqual([
        '"Name","City","Category","Plan","Status"',
        '"Nasser Al-Qahtani","riyadh","Movers","Professional","Expiring soon"',
        '"Khaled Al-Harbi","riyadh","Plumbing","Premium","Active"',
        '"Bilal Mansour","dubai","Cleaning Services","Enterprise","Active"',
      ]);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      document.createElement = origCreateElement;
    }
  });

  it("stages a plan change in a confirm dialog and applies it only on Apply", async () => {
    changeWorkerPlanActionMock.mockResolvedValue({ ok: true });
    renderTable([premiumWorker, enterpriseWorker]);

    // The Plan cell is an inline select (aria-label "Change plan") overlaid on
    // the badge — bilal's row starts on Enterprise.
    const bilalRow = screen.getByText("Bilal Mansour").closest("tr")!;
    const planSelect = within(bilalRow).getByLabelText("Change plan");
    expect(planSelect).toHaveValue("enterprise");
    const options = within(planSelect)
      .getAllByRole("option")
      .map((o) => o.getAttribute("value"));
    expect(options).toEqual(["basic", "professional", "premium", "enterprise"]);

    // Choosing a tier only stages the change — the action must NOT fire yet.
    fireEvent.change(planSelect, { target: { value: "premium" } });
    expect(changeWorkerPlanActionMock).not.toHaveBeenCalled();

    // The confirm dialog shows the worker + from → to + price.
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Change plan?");
    expect(dialog).toHaveTextContent("Bilal Mansour");
    expect(dialog).toHaveTextContent("from Enterprise to Premium");
    expect(dialog).toHaveTextContent("The Premium plan is $119/month");

    // Apply commits the staged change.
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(changeWorkerPlanActionMock).toHaveBeenCalledWith("bilal-clea", "premium")
    );
    // The success toast is store-driven (the Toaster component isn't mounted
    // in jsdom), so assert the store received it.
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.title === "Plan updated")).toBe(true)
    );
  });

  it("is keyboard-accessible end to end: Apply focused on open, Enter commits, Esc cancels", async () => {
    changeWorkerPlanActionMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderTable([premiumWorker, enterpriseWorker]);

    const bilalRow = screen.getByText("Bilal Mansour").closest("tr")!;
    const planSelect = within(bilalRow).getByLabelText("Change plan");

    // Stage Enterprise → Premium: the dialog opens with the PRIMARY action
    // focused, so the happy path needs no tabbing.
    fireEvent.change(planSelect, { target: { value: "premium" } });
    const dialog = await screen.findByRole("dialog");
    const applyBtn = within(dialog).getByRole("button", { name: "Apply" });
    expect(applyBtn).toHaveFocus();

    // Enter on the focused Apply commits the change.
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(changeWorkerPlanActionMock).toHaveBeenCalledWith("bilal-clea", "premium")
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Stage again (Khaled → Basic) and Esc cancels — no second action.
    const khaledRow = screen.getByText("Khaled Al-Harbi").closest("tr")!;
    fireEvent.change(within(khaledRow).getByLabelText("Change plan"), {
      target: { value: "basic" },
    });
    const dialog2 = await screen.findByRole("dialog");
    expect(within(dialog2).getByRole("button", { name: "Apply" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(changeWorkerPlanActionMock).toHaveBeenCalledTimes(1);
    // The row is untouched.
    expect(within(khaledRow).getByLabelText("Change plan")).toHaveValue("premium");
  });

  it("cancels a staged plan change without firing the action", () => {
    changeWorkerPlanActionMock.mockResolvedValue({ ok: true });
    renderTable([premiumWorker, enterpriseWorker]);

    const khaledRow = screen.getByText("Khaled Al-Harbi").closest("tr")!;
    fireEvent.change(within(khaledRow).getByLabelText("Change plan"), {
      target: { value: "basic" },
    });

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(changeWorkerPlanActionMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The row is untouched.
    expect(within(khaledRow).getByLabelText("Change plan")).toHaveValue("premium");
  });

  it("does not open the confirm dialog when the plan is unchanged", () => {
    changeWorkerPlanActionMock.mockResolvedValue({ ok: true });
    renderTable([premiumWorker, enterpriseWorker]);

    const khaledRow = screen.getByText("Khaled Al-Harbi").closest("tr")!;
    fireEvent.change(within(khaledRow).getByLabelText("Change plan"), {
      target: { value: "premium" },
    });

    expect(changeWorkerPlanActionMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("exports only the fee-waived rows when the filter is on", async () => {
    const captured: Blob[] = [];
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((b: Blob) => {
      captured.push(b);
      return "blob:mock";
    });
    // jsdom doesn't implement revokeObjectURL — stub it (the full-view CSV
    // test does the same) so exportCsv's cleanup doesn't throw unhandled.
    URL.revokeObjectURL = vi.fn();

    try {
      renderTable([premiumWorker, enterpriseWorker, expiringWorker]);
      fireEvent.click(screen.getByRole("switch"));
      fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

      const text = await captured[0]!.text();
      expect(text).toContain('"Bilal Mansour"');
      expect(text).not.toContain('"Khaled Al-Harbi"');
      expect(text).not.toContain('"Nasser Al-Qahtani"');
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });

  it("initializes from URL-persisted state (wm/sort/feeWaived)", () => {
    // The admin page parses /admin?wm=bilal&sort=planDesc&feeWaived=1 into
    // these initial props; the table must land in that exact audit state.
    render(
      <LocaleProvider locale="en" dir="ltr">
        <WorkerManagementTable
          workers={[premiumWorker, enterpriseWorker]}
          init={{ query: "bilal", sort: "planDesc", feeWaivedOnly: true }}
        />
      </LocaleProvider>
    );

    expect(screen.getByText("Bilal Mansour")).toBeInTheDocument();
    expect(screen.queryByText("Khaled Al-Harbi")).not.toBeInTheDocument();
    expect(screen.getByText(/1 results/)).toBeInTheDocument();
  });
});
