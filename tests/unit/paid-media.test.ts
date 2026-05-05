import { describe, it, expect } from "vitest";
import { deriveAttributionChannel } from "@/lib/paid-media";

describe("paid-media", () => {
  describe("deriveAttributionChannel", () => {
    it("returns google_paid for gclid", () => {
      expect(deriveAttributionChannel({ gclid: "CjwK123" })).toBe("google_paid");
    });

    it("returns google_paid for gbraid", () => {
      expect(deriveAttributionChannel({ gbraid: "gb123" })).toBe("google_paid");
    });

    it("returns google_paid for wbraid", () => {
      expect(deriveAttributionChannel({ wbraid: "wb123" })).toBe("google_paid");
    });

    it("returns google_paid for utm_source=google + utm_medium=cpc", () => {
      expect(
        deriveAttributionChannel({ utm_source: "google", utm_medium: "cpc" }),
      ).toBe("google_paid");
    });

    it("does NOT return google_paid for utm_source=google without paid medium", () => {
      const result = deriveAttributionChannel({
        utm_source: "google",
        utm_medium: "organic",
      });
      expect(result).not.toBe("google_paid");
    });

    it("returns meta_paid for fbclid", () => {
      expect(deriveAttributionChannel({ fbclid: "fb123" })).toBe("meta_paid");
    });

    it("returns meta_paid for utm_source=facebook", () => {
      expect(deriveAttributionChannel({ utm_source: "facebook" })).toBe("meta_paid");
    });

    it("returns meta_paid for utm_source=ig", () => {
      expect(deriveAttributionChannel({ utm_source: "ig" })).toBe("meta_paid");
    });

    it("returns other_paid for non-Google/Meta UTM source with no medium", () => {
      expect(deriveAttributionChannel({ utm_source: "tiktok" })).toBe("other_paid");
    });

    it("returns other_paid for paid medium without recognized source", () => {
      expect(
        deriveAttributionChannel({ utm_medium: "cpc" }),
      ).toBe("other_paid");
    });

    it("returns organic_search for Google referrer", () => {
      expect(
        deriveAttributionChannel({ referrer_host: "www.google.com" }),
      ).toBe("organic_search");
    });

    it("returns organic_search for Bing referrer", () => {
      expect(
        deriveAttributionChannel({ referrer_host: "www.bing.com" }),
      ).toBe("organic_search");
    });

    it("returns referral for non-search referrer", () => {
      expect(
        deriveAttributionChannel({ referrer_host: "some-blog.com" }),
      ).toBe("referral");
    });

    it("returns direct for empty input", () => {
      expect(deriveAttributionChannel({})).toBe("direct");
    });

    it("gclid wins over fbclid (Google paid first priority)", () => {
      expect(
        deriveAttributionChannel({ gclid: "g1", fbclid: "f1" }),
      ).toBe("google_paid");
    });

    it("fbclid wins over UTM-based classification", () => {
      expect(
        deriveAttributionChannel({ fbclid: "f1", utm_source: "tiktok" }),
      ).toBe("meta_paid");
    });

    it("handles case-insensitive UTM source", () => {
      expect(deriveAttributionChannel({ utm_source: "Facebook" })).toBe("meta_paid");
    });

    it("handles whitespace in UTM values", () => {
      expect(
        deriveAttributionChannel({ utm_source: "  google  ", utm_medium: " cpc " }),
      ).toBe("google_paid");
    });

    it("returns organic_search for DuckDuckGo referrer", () => {
      expect(
        deriveAttributionChannel({ referrer_host: "duckduckgo.com" }),
      ).toBe("organic_search");
    });
  });
});