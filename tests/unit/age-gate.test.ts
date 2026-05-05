import { describe, it, expect } from "vitest";
import {
  isAtLeastAge,
  computeAgeInYears,
  AGE_GATE_MINIMUM_AGE,
  AGE_GATE_COPPA_AGE,
} from "@/domain/safety/age-gate";

describe("age-gate", () => {
  describe("AGE_GATE_MINIMUM_AGE", () => {
    it("is 18", () => {
      expect(AGE_GATE_MINIMUM_AGE).toBe(18);
    });
  });

  describe("AGE_GATE_COPPA_AGE", () => {
    it("is 13", () => {
      expect(AGE_GATE_COPPA_AGE).toBe(13);
    });
  });

  describe("isAtLeastAge", () => {
    it("returns true for someone born exactly 18 years ago", () => {
      const now = new Date("2026-01-15T12:00:00Z");
      const dob = "2008-01-15";
      expect(isAtLeastAge(dob, 18, now)).toBe(true);
    });

    it("returns false for someone born one day before 18th birthday", () => {
      const now = new Date("2026-01-14T12:00:00Z");
      const dob = "2008-01-15";
      expect(isAtLeastAge(dob, 18, now)).toBe(false);
    });

    it("returns true for someone well over 18", () => {
      const now = new Date("2026-05-05T12:00:00Z");
      const dob = "1990-03-10";
      expect(isAtLeastAge(dob, 18, now)).toBe(true);
    });

    it("returns false for a 17-year-old", () => {
      const now = new Date("2026-05-05T12:00:00Z");
      const dob = "2009-05-06";
      expect(isAtLeastAge(dob, 18, now)).toBe(false);
    });

    it("rejects under-13 for COPPA age gate", () => {
      const now = new Date("2026-05-05T12:00:00Z");
      const dob = "2018-01-01";
      expect(isAtLeastAge(dob, 13, now)).toBe(false);
    });

    it("accepts someone exactly at COPPA age", () => {
      const now = new Date("2026-01-01T00:00:00Z");
      const dob = "2013-01-01";
      expect(isAtLeastAge(dob, 13, now)).toBe(true);
    });

    it("returns false for invalid date string", () => {
      const now = new Date("2026-05-05T12:00:00Z");
      expect(isAtLeastAge("not-a-date", 18, now)).toBe(false);
    });

    it("returns false for empty string", () => {
      const now = new Date("2026-05-05T12:00:00Z");
      expect(isAtLeastAge("", 18, now)).toBe(false);
    });

    it("returns false for slashed date format", () => {
      const now = new Date("2026-05-05T12:00:00Z");
      expect(isAtLeastAge("2008/01/15", 18, now)).toBe(false);
    });

    it("returns false for invalid calendar date (Feb 30)", () => {
      const now = new Date("2026-05-05T12:00:00Z");
      expect(isAtLeastAge("2008-02-30", 18, now)).toBe(false);
    });

    it("returns false for future-dated DOB", () => {
      const now = new Date("2026-05-05T12:00:00Z");
      expect(isAtLeastAge("2030-01-01", 18, now)).toBe(false);
    });

    it("returns false for year before 1900", () => {
      const now = new Date("2026-05-05T12:00:00Z");
      expect(isAtLeastAge("1899-12-31", 18, now)).toBe(false);
    });

    it("handles leap year Feb 29 birthday correctly", () => {
      const now = new Date("2026-03-01T00:00:00Z");
      const dob = "2008-02-29";
      expect(isAtLeastAge(dob, 18, now)).toBe(true);
    });
  });

  describe("computeAgeInYears", () => {
    it("returns correct age for adult", () => {
      const now = new Date("2026-05-05T12:00:00Z");
      const dob = "1990-05-05";
      expect(computeAgeInYears(dob, now)).toBe(36);
    });

    it("returns null for invalid date", () => {
      const now = new Date("2026-05-05T12:00:00Z");
      expect(computeAgeInYears("invalid", now)).toBeNull();
    });

    it("adjusts age before birthday this year", () => {
      const now = new Date("2026-04-01T12:00:00Z");
      const dob = "1990-05-15";
      expect(computeAgeInYears(dob, now)).toBe(35);
    });

    it("returns 0 for a baby born today", () => {
      const now = new Date("2026-05-05T12:00:00Z");
      const dob = "2026-05-05";
      expect(computeAgeInYears(dob, now)).toBe(0);
    });
  });
});