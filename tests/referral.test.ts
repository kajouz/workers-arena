import { describe, it, expect } from "vitest";
import {
  generateReferralCode,
  isValidReferralCode,
  referrerBonusFor,
  inviteeBonusFor,
  referralLink,
  referralShareMessage,
  computeReferralStats,
  DEFAULT_REFERRAL_CONFIG,
} from "@/lib/data/referral";

describe("referral program engine", () => {
  describe("generateReferralCode", () => {
    it("generates an 8-character code", () => {
      const code = generateReferralCode();
      expect(code).toHaveLength(8);
    });

    it("generates codes with only allowed characters", () => {
      const allowed = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      for (let i = 0; i < 20; i++) {
        const code = generateReferralCode();
        for (const char of code) {
          expect(allowed).toContain(char);
        }
      }
    });

    it("generates different codes on successive calls", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 50; i++) {
        codes.add(generateReferralCode());
      }
      // With 8 chars from 32 options, collisions are extremely unlikely
      expect(codes.size).toBeGreaterThan(40);
    });
  });

  describe("isValidReferralCode", () => {
    it("accepts valid codes", () => {
      expect(isValidReferralCode("ABCDEFGH")).toBe(true);
      expect(isValidReferralCode("23456789")).toBe(true);
      expect(isValidReferralCode("HJKLMNPZ")).toBe(true);
    });

    it("rejects codes with ambiguous characters", () => {
      expect(isValidReferralCode("ABCDEF0I")).toBe(false); // 0 and I
      expect(isValidReferralCode("ABCDEFG1")).toBe(false); // 1
      expect(isValidReferralCode("ABCDEFGO")).toBe(false); // O
    });

    it("rejects wrong length", () => {
      expect(isValidReferralCode("ABCDEFG")).toBe(false);
      expect(isValidReferralCode("ABCDEFGHI")).toBe(false);
    });

    it("accepts lowercase (case-insensitive)", () => {
      expect(isValidReferralCode("abcdefgh")).toBe(true);
    });
  });

  describe("referrerBonusFor", () => {
    it("grants bonus when enabled and under caps", () => {
      const result = referrerBonusFor(DEFAULT_REFERRAL_CONFIG, 0, 0);
      expect(result.granted).toBe(true);
      expect(result.amount).toBe(25);
      expect(result.reason).toBe("referrer-bonus");
    });

    it("rejects when program is disabled", () => {
      const config = { ...DEFAULT_REFERRAL_CONFIG, enabled: false };
      const result = referrerBonusFor(config, 0, 0);
      expect(result.granted).toBe(false);
      expect(result.reason).toBe("program-disabled");
    });

    it("rejects when monthly cap reached", () => {
      const config = { ...DEFAULT_REFERRAL_CONFIG, monthlyCap: 5 };
      const result = referrerBonusFor(config, 5, 0);
      expect(result.granted).toBe(false);
      expect(result.reason).toBe("monthly-cap-reached");
    });

    it("rejects when lifetime cap reached", () => {
      const config = { ...DEFAULT_REFERRAL_CONFIG, lifetimeCap: 10 };
      const result = referrerBonusFor(config, 0, 10);
      expect(result.granted).toBe(false);
      expect(result.reason).toBe("lifetime-cap-reached");
    });

    it("allows when cap is 0 (unlimited)", () => {
      const config = { ...DEFAULT_REFERRAL_CONFIG, monthlyCap: 0, lifetimeCap: 0 };
      const result = referrerBonusFor(config, 100, 1000);
      expect(result.granted).toBe(true);
    });
  });

  describe("inviteeBonusFor", () => {
    it("grants welcome bonus when enabled", () => {
      const result = inviteeBonusFor(DEFAULT_REFERRAL_CONFIG);
      expect(result.granted).toBe(true);
      expect(result.amount).toBe(10);
      expect(result.reason).toBe("invitee-bonus");
    });

    it("rejects when disabled", () => {
      const config = { ...DEFAULT_REFERRAL_CONFIG, enabled: false };
      const result = inviteeBonusFor(config);
      expect(result.granted).toBe(false);
    });
  });

  describe("referralLink", () => {
    it("generates a valid URL with the code", () => {
      const link = referralLink("ABCDEFGH");
      expect(link).toContain("ref=ABCDEFGH");
      expect(link).toMatch(/^https?:\/\//);
    });

    it("uppercases the code", () => {
      const link = referralLink("abcdefgh");
      expect(link).toContain("ref=ABCDEFGH");
    });
  });

  describe("referralShareMessage", () => {
    it("generates an English message", () => {
      const msg = referralShareMessage("Ahmad", "ABCDEFGH", "en");
      expect(msg).toContain("Ahmad");
      expect(msg).toContain("ABCDEFGH");
      expect(msg).toContain("WorkersArena");
    });

    it("generates an Arabic message", () => {
      const msg = referralShareMessage("أحمد", "ABCDEFGH", "ar");
      expect(msg).toContain("أحمد");
      expect(msg).toContain("ABCDEFGH");
    });
  });

  describe("computeReferralStats", () => {
    it("computes stats from raw data", () => {
      const stats = computeReferralStats({
        code: "TESTCODE",
        successfulReferrals: 5,
        monthlyReferrals: 2,
        lifetimeReferrals: 5,
        creditsEarned: 125,
      });
      expect(stats.totalReferrals).toBe(5);
      expect(stats.monthlyReferrals).toBe(2);
      expect(stats.lifetimeReferrals).toBe(5);
      expect(stats.totalCreditsEarned).toBe(125);
      expect(stats.code).toBe("TESTCODE");
      expect(stats.link).toContain("ref=TESTCODE");
    });

    it("handles zero referrals", () => {
      const stats = computeReferralStats({
        code: "EMPTYCODE",
        successfulReferrals: 0,
        monthlyReferrals: 0,
        lifetimeReferrals: 0,
        creditsEarned: 0,
      });
      expect(stats.totalReferrals).toBe(0);
      expect(stats.totalCreditsEarned).toBe(0);
    });
  });
});
