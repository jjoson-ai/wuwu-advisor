const STORAGE_PREFIX = "wuwu-advisor";

type UsageFeature = "ask" | "today-refresh";

function getLocalDayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Returns the date string (YYYY-MM-DD) for the Monday of the current local
 * week. Used as the rolling weekly storage key — resets automatically when the
 * user's clock passes into a new Monday-anchored week.
 */
function getLocalWeekKey() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, …, 6 = Sat
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysToMonday);
  const year = monday.getFullYear();
  const month = `${monday.getMonth() + 1}`.padStart(2, "0");
  const day = `${monday.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStorageKey(feature: UsageFeature, userKey: string) {
  return `${STORAGE_PREFIX}:${feature}:${userKey}:${getLocalDayKey()}`;
}

function getWeeklyStorageKey(userKey: string) {
  return `${STORAGE_PREFIX}:ask-big-decision:${userKey}:${getLocalWeekKey()}`;
}

export function getUsageCount(feature: UsageFeature, userKey: string) {
  if (typeof window === "undefined") {
    return 0;
  }

  const value = window.localStorage.getItem(getStorageKey(feature, userKey));

  if (value === null) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function incrementUsageCount(feature: UsageFeature, userKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  const nextValue = getUsageCount(feature, userKey) + 1;
  window.localStorage.setItem(getStorageKey(feature, userKey), String(nextValue));
}

export function getWeeklyBigDecisionCount(userKey: string) {
  if (typeof window === "undefined") {
    return 0;
  }

  const value = window.localStorage.getItem(getWeeklyStorageKey(userKey));

  if (value === null) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function incrementWeeklyBigDecisionCount(userKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  const nextValue = getWeeklyBigDecisionCount(userKey) + 1;
  window.localStorage.setItem(getWeeklyStorageKey(userKey), String(nextValue));
}
