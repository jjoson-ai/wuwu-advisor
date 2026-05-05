import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type UsageFeature = "ask" | "today-refresh";

export function getDailyPeriodKey(timezone: string | null | undefined): string {
  const tz = timezone && timezone.trim() !== "" ? timezone : "UTC";

  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
}

export async function getUsageCount(
  userId: string,
  periodKey: string,
  feature: UsageFeature,
): Promise<number> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("usage_counters")
      .select("count")
      .eq("user_id", userId)
      .eq("period_key", periodKey)
      .eq("feature", feature)
      .maybeSingle();

    if (error !== null) {
      console.error(
        "[usage-limits] Failed to read usage count.",
        error.message,
      );
      return 0;
    }

    return data?.count ?? 0;
  } catch (error) {
    console.error("[usage-limits] Failed to read usage count.", error);
    return 0;
  }
}

export async function incrementUsageCount(
  userId: string,
  periodKey: string,
  feature: UsageFeature,
): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    const current = await getUsageCount(userId, periodKey, feature);
    const { error } = await supabase
      .from("usage_counters")
      .upsert(
        {
          user_id: userId,
          period_key: periodKey,
          feature,
          count: current + 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,period_key,feature" },
      );

    if (error !== null) {
      console.error(
        "[usage-limits] Failed to increment usage count.",
        error.message,
      );
    }
  } catch (error) {
    console.error("[usage-limits] Failed to increment usage count.", error);
  }
}