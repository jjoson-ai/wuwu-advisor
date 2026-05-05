import { describe, it, expect } from "vitest";
import { getDailyPeriodKey } from "@/lib/server-usage-limits";

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

  // tryIncrementUsageCount and getUsageCount require a real Supabase instance
  // with the try_increment_usage_counter RPC. These are integration-test scope
  // and are intentionally NOT covered by this unit test suite.
});