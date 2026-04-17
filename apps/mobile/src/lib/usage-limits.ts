import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "wuwu-advisor";

type UsageFeature = "ask" | "today-refresh";

function getLocalDayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getStorageKey(feature: UsageFeature, userKey: string) {
  return `${STORAGE_PREFIX}:${feature}:${userKey}:${getLocalDayKey()}`;
}

export async function getUsageCount(feature: UsageFeature, userKey: string) {
  const value = await AsyncStorage.getItem(getStorageKey(feature, userKey));

  if (value === null) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : 0;
}

export async function incrementUsageCount(feature: UsageFeature, userKey: string) {
  const nextValue = (await getUsageCount(feature, userKey)) + 1;
  await AsyncStorage.setItem(getStorageKey(feature, userKey), String(nextValue));
}
