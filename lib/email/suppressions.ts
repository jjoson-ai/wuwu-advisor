import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type SuppressionReason = "bounce" | "complaint" | "manual" | "rate_limited";

async function hashEmail(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extractDomain(email: string): string {
  const parts = email.trim().toLowerCase().split("@");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/**
 * Add an email to the suppression list. THROWS on DB failure so that the
 * Resend webhook handler can return a non-200 status — Resend retries
 * non-2xx, so a failed suppression write can be replayed instead of
 * silently dropping the bounce/complaint and continuing to send to the
 * problem address forever.
 */
export async function suppressEmail(
  email: string,
  reason: SuppressionReason,
): Promise<void> {
  const hashed = await hashEmail(email);
  const admin = getSupabaseAdminClient();

  const { error } = await admin
    .from("email_suppressions")
    .upsert({ email_hash: hashed, reason }, { onConflict: "email_hash" });

  if (error != null) {
    console.error("[Email] Failed to suppress address.", {
      reason,
      error: error.message,
    });
    throw new Error(
      `Failed to suppress address (reason=${reason}): ${error.message}`,
    );
  }
}

/**
 * Remove an email from the suppression list. THROWS on DB failure for the
 * same reason as `suppressEmail` — callers (e.g. an admin reinstate flow)
 * should know if the write didn't land.
 */
export async function unsuppressEmail(email: string): Promise<void> {
  const hashed = await hashEmail(email);
  const admin = getSupabaseAdminClient();

  const { error } = await admin
    .from("email_suppressions")
    .delete()
    .eq("email_hash", hashed);

  if (error != null) {
    console.error("[Email] Failed to unsuppress address.", {
      error: error.message,
    });
    throw new Error(`Failed to unsuppress address: ${error.message}`);
  }
}

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const hashed = await hashEmail(email);
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from("email_suppressions")
    .select("email_hash")
    .eq("email_hash", hashed)
    .maybeSingle();

  if (error != null) {
    console.error("[Email] Failed to check suppression.", {
      error: error.message,
    });
    return false;
  }

  return data != null;
}

export { hashEmail, extractDomain };