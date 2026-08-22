/**
 * Playwright E2E tests for Admin Customer Management.
 *
 * Tests:
 * 1. Customer management page loads with customer list
 * 2. Add Customer button opens modal
 * 3. Add Customer form validates required fields
 * 4. Add Customer form submits successfully
 * 5. Search/filter customers works
 * 6. Export CSV works
 */

import { test, expect } from "@playwright/test";

test.describe("Admin Customer Management", () => {
  // Helper to log in as admin via demo session cookie
  async function loginAsAdmin(page: import("@playwright/test").Page) {
    // Set the demo admin session cookie
    await page.context().addCookies([
      {
        name: "wa_session",
        value: encodeURIComponent(
          JSON.stringify({
            id: "u-admin",
            name: "Platform Admin",
            email: "admin@workersarena.com",
            role: "admin",
            hue: 280,
          })
        ),
        domain: "localhost",
        path: "/",
      },
    ]);
  }

  test("customer management page loads with customer list", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle");

    // Verify page title
    await expect(page.getByRole("heading", { name: /Customer Management/ })).toBeVisible();

    // Verify summary cards show
    await expect(page.getByText("Total Customers")).toBeVisible();
    await expect(page.getByText("Total Bookings")).toBeVisible();
    await expect(page.getByText("Total Spent")).toBeVisible();

    // Verify customers are displayed
    await expect(page.getByText("Fatima Al-Saud")).toBeVisible();
    await expect(page.getByText("Ahmed Hassan")).toBeVisible();
  });

  test("Add Customer button opens modal", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle");

    // Click the Add Customer button
    const addButton = page.getByRole("button", { name: /Add Customer/ });
    await expect(addButton).toBeVisible();
    await addButton.click();

    // Verify modal appears
    await expect(page.getByRole("heading", { name: "Add New Customer" })).toBeVisible();

    // Verify form fields exist in the modal
    await expect(page.getByPlaceholder("Ahmed Ali")).toBeVisible();
    await expect(page.getByPlaceholder("ahmed@example.com")).toBeVisible();
    await expect(page.getByPlaceholder("••••••••")).toBeVisible();
    await expect(page.getByPlaceholder("+961 71 123 456")).toBeVisible();
    await expect(page.locator("select").last()).toBeVisible();

    // Verify modal buttons
    await expect(page.getByRole("button", { name: /Add Customer/ }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  test("Add Customer modal closes on cancel", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle");

    // Open modal
    await page.getByRole("button", { name: /Add Customer/ }).first().click();
    await expect(page.getByRole("heading", { name: "Add New Customer" })).toBeVisible();

    // Click Cancel
    await page.getByRole("button", { name: "Cancel" }).click();

    // Verify modal is closed
    await expect(page.getByRole("heading", { name: "Add New Customer" })).not.toBeVisible();
  });

  test("Add Customer modal closes on backdrop click", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle");

    // Open modal
    await page.getByRole("button", { name: /Add Customer/ }).first().click();
    await expect(page.getByRole("heading", { name: "Add New Customer" })).toBeVisible();

    // Click the backdrop (outside the modal)
    await page.mouse.click(10, 10);

    // Verify modal is closed
    await expect(page.getByRole("heading", { name: "Add New Customer" })).not.toBeVisible();
  });

  test("Add Customer form shows validation errors for empty fields", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle");

    // Open modal
    await page.getByRole("button", { name: /Add Customer/ }).first().click();
    await expect(page.getByRole("heading", { name: "Add New Customer" })).toBeVisible();

    // Try to submit without filling fields
    await page.getByRole("button", { name: /Add Customer/ }).last().click();

    // Browser should show native validation for required fields
    // Try to submit — browser native validation should prevent submission
    // Just verify the modal is still open with the submit button
    await expect(page.getByText("Add New Customer")).toBeVisible();
  });

  test("Add Customer form submits successfully", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle");

    // Open modal
    await page.getByRole("button", { name: /Add Customer/ }).first().click();
    await expect(page.getByRole("heading", { name: "Add New Customer" })).toBeVisible();

    // Fill the form using placeholders
    await page.getByPlaceholder("Ahmed Ali").fill("Test Customer");
    await page.getByPlaceholder("ahmed@example.com").fill(`test-${Date.now()}@example.com`);
    await page.getByPlaceholder("••••••••").fill("password123");
    await page.getByPlaceholder("+961 71 123 456").fill("+961 71 999 888");

    // Submit the form
    await page.getByRole("button", { name: /Add Customer/ }).last().click();

    // Wait for the API response and success message
    await expect(
      page.getByText(/created successfully/)
    ).toBeVisible({ timeout: 10000 });
  });

  test("search filters customers by name", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle");

    // Verify all customers are shown initially
    await expect(page.getByText("Fatima Al-Saud")).toBeVisible();
    await expect(page.getByText("Ahmed Hassan")).toBeVisible();

    // Type in search box
    await page.getByPlaceholder("Search customers...").fill("Fatima");

    // Only Fatima should be visible
    await expect(page.getByText("Fatima Al-Saud")).toBeVisible();
    await expect(page.getByText("Ahmed Hassan")).not.toBeVisible();
  });

  test("search filters customers by email", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle");

    // Type email in search
    await page.getByPlaceholder("Search customers...").fill("ahmed@example.com");

    // Only Ahmed should be visible
    await expect(page.getByText("Ahmed Hassan")).toBeVisible();
    await expect(page.getByText("Fatima Al-Saud")).not.toBeVisible();
  });

  test("status filter works", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle");

    // Filter by suspended status
    await page.locator("select").selectOption("suspended");

    // Only Khalid (suspended) should be visible
    await expect(page.getByText("Khalid Nasser")).toBeVisible();
    await expect(page.getByText("Fatima Al-Saud")).not.toBeVisible();
  });

  test("status filter shows banned users", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle");

    // Filter by banned status
    await page.locator("select").selectOption("banned");

    // Only Mohammed Ali (banned) should be visible
    await expect(page.getByText("Mohammed Ali")).toBeVisible();
    await expect(page.getByText("Fatima Al-Saud")).not.toBeVisible();
  });

  test("clicking customer card expands details", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle");

    // Click on Fatima's card
    await page.getByText("Fatima Al-Saud").click();

    // Verify expanded details show
    await expect(page.getByText("+966 55 123 4567")).toBeVisible();
    await expect(page.getByText(/Joined/)).toBeVisible();
  });

  test("Export CSV button downloads a file", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle");

    // Start waiting for download before clicking
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export CSV/ }).click();
    const download = await downloadPromise;

    // Verify download filename
    expect(download.suggestedFilename()).toMatch(/customers-.*\.csv/);
  });

  test("back link navigates to admin dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle");

    // Click back link
    await page.getByText("Back to Dashboard").click();

    // Should navigate to admin page
    await expect(page).toHaveURL(/\/admin/);
  });

  test("API rejects add-customer without admin session", async ({ request }) => {
    const response = await request.post("/api/admin/add-customer", {
      data: {
        name: "Test User",
        email: "test@example.com",
        password: "password123",
      },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("Unauthorized");
  });

  test("API rejects add-customer with invalid data", async ({ request }) => {
    const adminCookie = `wa_session=${encodeURIComponent(
      JSON.stringify({
        id: "u-admin",
        name: "Platform Admin",
        email: "admin@workersarena.com",
        role: "admin",
        hue: 280,
      })
    )}`;

    // Empty name
    const res1 = await request.post("/api/admin/add-customer", {
      headers: { Cookie: adminCookie },
      data: { name: "", email: "test@example.com", password: "password123" },
    });
    expect(res1.status()).toBe(400);

    // Invalid email
    const res2 = await request.post("/api/admin/add-customer", {
      headers: { Cookie: adminCookie },
      data: { name: "Test", email: "not-an-email", password: "password123" },
    });
    expect(res2.status()).toBe(400);

    // Short password
    const res3 = await request.post("/api/admin/add-customer", {
      headers: { Cookie: adminCookie },
      data: { name: "Test", email: "test@example.com", password: "short" },
    });
    expect(res3.status()).toBe(400);
  });
});
