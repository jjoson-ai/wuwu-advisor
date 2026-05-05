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
  }
}

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