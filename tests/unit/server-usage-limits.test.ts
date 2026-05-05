import { describe, it, expect, vi } from "vitest";
import { getDailyPeriodKey, getWeeklyPeriodKey } from "@/lib/server-usage-limits";

describe("server-usage-limits", () => {
  describe("getDailyPeriodKey", () => {
    it("returns YYYY-MM-DD format for a valid timezone", () => {
      const key = getDailyPeriodKey("America/New_York");
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns YYYY-MM-DD format for UTC", () => {
      const key = getDailyPeriodKey("UTC");
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns YYYY-MM-DD format for Europe/Madrid", () => {
      const key = getDailyPeriodKey("Europe/Madrid");
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("falls back to UTC for invalid timezone", () => {
      const key = getDailyPeriodKey("Invalid/Timezone");
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("falls back to UTC for null timezone", () => {
      const key = getDailyPeriodKey(null);
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("falls back to UTC for empty string timezone", () => {
      const key = getDailyPeriodKey("");
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("falls back to UTC for undefined timezone", () => {
      const key = getDailyPeriodKey(undefined);
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns consistent format across different valid timezones", () => {
      const nyc = getDailyPeriodKey("America/New_York");
      const tokyo = getDailyPeriodKey("Asia/Tokyo");
      const utc = getDailyPeriodKey("UTC");

      expect(nyc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(tokyo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(utc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("getWeeklyPeriodKey", () => {
    it("returns a string matching YYYY-WNN format", () => {
      const key = getWeeklyPeriodKey("America/New_York");
      expect(key).toMatch(/^\d{4}-W\d{2}$/);
    });

    it("returns a consistent value for the same date in the same timezone", () => {
      const key1 = getWeeklyPeriodKey("Europe/Madrid");
      const key2 = getWeeklyPeriodKey("Europe/Madrid");
      expect(key1).toBe(key2);
    });

    it("falls back to UTC on invalid timezone", () => {
      const key = getWeeklyPeriodKey("Invalid/Timezone");
      expect(key).toMatch(/^\d{4}-W\d{2}$/);
    });

    it("falls back to UTC on null timezone", () => {
      const key = getWeeklyPeriodKey(null);
      expect(key).toMatch(/^\d{4}-W\d{2}$/);
    });

    it("handles ISO week-year boundary: 2018-12-31 → 2019-W01", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2018-12-31T12:00:00Z"));
      const key = getWeeklyPeriodKey("UTC");
      vi.useRealTimers();
      expect(key).toBe("2019-W01");
    });

    it("handles ISO week-year boundary: 2020-01-01 → 2020-W01", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2020-01-01T12:00:00Z"));
      const key = getWeeklyPeriodKey("UTC");
      vi.useRealTimers();
      expect(key).toBe("2020-W01");
    });

    it("handles ISO week-year boundary: 2021-01-04 → 2021-W01", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2021-01-04T12:00:00Z"));
      const key = getWeeklyPeriodKey("UTC");
      vi.useRealTimers();
      expect(key).toBe("2021-W01");
    });

    it("handles ISO week-year boundary: 2022-01-03 → 2022-W01", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2022-01-03T12:00:00Z"));
      const key = getWeeklyPeriodKey("UTC");
      vi.useRealTimers();
      expect(key).toBe("2022-W01");
    });

    it("returns a different week key for dates 7+ days apart", () => {
      vi.useFakeTimers();
      const key1 = getWeeklyPeriodKey("UTC");
      vi.setSystemTime(new Date(Date.now() + 8 * 86400000));
      const key2 = getWeeklyPeriodKey("UTC");
      vi.useRealTimers();
      expect(key1).not.toBe(key2);
    });
  });

  // tryIncrementUsageCount and getUsageCount require a real Supabase instance
  // with the try_increment_usage_counter RPC. These are integration-test scope
  // and are intentionally NOT covered by this unit test suite.
});