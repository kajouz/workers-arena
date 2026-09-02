import { resetStores } from "@/lib/calling/masked-number-service";

import { describe, it, expect, beforeEach } from "vitest";
import {
  createMaskedNumbers,
  getMaskedNumberForBooking,
  getRealNumberForMasked,
  routeIncomingCall,
  endCall,
  releaseMaskedNumbers,
  getAllMaskedNumbers,
  getMaskedNumbersForBooking,
  getCallStatsForBooking,
  expireOldMaskedNumbers,
} from "@/lib/calling/masked-number-service";

describe("masked number service", () => {
  // Use unique booking IDs for each test to avoid conflicts
  let testCounter = 0;
  
  beforeEach(() => {
    resetStores();
    testCounter++;
  });

  describe("createMaskedNumbers", () => {
    it("creates masked numbers for both worker and customer", async () => {
      const bookingId = `BK-CREATE-${testCounter}`;
      const result = await createMaskedNumbers({
        workerId: "worker-1",
        customerId: "customer-1",
        customerPhone: "+961 70 123 456",
        bookingId,
      });

      expect(result.workerMasked).toBeDefined();
      expect(result.customerMasked).toBeDefined();
      expect(result.workerMasked.maskedNumber).toContain("+1-800-555");
      expect(result.customerMasked.maskedNumber).toContain("+1-800-555");
      expect(result.workerMasked.partyType).toBe("worker");
      expect(result.customerMasked.partyType).toBe("customer");
      expect(result.workerMasked.bookingId).toBe(bookingId);
      expect(result.customerMasked.bookingId).toBe(bookingId);
    });

    it("assigns different masked numbers to worker and customer", async () => {
      const result = await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId: `BK-UNIQUE-${testCounter}`,
      });

      expect(result.workerMasked.maskedNumber).not.toBe(result.customerMasked.maskedNumber);
    });

    it("sets expiration date correctly", async () => {
      const result = await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId: `BK-EXPIRE-${testCounter}`,
        expirationDays: 14,
      });

      const now = new Date();
      const expectedExpiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      
      expect(result.workerMasked.expiresAt.getTime()).toBeGreaterThan(expectedExpiry.getTime() - 1000);
      expect(result.workerMasked.expiresAt.getTime()).toBeLessThan(expectedExpiry.getTime() + 1000);
    });

    it("defaults to 7 days expiration", async () => {
      const result = await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId: `BK-DEFAULT-${testCounter}`,
      });

      const now = new Date();
      const expectedExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      expect(result.workerMasked.expiresAt.getTime()).toBeGreaterThan(expectedExpiry.getTime() - 1000);
      expect(result.workerMasked.expiresAt.getTime()).toBeLessThan(expectedExpiry.getTime() + 1000);
    });

    it("initializes call count to zero", async () => {
      const result = await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId: `BK-CALLCOUNT-${testCounter}`,
      });

      expect(result.workerMasked.callCount).toBe(0);
      expect(result.customerMasked.callCount).toBe(0);
    });
  });

  describe("getMaskedNumberForBooking", () => {
    it("returns masked number for worker party type", async () => {
      const bookingId = `BK-GETWORKER-${testCounter}`;
      await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId,
      });

      const workerMasked = await getMaskedNumberForBooking(bookingId, "worker");
      
      expect(workerMasked).toBeDefined();
      expect(workerMasked?.partyType).toBe("worker");
      expect(workerMasked?.bookingId).toBe(bookingId);
    });

    it("returns masked number for customer party type", async () => {
      const bookingId = `BK-GETCUSTOMER-${testCounter}`;
      await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId,
      });

      const customerMasked = await getMaskedNumberForBooking(bookingId, "customer");
      
      expect(customerMasked).toBeDefined();
      expect(customerMasked?.partyType).toBe("customer");
    });

    it("returns null for non-existent booking", async () => {
      const result = await getMaskedNumberForBooking("BK-NONEXISTENT-99999", "worker");
      expect(result).toBeNull();
    });

    it("strips sensitive fields from returned data", async () => {
      const bookingId = `BK-STRIP-${testCounter}`;
      await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId,
      });

      const masked = await getMaskedNumberForBooking(bookingId, "worker");
      
      expect(masked).toBeDefined();
      expect(masked).not.toHaveProperty("realNumber");
      expect(masked).not.toHaveProperty("workerRealNumber");
      expect(masked).not.toHaveProperty("customerRealNumber");
    });
  });

  describe("getRealNumberForMasked", () => {
    it("returns real number for admin access", async () => {
      const bookingId = `BK-REAL-${testCounter}`;
      const created = await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId,
      });

      const realNumber = await getRealNumberForMasked(created.workerMasked.id);
      
      expect(realNumber).toBeDefined();
      expect(realNumber?.realNumber).toBe("+961 71 123 456");
      expect(realNumber?.partyType).toBe("worker");
      expect(realNumber?.bookingId).toBe(bookingId);
    });

    it("returns null for non-existent masked number", async () => {
      const result = await getRealNumberForMasked("MN-nonexistent-99999");
      expect(result).toBeNull();
    });
  });

  describe("routeIncomingCall", () => {
    it("routes call to correct real number", async () => {
      const bookingId = `BK-ROUTE-${testCounter}`;
      const created = await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId,
      });

      const routeResult = await routeIncomingCall(created.workerMasked.maskedNumber);
      
      expect(routeResult).toBeDefined();
      expect(routeResult?.forwardTo).toBe("+961 71 123 456");
      expect(routeResult?.callId).toBeDefined();
    });

    it("routes customer call to customer's real number", async () => {
      const bookingId = `BK-ROUTECUST-${testCounter}`;
      const created = await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId,
      });

      const routeResult = await routeIncomingCall(created.customerMasked.maskedNumber);
      
      expect(routeResult).toBeDefined();
      expect(routeResult?.forwardTo).toBe("+961 70 123 456");
    });

    it("returns null for invalid masked number", async () => {
      const result = await routeIncomingCall("+1-800-555-9999");
      expect(result).toBeNull();
    });

    it("creates call record when routing", async () => {
      const bookingId = `BK-CALLREC-${testCounter}`;
      const created = await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId,
      });

      const routeResult = await routeIncomingCall(created.workerMasked.maskedNumber);
      
      expect(routeResult).toBeDefined();
      expect(routeResult?.callId).toMatch(/^CL-/);
    });
  });

  describe("endCall", () => {
    it("updates call record with duration", async () => {
      const bookingId = `BK-ENDCALL-${testCounter}`;
      const created = await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId,
      });

      const routeResult = await routeIncomingCall(created.workerMasked.maskedNumber);
      expect(routeResult).toBeDefined();

      await endCall(routeResult!.callId, 120, true);
      
      // Verify through call stats
      const stats = await getCallStatsForBooking(bookingId);
      expect(stats.totalCalls).toBe(1);
      expect(stats.answeredCalls).toBe(1);
      expect(stats.totalDurationSeconds).toBe(120);
    });
  });

  describe("releaseMaskedNumbers", () => {
    it("deactivates all masked numbers for a booking", async () => {
      const bookingId = `BK-RELEASE-${testCounter}`;
      await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId,
      });

      await releaseMaskedNumbers(bookingId);

      const workerMasked = await getMaskedNumberForBooking(bookingId, "worker");
      const customerMasked = await getMaskedNumberForBooking(bookingId, "customer");

      expect(workerMasked).toBeNull();
      expect(customerMasked).toBeNull();
    });

    it("only deactivates numbers for the specified booking", async () => {
      const bookingId1 = `BK-RELEASE1-${testCounter}`;
      const bookingId2 = `BK-RELEASE2-${testCounter}`;
      
      await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId: bookingId1,
      });

      await createMaskedNumbers({
        workerId: "worker-2",
        customerPhone: "+961 70 789 012",
        bookingId: bookingId2,
      });

      await releaseMaskedNumbers(bookingId1);

      const bk1Masked = await getMaskedNumberForBooking(bookingId1, "worker");
      const bk2Masked = await getMaskedNumberForBooking(bookingId2, "worker");

      expect(bk1Masked).toBeNull();
      expect(bk2Masked).toBeDefined();
    });
  });

  describe("getAllMaskedNumbers", () => {
    it("returns all masked numbers", async () => {
      const bookingId1 = `BK-ALL1-${testCounter}`;
      const bookingId2 = `BK-ALL2-${testCounter}`;
      
      await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId: bookingId1,
      });

      await createMaskedNumbers({
        workerId: "worker-2",
        customerPhone: "+961 70 789 012",
        bookingId: bookingId2,
      });

      const allNumbers = await getAllMaskedNumbers();
      
      const ourNumbers = allNumbers.filter(mn => 
        mn.bookingId === bookingId1 || mn.bookingId === bookingId2
      );
      expect(ourNumbers.length).toBe(4);
    });
  });

  describe("getMaskedNumbersForBooking", () => {
    it("returns both worker and customer masked numbers", async () => {
      const bookingId = `BK-BOTH-${testCounter}`;
      await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId,
      });

      const result = await getMaskedNumbersForBooking(bookingId);
      
      expect(result.worker).toBeDefined();
      expect(result.customer).toBeDefined();
      expect(result.worker?.partyType).toBe("worker");
      expect(result.customer?.partyType).toBe("customer");
    });

    it("returns null for non-existent booking", async () => {
      const result = await getMaskedNumbersForBooking("BK-NONEXISTENT-99999");
      
      expect(result.worker).toBeNull();
      expect(result.customer).toBeNull();
    });
  });

  describe("getCallStatsForBooking", () => {
    it("returns zero stats for booking with no calls", async () => {
      const bookingId = `BK-NOCALLS-${testCounter}`;
      await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId,
      });

      const stats = await getCallStatsForBooking(bookingId);
      
      expect(stats.totalCalls).toBe(0);
      expect(stats.answeredCalls).toBe(0);
      expect(stats.totalDurationSeconds).toBe(0);
      expect(stats.averageCallDuration).toBe(0);
    });

    it("tracks single call correctly", async () => {
      const bookingId = `BK-SINGLECALL-${testCounter}`;
      const created = await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId,
      });

      const routeResult = await routeIncomingCall(created.workerMasked.maskedNumber);
      await endCall(routeResult!.callId, 60, true);

      const stats = await getCallStatsForBooking(bookingId);
      
      expect(stats.totalCalls).toBe(1);
      expect(stats.answeredCalls).toBe(1);
      expect(stats.totalDurationSeconds).toBe(60);
      expect(stats.averageCallDuration).toBe(60);
    });
  });

  describe("expireOldMaskedNumbers", () => {
    it("expires numbers that have passed their expiration date", async () => {
      const bookingId = `BK-EXPIREOLD-${testCounter}`;
      
      await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId,
        expirationDays: 0,
      });

      const expiredCount = await expireOldMaskedNumbers();
      
      const masked = await getMaskedNumberForBooking(bookingId, "worker");
      expect(masked).toBeNull();
    });

    it("does not expire active numbers", async () => {
      const bookingId = `BK-NOEXPIRE-${testCounter}`;
      await createMaskedNumbers({
        workerId: "worker-1",
        customerPhone: "+961 70 123 456",
        bookingId,
        expirationDays: 30,
      });

      await expireOldMaskedNumbers();
      
      const masked = await getMaskedNumberForBooking(bookingId, "worker");
      expect(masked).toBeDefined();
    });
  });
});
