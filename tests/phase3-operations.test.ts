import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@/lib/auth-demo", () => ({ getSession: getSessionMock }));

import { GET as retentionGet } from "@/app/api/admin/retention/route";
import { GET as reconciliationGet } from "@/app/api/admin/revenue/reconciliation/route";

const ADMIN = { id: "a1", name: "Admin", email: "admin@example.com", role: "admin", hue: 1 };
const CUSTOMER = { id: "c1", name: "Customer", email: "customer@example.com", role: "customer", hue: 2 };

beforeEach(() => getSessionMock.mockResolvedValue(ADMIN));
afterEach(() => vi.restoreAllMocks());

describe("Phase 3 admin operations", () => {
  it("protects both reporting endpoints from non-admins", async () => {
    getSessionMock.mockResolvedValue(CUSTOMER);
    expect((await retentionGet(new Request("http://localhost/api/admin/retention"))).status).toBe(401);
    expect((await reconciliationGet(new Request("http://localhost/api/admin/revenue/reconciliation"))).status).toBe(401);
  });

  it("exports retention data as UTF-8 CSV with a stable header", async () => {
    const response = await retentionGet(new Request("http://localhost/api/admin/retention?format=csv"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    const body = await response.text();
    expect(body).toContain('"section","month","worker","plan","days_until_expiry","retention_rate","churn_rate"');
  });

  it("exports the full manual reconciliation ledger as JSON", async () => {
    const response = await reconciliationGet(new Request("http://localhost/api/admin/revenue/reconciliation"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.scope).toBe("manual_payments");
    expect(Array.isArray(body.payments)).toBe(true);
    expect(body.payments.every((payment: { status?: string }) => typeof payment.status === "string")).toBe(true);
  });

  it("exports settled-payment fields in the accounting CSV header", async () => {
    const response = await reconciliationGet(new Request("http://localhost/api/admin/revenue/reconciliation?format=csv"));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('"payment_id","scope","label_en","label_ar","method","reference","amount_minor","currency","created_at","status","paid_at","refunded_at","invoice_number"');
  });
});
