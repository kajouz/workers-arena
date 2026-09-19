import { describe, expect, it } from "vitest";
import { retentionSnapshot } from "../src/lib/data/retention";
import type { Worker } from "../src/lib/data/types";

const NOW = Date.parse("2026-09-19T12:00:00.000Z");

function worker(id: string, status: Worker["subscription"]["status"], expiresAt: string): Pick<Worker, "id" | "nameEn" | "nameAr" | "hue" | "subscription"> {
  return {
    id,
    nameEn: id,
    nameAr: id,
    hue: 20,
    subscription: {
      plan: "professional",
      status,
      startedAt: "2026-01-01T00:00:00.000Z",
      expiresAt,
      price: 99,
      invoiceNo: `INV-${id}`,
    },
  };
}

describe("retentionSnapshot", () => {
  it("counts active, expiring, and expired subscriptions from the injected clock", () => {
    const result = retentionSnapshot(
      [
        worker("expired", "expired", "2026-09-18T12:00:00.000Z"),
        worker("soon", "active", "2026-09-29T12:00:00.000Z"),
        worker("later", "active", "2026-11-01T12:00:00.000Z"),
      ],
      NOW
    );
    expect(result.total).toBe(3);
    expect(result.active).toBe(2);
    expect(result.expired).toBe(1);
    expect(result.expiringSoon).toBe(1);
    expect(result.retentionRate).toBe(66.7);
    expect(result.churnRate).toBe(33.3);
    expect(result.atRiskWorkers.map((row) => row.id)).toEqual(["soon"]);
  });

  it("treats the 30-day boundary as at risk and sorts by earliest expiry", () => {
    const result = retentionSnapshot(
      [
        worker("boundary", "active", "2026-10-19T12:00:00.000Z"),
        worker("earlier", "active", "2026-09-20T12:00:00.000Z"),
      ],
      NOW
    );
    expect(result.expiringSoon).toBe(2);
    expect(result.atRiskWorkers.map((row) => row.id)).toEqual(["earlier", "boundary"]);
  });

  it("returns safe zero metrics for an empty workforce", () => {
    expect(retentionSnapshot([], NOW)).toEqual({
      total: 0,
      active: 0,
      expiringSoon: 0,
      expired: 0,
      retentionRate: 0,
      churnRate: 0,
      atRiskWorkers: [],
    });
  });
});
