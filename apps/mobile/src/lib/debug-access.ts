import AsyncStorage from "@react-native-async-storage/async-storage";

export type DebugAccessLevel = "free" | "pro" | "internal";

const DEBUG_ACCESS_STORAGE_KEY = "wuwu_debug_access_level";
export const DEBUG_ACCESS_OVERRIDE_HEADER = "x-wuwu-debug-access-level";

export async function getDebugAccessLevelOverride() {
  const value = await AsyncStorage.getItem(DEBUG_ACCESS_STORAGE_KEY);

  if (value === "free" || value === "pro" || value === "internal") {
    return value satisfies DebugAccessLevel;
  }

  return null;
}

export async function setDebugAccessLevelOverride(
  value: DebugAccessLevel | null,
) {
  if (value === null) {
    await AsyncStorage.removeItem(DEBUG_ACCESS_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(DEBUG_ACCESS_STORAGE_KEY, value);
}
