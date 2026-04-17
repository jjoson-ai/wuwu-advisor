import AsyncStorage from "@react-native-async-storage/async-storage";

const TRACKING_STORAGE_KEY = "wuwu.tracking-preferences.v1";

export type TrackingPreferenceState = {
  trackingEnabled: boolean;
  updatedAt: string;
};

export async function getTrackingPreference() {
  const rawValue = await AsyncStorage.getItem(TRACKING_STORAGE_KEY);

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
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function saveTrackingPreference(trackingEnabled: boolean) {
  const value: TrackingPreferenceState = {
    trackingEnabled,
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(value));
  return value;
}
