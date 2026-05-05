import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type UsageFeature = "ask" | "today-refresh" | "big-decision";

export type TryIncrementResult = {
  newCount: number;
  wasIncremented: boolean;
};

/**
 * Format a YYYY-MM-DD daily period key in the user's local timezone.
 * Falls back to UTC if the timezone is null/invalid.
 */
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

/**
 * Format a YYYY-WNN ISO-week period key in the user's local timezone.
 * Falls back to UTC if the timezone is null/invalid.
 */
export function getWeeklyPeriodKey(timezone: string | null | undefined): string {
  const tz = timezone && timezone.trim() !== "" ? timezone : "UTC";

  let localDateString: string;
  try {
    localDateString = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    localDateString = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  const date = new Date(localDateString);
  // Thursday of the same ISO week — its year IS the ISO week-year by definition
  const thursday = new Date(date);
  thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3);
  const isoYear = thursday.getFullYear();
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(isoYear, 0, 4);
  const jan4Thursday = new Date(jan4);
  jan4Thursday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + 3);
  const weekNumber =
    Math.round((thursday.getTime() - jan4Thursday.getTime()) / (7 * 86400000)) + 1;
  return `${isoYear}-W${String(weekNumber).padStart(2, "0")}`;
}

/**
 * Atomically increments the usage counter when the user is below the cap.
 *
 * Single round-trip Postgres function (try_increment_usage_counter from
 * sql/012_usage_counter_atomic_fn.sql) that combines the gate and the
 * write. Concurrent callers serialize on the row lock, so a free-tier user
 * cannot bypass the cap by spamming requests in parallel.
 *
 * Trade-off: when the call returns wasIncremented=true, the slot has been
 * spent regardless of whether the downstream LLM call succeeds. Failed
 * generations burn quota. This is acceptable for DoS protection — a
 * Codex-style atomic counter is the only way to close the read-then-write
 * race that previously existed.
 *
 * Failure mode: on any DB error, returns wasIncremented=true with newCount=0.
 * This is intentionally fail-OPEN — we'd rather let one extra generation
 * through on a transient DB hiccup than block legitimate users behind a
 * counter we can't read. The hiccup is logged for ops visibility.
 */
export async function tryIncrementUsageCount(
  userId: string,
  periodKey: string,
  feature: UsageFeature,
  limit: number,
): Promise<TryIncrementResult> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .rpc("try_increment_usage_counter", {
        p_user_id: userId,
        p_period_key: periodKey,
        p_feature: feature,
        p_limit: limit,
      })
      .single<{ new_count: number; was_incremented: boolean }>();

    if (error !== null || data === null) {
      console.error(
        "[usage-limits] try_increment_usage_counter RPC failed; failing open.",
        error?.message ?? "no data returned",
      );
      return { newCount: 0, wasIncremented: true };
    }

    return {
      newCount: data.new_count,
      wasIncremented: data.was_incremented,
    };
  } catch (error) {
    console.error(
      "[usage-limits] try_increment_usage_counter threw; failing open.",
      error,
    );
    return { newCount: 0, wasIncremented: true };
  }
}

/**
 * Read-only count for a given (user, period, feature). Returns 0 when no row
 * exists or on DB error. Use for displaying "remaining quota" in the UI; do
 * NOT use as a gate (use tryIncrementUsageCount, which is atomic).
 */
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
