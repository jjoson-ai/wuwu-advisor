const FALLBACK_TIME_ZONES = [
  "UTC",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

export const DEFAULT_TIME_ZONE = "UTC";

export function isSupportedTimeZone(value: string | null | undefined) {
  const normalized = value?.trim();

  if (normalized == null || normalized === "") {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized });
    return true;
  } catch {
    return false;
  }
}

export function getSupportedTimeZones() {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      return Array.from(
        new Set([DEFAULT_TIME_ZONE, ...Intl.supportedValuesOf("timeZone")]),
      ).sort((first, second) => first.localeCompare(second));
    }
  } catch {
    return [...FALLBACK_TIME_ZONES];
  }

  return [...FALLBACK_TIME_ZONES];
}

export function getSafeTimeZone(value: string | null | undefined) {
  return isSupportedTimeZone(value) ? value!.trim() : DEFAULT_TIME_ZONE;
}

/**
 * Browser-side: read the user's IANA timezone from the OS via Intl.
 * Returns null on SSR or unsupported runtimes — caller decides fallback.
 *
 * UX audit C-01 (2026-04-26): replace the raw IANA dump in onboarding with
 * detected default + edit affordance. Detection happens here so the form can
 * pre-fill confidently on mount and skip the user's scroll-and-pray.
 */
export function detectBrowserTimeZone(): string | null {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isSupportedTimeZone(detected) ? detected : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort human label for a IANA timezone. Returns the long-form name
 * if the runtime exposes it (e.g. "Eastern Standard Time"), otherwise the
 * IANA string itself. Never throws.
 */
export function formatTimeZoneLabel(iana: string): string {
  if (!isSupportedTimeZone(iana)) {
    return iana;
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: iana,
      timeZoneName: "long",
    }).formatToParts(new Date());
    const tz = parts.find((part) => part.type === "timeZoneName")?.value;
    if (tz != null && tz.trim() !== "") {
      return tz;
    }
  } catch {
    // fall through to the IANA string
  }
  return iana;
}
