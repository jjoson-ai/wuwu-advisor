import { cookies } from "next/headers";

import { CHECKOUT_ACCESS_COOKIE } from "@/lib/billing";
import {
  compareAccessLevels,
  getResolvedUserAccessState,
  type AccessLevel,
} from "@/lib/access";

export const DEBUG_ACCESS_OVERRIDE_COOKIE = "wuwu_debug_access_level";
export const DEBUG_ACCESS_OVERRIDE_HEADER = "x-wuwu-debug-access-level";

function parseAccessLevelOverride(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized === "free" ||
    normalized === "pro" ||
    normalized === "internal"
  ) {
    return normalized satisfies AccessLevel;
  }

  return null;
}

function getCookieValue(cookieHeader: string | null, name: string) {
  if (cookieHeader == null || cookieHeader.trim() === "") {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValueParts] = part.split("=");
    const key = rawKey.trim();

    if (key !== name) {
      continue;
    }

    return rawValueParts.join("=").trim() || null;
  }

  return null;
}

function getCheckoutAccessLevelBridge(
  user: AccessUser,
  cookieAccessLevel: AccessLevel | null,
) {
  if (cookieAccessLevel === null) {
    return null;
  }

  const resolvedAccessState = getResolvedUserAccessState(user, null);

  if (compareAccessLevels(cookieAccessLevel, resolvedAccessState.accessLevel) <= 0) {
    return null;
  }

  return cookieAccessLevel;
}

export function isDebugAccessOverrideEnabled() {
  return process.env.DEBUG_ACCESS_ENABLED === "true";
}

export async function getServerDebugAccessLevelOverride() {
  if (isDebugAccessOverrideEnabled() === false) {
    return null;
  }

  const cookieStore = await cookies();
  return parseAccessLevelOverride(
    cookieStore.get(DEBUG_ACCESS_OVERRIDE_COOKIE)?.value,
  );
}

export function getRequestDebugAccessLevelOverride(request: Request) {
  if (isDebugAccessOverrideEnabled() === false) {
    return null;
  }

  return (
    parseAccessLevelOverride(
      request.headers.get(DEBUG_ACCESS_OVERRIDE_HEADER),
    ) ??
    parseAccessLevelOverride(
      getCookieValue(
        request.headers.get("cookie"),
        DEBUG_ACCESS_OVERRIDE_COOKIE,
      ),
    )
  );
}

type AccessUser = Parameters<typeof getResolvedUserAccessState>[0];

export async function getServerAccessState(user: AccessUser) {
  const debugOverride = await getServerDebugAccessLevelOverride();

  if (debugOverride !== null) {
    return getResolvedUserAccessState(user, debugOverride);
  }

  const cookieStore = await cookies();
  const checkoutBridgeAccessLevel = getCheckoutAccessLevelBridge(
    user,
    parseAccessLevelOverride(cookieStore.get(CHECKOUT_ACCESS_COOKIE)?.value),
  );

  return getResolvedUserAccessState(user, checkoutBridgeAccessLevel);
}

export function getRequestAccessState(user: AccessUser, request: Request) {
  const debugOverride = getRequestDebugAccessLevelOverride(request);

  if (debugOverride !== null) {
    return getResolvedUserAccessState(user, debugOverride);
  }

  const checkoutBridgeAccessLevel = getCheckoutAccessLevelBridge(
    user,
    parseAccessLevelOverride(
      getCookieValue(request.headers.get("cookie"), CHECKOUT_ACCESS_COOKIE),
    ),
  );

  return getResolvedUserAccessState(user, checkoutBridgeAccessLevel);
}
