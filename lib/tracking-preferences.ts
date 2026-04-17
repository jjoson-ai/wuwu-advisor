"use client";

export const TRACKING_STORAGE_KEY = "wuwu.tracking-preferences.v1";

export type TrackingPreferenceState = {
  trackingEnabled: boolean;
  updatedAt: string;
};

export function readTrackingPreference() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(TRACKING_STORAGE_KEY);

  if (rawValue === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<TrackingPreferenceState>;

    if (typeof parsed.trackingEnabled !== "boolean") {
      return null;
    }

    return {
      trackingEnabled: parsed.trackingEnabled,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeTrackingPreference(trackingEnabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  const value: TrackingPreferenceState = {
    trackingEnabled,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(value));
}
