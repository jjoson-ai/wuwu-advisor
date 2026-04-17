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
