import "server-only";

import type { User } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * 24-hour crisis window — the SOS button stays visible for 24 hours after
 * any crisis trigger so the user has one-tap access to resources during the
 * vulnerable post-trigger period.
 *
 * Storage: `app_metadata.crisis_triggered_at` (ISO timestamp string).
 *
 * `app_metadata` is admin-only — the client cannot forge or clear it. We
 * use the same mechanism as the age gate flag for consistency.
 *
 * Roadmap reference: 1.7.
 */

const CRISIS_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isInCrisisWindow(user: User | null): boolean {
  if (user === null) return false;

  const triggeredAt = user.app_metadata?.crisis_triggered_at;

  if (typeof triggeredAt !== "string" || triggeredAt === "") {
    return false;
  }

  const triggeredTimestamp = Date.parse(triggeredAt);

  if (Number.isNaN(triggeredTimestamp)) {
    return false;
  }

  return Date.now() - triggeredTimestamp <= CRISIS_WINDOW_MS;
}

export async function markCrisisTriggered(userId: string): Promise<void> {
  try {
    const admin = getSupabaseAdminClient();
    const { data: existing } = await admin.auth.admin.getUserById(userId);
    const previousMetadata = existing?.user?.app_metadata ?? {};

    await admin.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...previousMetadata,
        crisis_triggered_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Must never block the Care Mode response. SOS button is a nice-to-have;
    // the Care Mode copy itself carries the resources.
    console.error("[crisis_window_mark_failed]", error);
  }
}
