import { NextRequest, NextResponse } from "next/server";

import { isAgeVerified } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  if (code === null || code === "") {
    return NextResponse.redirect(
      new URL("/login?error=Missing+auth+code", requestUrl.origin),
    );
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error !== null) {
    return NextResponse.redirect(
      new URL(
        "/login?error=" + encodeURIComponent(error.message),
        requestUrl.origin,
      ),
    );
  }

  // After successful OAuth exchange, check the age gate.
  // New users (and existing users who predate the gate) will not have
  // age_verified set in app_metadata and must confirm before proceeding.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAgeVerified(user)) {
    const ageGateUrl = new URL("/age-gate", requestUrl.origin);
    ageGateUrl.searchParams.set("next", next);
    return NextResponse.redirect(ageGateUrl);
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
