import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export const getCurrentUser = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
});

function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url == null || anonKey == null || url === "" || anonKey === "") {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return { url, anonKey };
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (authorization == null) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function getRequestAuth(request: Request) {
  const bearerToken = getBearerToken(request);

  if (bearerToken !== null) {
    const { url, anonKey } = getSupabasePublicConfig();
    const supabase = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(bearerToken);

    if (error !== null) {
      return { user: null, accessToken: bearerToken };
    }

    return { user, accessToken: bearerToken };
  }

  return {
    user: await getCurrentUser(),
    accessToken: null,
  };
}

export async function getRequestUser(request: Request) {
  const { user } = await getRequestAuth(request);
  return user;
}

/**
 * Returns true when the user has submitted a DOB that places them at or
 * above AGE_GATE_MINIMUM_AGE (18).
 *
 * We explicitly check `age_verified_dob` — the flag set by the DOB-based
 * gate in `/app/age-gate/actions.ts`. The legacy `age_verified` flag
 * (set by the prior self-attestation "I'm 17+" button) is intentionally
 * NOT honored: with the SB 243 / COPPA upgrade to a 18+ DOB gate, every
 * user must re-verify with a real date of birth. Users who predate the
 * DOB gate will be routed to `/age-gate` on their next visit.
 *
 * Stored in Supabase auth app_metadata (admin-only, same as billing
 * status) so it survives without a DB migration and is available before
 * a profile row exists.
 */
export function isAgeVerified(user: User | null): boolean {
  if (user === null) return false;
  return user.app_metadata?.age_verified_dob === true;
}
