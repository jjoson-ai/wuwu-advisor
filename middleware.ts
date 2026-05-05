import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  ATTRIBUTION_COOKIE,
  EMPTY_ATTRIBUTION,
  parseAttributionCookie,
  serializeAttributionCookie,
  type AttributionClickIds,
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

/**
 * Extract a bare host from a referer header. Returns null when referrer is
 * same-origin or missing — we don't want to classify own-site navigation as
 * "referral". Strips :port and lowercases.
 */
function extractExternalReferrerHost(
  refererHeader: string | null,
  selfHost: string | null,
): string | null {
  if (refererHeader == null || refererHeader === "") {
    return null;
  }

  try {
    const url = new URL(refererHeader);
    const host = url.host.toLowerCase().replace(/:\d+$/, "");

    if (selfHost !== null && host === selfHost) {
      return null;
    }

    return host;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
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
    if (!(await isOpsSessionValid(cookieValue))) {
      const loginUrl = new URL("/ops/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  const response = NextResponse.next();

  // Skip attribution capture on ops routes (internal traffic, not marketing
  // touchpoints) and on API / static asset paths (attribution is about the
  // landing page the human hit, not the first XHR that happens to fly).
  if (
    pathname.startsWith("/ops") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/")
  ) {
    return response;
  }

  const currentValue = request.cookies.get(ATTRIBUTION_COOKIE)?.value;
  const existing = parseAttributionCookie(currentValue) ?? EMPTY_ATTRIBUTION;

  // Extract inbound touch from this request. First-touch semantics: each
  // field only sets if the existing cookie has null for it. So a user who
  // first lands organic and later clicks a Google ad will have utm_* updated
  // only if they were missing — which is the correct first-touch behavior.
  const incomingGclid = getQueryValue(request.nextUrl, "gclid");
  const incomingGbraid = getQueryValue(request.nextUrl, "gbraid");
  const incomingWbraid = getQueryValue(request.nextUrl, "wbraid");
  const incomingFbclid = getQueryValue(request.nextUrl, "fbclid");
  const incomingUtmSource = getQueryValue(request.nextUrl, "utm_source");
  const incomingUtmMedium = getQueryValue(request.nextUrl, "utm_medium");
  const incomingUtmCampaign = getQueryValue(request.nextUrl, "utm_campaign");
  const incomingUtmContent = getQueryValue(request.nextUrl, "utm_content");
  const incomingUtmTerm = getQueryValue(request.nextUrl, "utm_term");

  // Landing path + external referrer are only meaningful on the *first*
  // server-rendered page view. We stamp them only if the cookie is brand new
  // (all-null existing state). Subsequent pageviews don't clobber them.
  const isFirstTouch =
    existing.gclid === null &&
    existing.gbraid === null &&
    existing.wbraid === null &&
    existing.fbclid === null &&
    existing.utm_source === null &&
    existing.utm_medium === null &&
    existing.utm_campaign === null &&
    existing.landing_path === null &&
    existing.referrer_host === null &&
    existing.captured_at === null;

  const selfHost = request.nextUrl.host.toLowerCase().replace(/:\d+$/, "");
  const externalReferrerHost = extractExternalReferrerHost(
    request.headers.get("referer"),
    selfHost,
  );

  const hasAnyInboundSignal =
    incomingGclid !== null ||
    incomingGbraid !== null ||
    incomingWbraid !== null ||
    incomingFbclid !== null ||
    incomingUtmSource !== null ||
    incomingUtmMedium !== null ||
    incomingUtmCampaign !== null ||
    incomingUtmContent !== null ||
    incomingUtmTerm !== null ||
    (isFirstTouch && externalReferrerHost !== null);

  const nextAttribution: AttributionClickIds = {
    gclid: existing.gclid ?? incomingGclid,
    gbraid: existing.gbraid ?? incomingGbraid,
    wbraid: existing.wbraid ?? incomingWbraid,
    fbclid: existing.fbclid ?? incomingFbclid,
    utm_source: existing.utm_source ?? incomingUtmSource,
    utm_medium: existing.utm_medium ?? incomingUtmMedium,
    utm_campaign: existing.utm_campaign ?? incomingUtmCampaign,
    utm_content: existing.utm_content ?? incomingUtmContent,
    utm_term: existing.utm_term ?? incomingUtmTerm,
    landing_path:
      existing.landing_path ?? (isFirstTouch ? pathname : null),
    referrer_host:
      existing.referrer_host ?? (isFirstTouch ? externalReferrerHost : null),
    captured_at:
      existing.captured_at ?? (hasAnyInboundSignal ? new Date().toISOString() : null),
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
