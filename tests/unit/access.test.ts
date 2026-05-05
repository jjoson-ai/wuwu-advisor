import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getResolvedUserAccessLevel,
  getDailyUsageLimits,
  compareAccessLevels,
  getFeatureAccess,
  getUserAccessState,
  isArtifactStaleForCurrentAccess,
} from "@/lib/access";
import type { AccessLevel } from "@/lib/access";

describe("access", () => {
  describe("getResolvedUserAccessLevel", () => {
    it("returns free for null user", () => {
      expect(getResolvedUserAccessLevel(null, null)).toBe("free");
    });

    it("returns pro for user with app_metadata.access_level='pro'", () => {
      const user = {
        email: "test@example.com",
        app_metadata: { access_level: "pro" },
        user_metadata: {},
      };
      expect(getResolvedUserAccessLevel(user, null)).toBe("pro");
    });

    it("returns pro for user with app_metadata.tier='pro'", () => {
      const user = {
        email: "test@example.com",
        app_metadata: { tier: "pro" },
        user_metadata: {},
      };
      expect(getResolvedUserAccessLevel(user, null)).toBe("pro");
    });

    it("returns pro for user with app_metadata.plan='pro'", () => {
      const user = {
        email: "test@example.com",
        app_metadata: { plan: "pro" },
        user_metadata: {},
      };
      expect(getResolvedUserAccessLevel(user, null)).toBe("pro");
    });

    it("returns internal for user in TEST_FULL_ACCESS_EMAILS", () => {
      const original = process.env.TEST_FULL_ACCESS_EMAILS;
      process.env.TEST_FULL_ACCESS_EMAILS = "admin@example.com,ops@example.com";

      const user = {
        email: "admin@example.com",
        app_metadata: {},
        user_metadata: {},
      };
      expect(getResolvedUserAccessLevel(user, null)).toBe("internal");

      process.env.TEST_FULL_ACCESS_EMAILS = original;
    });

    it("returns free for user with no pro metadata", () => {
      const user = {
        email: "test@example.com",
        app_metadata: {},
        user_metadata: {},
      };
      expect(getResolvedUserAccessLevel(user, null)).toBe("free");
    });

    it("honors accessLevelOverride over user metadata", () => {
      const user = {
        email: "test@example.com",
        app_metadata: { access_level: "pro" },
        user_metadata: {},
      };
      expect(getResolvedUserAccessLevel(user, "free")).toBe("free");
      expect(getResolvedUserAccessLevel(user, "internal")).toBe("internal");
    });

    it("is case-insensitive for access_level metadata", () => {
      const user = {
        email: "test@example.com",
        app_metadata: { access_level: "Pro" },
        user_metadata: {},
      };
      expect(getResolvedUserAccessLevel(user, null)).toBe("pro");
    });

    it("checks user_metadata as fallback", () => {
      const user = {
        email: "test@example.com",
        app_metadata: {},
        user_metadata: { access_level: "pro" },
      };
      expect(getResolvedUserAccessLevel(user, null)).toBe("pro");
    });

    it("does NOT promote internal from metadata alone", () => {
      const user = {
        email: "test@example.com",
        app_metadata: { access_level: "internal" },
        user_metadata: {},
      };
      expect(getResolvedUserAccessLevel(user, null)).toBe("free");
    });
  });

  describe("getDailyUsageLimits", () => {
    it("returns numeric caps for free tier", () => {
      const limits = getDailyUsageLimits("free");
      expect(limits.askQuestionsPerDay).toBe(3);
      expect(limits.askBigDecisionPerWeek).toBe(1);
      expect(limits.todayRefreshesPerDay).toBe(3);
    });

    it("returns null caps for pro tier (unlimited)", () => {
      const limits = getDailyUsageLimits("pro");
      expect(limits.askQuestionsPerDay).toBeNull();
      expect(limits.askBigDecisionPerWeek).toBeNull();
      expect(limits.todayRefreshesPerDay).toBeNull();
    });

    it("returns null caps for internal tier (unlimited)", () => {
      const limits = getDailyUsageLimits("internal");
      expect(limits.askQuestionsPerDay).toBeNull();
    });
  });

  describe("compareAccessLevels", () => {
    it("pro > free", () => {
      expect(compareAccessLevels("pro", "free")).toBeGreaterThan(0);
    });

    it("free < pro", () => {
      expect(compareAccessLevels("free", "pro")).toBeLessThan(0);
    });

    it("pro == pro", () => {
      expect(compareAccessLevels("pro", "pro")).toBe(0);
    });

    it("internal > pro > free", () => {
      expect(compareAccessLevels("internal", "pro")).toBeGreaterThan(0);
      expect(compareAccessLevels("pro", "free")).toBeGreaterThan(0);
    });
  });

  describe("getFeatureAccess", () => {
    it("returns all false for free tier", () => {
      const access = getFeatureAccess("free");
      expect(access.canViewFullBlueprint).toBe(false);
      expect(access.canGenerateUnlimitedToday).toBe(false);
      expect(access.canAskUnlimited).toBe(false);
      expect(access.canViewFullForecast).toBe(false);
    });

    it("returns all true for pro tier", () => {
      const access = getFeatureAccess("pro");
      expect(access.canViewFullBlueprint).toBe(true);
      expect(access.canGenerateUnlimitedToday).toBe(true);
      expect(access.canAskUnlimited).toBe(true);
      expect(access.canViewFullForecast).toBe(true);
    });
  });

  describe("isArtifactStaleForCurrentAccess", () => {
    it("pro user viewing free-generated artifact is stale", () => {
      expect(isArtifactStaleForCurrentAccess("pro", "free")).toBe(true);
    });

    it("free user viewing free-generated artifact is not stale", () => {
      expect(isArtifactStaleForCurrentAccess("free", "free")).toBe(false);
    });

    it("pro user viewing pro-generated artifact is not stale", () => {
      expect(isArtifactStaleForCurrentAccess("pro", "pro")).toBe(false);
    });

    it("null generation level treated as free", () => {
      expect(isArtifactStaleForCurrentAccess("pro", null)).toBe(true);
    });
  });
});