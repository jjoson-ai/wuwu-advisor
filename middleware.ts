import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  ATTRIBUTION_COOKIE,
  parseAttributionCookie,
  serializeAttributionCookie,
} from "@/lib/paid-media";
import { isOpsSessionValid, OPS_AUTH_COOKIE } from "@/lib/ops-auth";

/** Paths under /ops that don't require an ops session */
const OPS_PUBLIC_PATHS = ["/ops/login"];
/** API routes that don't require an ops session (the auth endpoint itself) */
const OPS_AUTH_API_PATH = "/api/ops/auth";

function getQueryValue(url: URL, key: string) {
  const value = url.searchParams.get(key);

  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Ops dashboard — password-only gate, no Supabase session required
  const isOpsPath =
    pathname.startsWith("/ops") || pathname.startsWith("/api/ops");
  const isOpsPublic =
    OPS_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname === OPS_AUTH_API_PATH ||
    pathname.startsWith(OPS_AUTH_API_PATH + "/");

  if (isOpsPath && !isOpsPublic) {
    const cookieValue = request.cookies.get(OPS_AUTH_COOKIE)?.value;
    if (!isOpsSessionValid(cookieValue)) {
      const loginUrl = new URL("/ops/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  const response = NextResponse.next();
  const currentValue = request.cookies.get(ATTRIBUTION_COOKIE)?.value;
  const existing = parseAttributionCookie(currentValue) ?? {
    gclid: null,
    gbraid: null,
    wbraid: null,
    fbclid: null,
    captured_at: null,
  };

  const nextAttribution = {
    gclid: existing.gclid ?? getQueryValue(request.nextUrl, "gclid"),
    gbraid: existing.gbraid ?? getQueryValue(request.nextUrl, "gbraid"),
    wbraid: existing.wbraid ?? getQueryValue(request.nextUrl, "wbraid"),
    fbclid: existing.fbclid ?? getQueryValue(request.nextUrl, "fbclid"),
    captured_at:
      existing.captured_at ??
      (getQueryValue(request.nextUrl, "gclid") != null ||
      getQueryValue(request.nextUrl, "gbraid") != null ||
      getQueryValue(request.nextUrl, "wbraid") != null ||
      getQueryValue(request.nextUrl, "fbclid") != null
        ? new Date().toISOString()
        : null),
  };

  if (JSON.stringify(existing) !== JSON.stringify(nextAttribution)) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[paid_media] captured_attribution", nextAttribution);
    }

    response.cookies.set(ATTRIBUTION_COOKIE, serializeAttributionCookie(nextAttribution), {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 90,
      httpOnly: true,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
