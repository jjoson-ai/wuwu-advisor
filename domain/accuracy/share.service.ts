import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 5.2 Phase D — shareable accuracy link persistence.
 *
 * One row per user in `accuracy_shares`. The share_token is a 24-char
 * URL-safe hex string generated in app code. The token is stable — once
 * created it never changes, so shared links remain valid indefinitely.
 *
 * Lookup for the public share page and OG image uses the admin client so
 * it bypasses RLS and can read briefing_feedback for any user_id.
 */

export type AccuracyShareRow = {
  id: string;
  user_id: string;
  share_token: string;
  created_at: string;
};

/**
 * Generate a 24-char URL-safe token using the Web Crypto API.
 * Outputs lowercase hex — safe in URLs without encoding.
 */
function generateShareToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Upsert: if the user already has a share row return its token, otherwise
 * create one. Uses the server client (requires user session) for the write
 * so RLS enforces ownership.
 */
export async function upsertAccuracyShare(
  userId: string,
  accessToken?: string | null,
): Promise<string> {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);

  // Try a cheap read first to avoid re-generating on every call.
  const existing = await supabase
    .from("accuracy_shares")
    .select("share_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing.data?.share_token) {
    return existing.data.share_token;
  }

  const token = generateShareToken();

  const { data, error } = await supabase
    .from("accuracy_shares")
    .upsert(
      { user_id: userId, share_token: token },
      { onConflict: "user_id", ignoreDuplicates: false },
    )
    .select("share_token")
    .single();

  if (error !== null) {
    // If 007 migration hasn't been run yet, give a clear pointer.
    if (
      error.code === "PGRST205" ||
      error.message.includes("schema cache") ||
      error.message.includes("accuracy_shares")
    ) {
      throw new Error(
        "Supabase setup error: accuracy_shares table missing. Run sql/007_accuracy_shares.sql in your Supabase project.",
      );
    }
    throw new Error(error.message || "Unable to create share link.");
  }

  return data.share_token;
}

/**
 * Look up a share row by token. Uses the admin client so the public share
 * page and OG image route can call this without a user session.
 */
export async function getShareByToken(
  token: string,
): Promise<AccuracyShareRow | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("accuracy_shares")
    .select("id, user_id, share_token, created_at")
    .eq("share_token", token)
    .maybeSingle();

  if (error !== null) {
    if (
      error.code === "PGRST205" ||
      error.message.includes("schema cache") ||
      error.message.includes("accuracy_shares")
    ) {
      throw new Error(
        "Supabase setup error: accuracy_shares table missing. Run sql/007_accuracy_shares.sql in your Supabase project.",
      );
    }
    throw new Error(error.message || "Unable to look up share token.");
  }

  return (data as AccuracyShareRow | null) ?? null;
}
