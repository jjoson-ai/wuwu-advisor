import { cache } from "react";
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
