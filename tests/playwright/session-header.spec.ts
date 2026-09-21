import { test, expect, type Page } from "@playwright/test";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * THE HEADER ACROSS THE PUBLIC/APP SPLIT
 * ────────────────────────────────────────────────────────────────────────────
 * Public pages are prerendered, so their HTML cannot know who is reading it —
 * the header resolves the session after hydration. App pages are per-user
 * anyway, so the server resolves it and the first paint is already correct.
 *
 * The risk the split introduces is a wrong intermediate state: a signed-in
 * reader watching a "Sign in" button sit in the header before being replaced.
 * These tests pin that it never happens, in both directions.
 * ────────────────────────────────────────────────────────────────────────────
 */

const WORKER_SESSION = {
  id: "u-worker",
  name: "Khaled Al-Harbi",
  email: "khaled@plumbfix.lb",
  role: "worker",
  hue: 25,
};

async function signIn(page: Page) {
  await page.context().addCookies([
    {
      name: "wa_session",
      value: encodeURIComponent(JSON.stringify(WORKER_SESSION)),
      url: page.url().startsWith("http") ? new URL(page.url()).origin : "http://localhost:3001",
    },
  ]);
}

/** The header's own region — the page body has its own marketing CTAs. */
function header(page: Page) {
  return page.locator("header").first();
}

test.describe("header session resolution", () => {
  test("a prerendered public page never ships a session state in its HTML", async ({ page }) => {
    // Disabling JS freezes the page at the server-rendered markup, which is
    // exactly what a crawler and the first paint see.
    const context = await page.context().browser()!.newContext({ javaScriptEnabled: false });
    const raw = await context.newPage();
    await raw.goto("/en");
    const markup = await header(raw).innerHTML();
    expect(markup, "the prerendered header must not claim the reader is signed out").not.toContain(
      "Sign in"
    );
    expect(markup, "…nor that they are signed in").not.toContain("Dashboard");
    await context.close();
  });

  test("an anonymous reader lands on the signed-out header after hydration", async ({ page }) => {
    await page.goto("/en");
    await expect(header(page).getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("a signed-in reader gets their account header on a PUBLIC page, never a sign-in button", async ({
    page,
  }) => {
    await page.goto("/en");
    await signIn(page);
    await page.reload();

    // The resolved state arrives.
    await expect(header(page).getByRole("link", { name: /dashboard/i })).toBeVisible();
    // …and the wrong one never does. Checked after the resolve so a flash
    // would already have had its chance to render.
    await expect(header(page).getByRole("link", { name: /sign in/i })).toHaveCount(0);
  });

  test("an APP page renders the account header server-side, with no request for it", async ({
    page,
  }) => {
    await page.goto("/en");
    await signIn(page);

    const sessionCalls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/session")) sessionCalls.push(r.url());
    });

    await page.goto("/en/dashboard");
    await expect(header(page).getByRole("link", { name: /dashboard/i })).toBeVisible();
    expect(
      sessionCalls,
      "the app surface knows the session already — asking for it again is the flash the split avoids"
    ).toHaveLength(0);
  });

  test("/api/session answers only the role, and is never cached", async ({ page, request }) => {
    const anon = await request.get("/api/session");
    expect(anon.headers()["cache-control"]).toContain("no-store");
    expect(await anon.json()).toEqual({ role: null });

    await page.goto("/en");
    await signIn(page);
    const authed = await page.request.get("/api/session");
    const body = await authed.json();
    expect(body).toEqual({ role: "worker" });
    // Narrow on purpose — no id, name or email.
    expect(Object.keys(body)).toEqual(["role"]);
  });
});
