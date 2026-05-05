import type { User } from "@supabase/supabase-js";

export type AccessLevel = "free" | "pro" | "internal";

export type FeatureAccess = {
  canViewFullBlueprint: boolean;
  canGenerateUnlimitedToday: boolean;
  canAskUnlimited: boolean;
  canViewFullForecast: boolean;
};

export type DailyUsageLimits = {
  askQuestionsPerDay: number | null;
  askBigDecisionPerWeek: number | null;
  todayRefreshesPerDay: number | null;
};

const ACCESS_LEVEL_RANK: Record<AccessLevel, number> = {
  free: 0,
  pro: 1,
  internal: 2,
};

type AccessUser = Pick<User, "email" | "app_metadata" | "user_metadata">;

function normalizeAccessLevel(value: unknown): AccessLevel | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "free" || normalized === "pro" || normalized === "internal") {
    return normalized;
  }

  return null;
}

function getInternalAccessEmails() {
  return (process.env.TEST_FULL_ACCESS_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value !== "");
}

export function getUserAccessLevel(user: AccessUser | null): AccessLevel {
  return getResolvedUserAccessLevel(user, null);
}

export function getResolvedUserAccessLevel(
  user: AccessUser | null,
  accessLevelOverride: AccessLevel | null,
): AccessLevel {
  if (accessLevelOverride !== null) {
    return accessLevelOverride;
  }

  if (user === null) {
    return "free";
  }

  const normalizedEmail = user.email?.trim().toLowerCase() ?? "";

  if (
    normalizedEmail !== "" &&
    getInternalAccessEmails().includes(normalizedEmail)
  ) {
    return "internal";
  }

  const metadataAccessLevel =
    normalizeAccessLevel(user.app_metadata?.access_level) ??
    normalizeAccessLevel(user.app_metadata?.accessLevel) ??
    normalizeAccessLevel(user.app_metadata?.tier) ??
    normalizeAccessLevel(user.app_metadata?.plan) ??
    normalizeAccessLevel(user.user_metadata?.access_level) ??
    normalizeAccessLevel(user.user_metadata?.accessLevel) ??
    normalizeAccessLevel(user.user_metadata?.tier) ??
    normalizeAccessLevel(user.user_metadata?.plan);

  if (metadataAccessLevel === "pro") {
    return "pro";
  }

  return "free";
}

export function getFeatureAccess(accessLevel: AccessLevel): FeatureAccess {
  if (accessLevel === "free") {
    return {
      canViewFullBlueprint: false,
      canGenerateUnlimitedToday: false,
      canAskUnlimited: false,
      canViewFullForecast: false,
    };
  }

  return {
    canViewFullBlueprint: true,
    canGenerateUnlimitedToday: true,
    canAskUnlimited: true,
    canViewFullForecast: true,
  };
}

export function getDailyUsageLimits(accessLevel: AccessLevel): DailyUsageLimits {
  if (accessLevel === "free") {
    return {
      askQuestionsPerDay: 3,
      askBigDecisionPerWeek: 1,
      todayRefreshesPerDay: 3,
    };
  }

  return {
    askQuestionsPerDay: null,
    askBigDecisionPerWeek: null,
    todayRefreshesPerDay: null,
  };
}

export function getUserAccessState(user: AccessUser | null) {
  return getResolvedUserAccessState(user, null);
}

export function getResolvedUserAccessState(
  user: AccessUser | null,
  accessLevelOverride: AccessLevel | null,
) {
  const accessLevel = getResolvedUserAccessLevel(user, accessLevelOverride);

  return {
    accessLevel,
    featureAccess: getFeatureAccess(accessLevel),
    dailyUsageLimits: getDailyUsageLimits(accessLevel),
  };
}

export function compareAccessLevels(
  left: AccessLevel,
  right: AccessLevel,
) {
  return ACCESS_LEVEL_RANK[left] - ACCESS_LEVEL_RANK[right];
}

export function getArtifactGenerationAccessLevel(
  accessLevel: AccessLevel | null | undefined,
): AccessLevel {
  // Artifacts created before tier-aware generation shipped do not have a marker.
  // Treat them as free-tier artifacts so richer tiers do not simply reveal more
  // of an object that may not have been generated with paid context.
  return accessLevel ?? "free";
}

function getContentDepthRank(accessLevel: AccessLevel) {
  return accessLevel === "free" ? 0 : 1;
}

export function isArtifactStaleForCurrentAccess(
  currentAccessLevel: AccessLevel,
  artifactGenerationAccessLevel: AccessLevel | null | undefined,
) {
  return (
    getContentDepthRank(currentAccessLevel) >
    getContentDepthRank(
      getArtifactGenerationAccessLevel(artifactGenerationAccessLevel),
    )
  );
}
