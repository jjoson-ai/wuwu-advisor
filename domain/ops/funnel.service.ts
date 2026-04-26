import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ThinEventRow = {
  occurred_at: string;
  user_id: string | null;
  event_name: string;
  tier: string | null;
  upgrade_surface: string | null;
};

export type FunnelStep = {
  label: string;
  event_name: string;
  users: number;
  /** % of the previous step that reached this step. "—" when prev = 0. */
  pct_of_prev: string;
  /** % of the top-of-funnel (signup_completed) that reached this step. */
  pct_of_top: string;
};

export type RetentionCohortRow = {
  /** ISO week label, e.g. "W17 2026" */
  week_label: string;
  signups: number;
  d1_count: number;
  d7_count: number;
  d30_count: number;
  d1_pct: string;
  d7_pct: string;
  /** Marked "…" when the cohort is younger than 30 days. */
  d30_pct: string;
  d30_incomplete: boolean;
};

export type TimeToUpgradeRow = {
  bucket: string;
  count: number;
  pct: string;
};

export type UpgradeSurfaceRow = {
  surface: string;
  paywall_shown: number;
  upgrade_clicked: number;
  pro_activated: number;
  /** upgrade_clicked / paywall_shown */
  ctr: string;
  /** pro_activated / paywall_shown */
  cvr: string;
};

export type FunnelPageData = {
  asOf: string;
  setupNotes: string[];
  funnel: FunnelStep[];
  retention: RetentionCohortRow[];
  timeToUpgrade: {
    rows: TimeToUpgradeRow[];
    medianDays: string;
    p75Days: string;
  };
  upgradeSurfaces: UpgradeSurfaceRow[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FUNNEL_STEPS_CONFIG = [
  { label: "Signed up", event_name: "signup_completed" },
  { label: "Completed onboarding", event_name: "onboarding_completed" },
  { label: "First Today generated", event_name: "first_today_generated" },
  { label: "Paywall shown", event_name: "paywall_shown" },
  { label: "Upgrade clicked", event_name: "upgrade_clicked" },
  { label: "Pro activated", event_name: "pro_activated" },
] as const;

const FUNNEL_EVENT_NAMES = FUNNEL_STEPS_CONFIG.map((s) => s.event_name);

// Events that count as "returning active" for retention calculation.
const ACTIVITY_EVENT_NAMES = [
  "today_generated",
  "forecast_generated",
  "blueprint_generated",
  "ask_submitted",
  "first_today_generated",
  "first_forecast_generated",
  "first_blueprint_generated",
  "first_ask_submitted",
] as const;

const UPGRADE_SURFACE_EVENT_NAMES = [
  "paywall_shown",
  "upgrade_clicked",
  "pro_activated",
] as const;

// Retention look-back window: fetch the most recent N days of signup + activity
// data. Older cohorts are less decision-relevant pre-PMF and keeping this finite
// makes the fan-out tractable as the table grows.
const RETENTION_LOOKBACK_DAYS = 90;

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function daysBetween(earlier: Date, later: Date): number {
  return (later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Return an ISO-week label "W{week} {year}" for a date, using Monday as the
 * start of the week (ISO 8601). This is consistent across timezones for
 * server-side cohort assignment because we normalise to UTC.
 */
function isoWeekLabel(date: Date): string {
  // Thursday of the current ISO week (per ISO 8601: week belongs to the year
  // that contains its Thursday).
  const thursday = new Date(date);
  const dayOfWeek = (thursday.getUTCDay() + 6) % 7; // 0=Mon … 6=Sun
  thursday.setUTCDate(thursday.getUTCDate() - dayOfWeek + 3);

  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo =
    Math.ceil(
      ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );

  return `W${String(weekNo).padStart(2, "0")} ${thursday.getUTCFullYear()}`;
}

/** Monday of the ISO week containing `date`. */
function startOfIsoWeek(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayOfWeek);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function formatDays(days: number): string {
  if (days < 1) return `${(days * 24).toFixed(1)}h`;
  return `${days.toFixed(1)}d`;
}

function formatDbError(error: PostgrestError | null, fallback: string): string {
  if (error === null) return fallback;
  if (error.code === "PGRST205" || error.message.includes("schema cache")) {
    return `Supabase setup error: run sql/002_operator_telemetry.sql to create product_events.`;
  }
  return error.message || fallback;
}

async function fetchAllEventRows(
  eventNames: readonly string[],
  cutoff?: string,
): Promise<ThinEventRow[]> {
  const supabase = getSupabaseAdminClient();
  const rows: ThinEventRow[] = [];
  const pageSize = 1000;

  for (let page = 0; page < 50; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("product_events")
      .select("occurred_at, user_id, event_name, tier, upgrade_surface")
      .in("event_name", [...eventNames])
      .order("occurred_at", { ascending: true })
      .range(from, to);

    if (cutoff != null) {
      query = query.gte("occurred_at", cutoff);
    }

    const { data, error } = await query;

    if (error != null) {
      throw new Error(formatDbError(error, "Unable to load product_events rows."));
    }

    const batch = (data as ThinEventRow[]) ?? [];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section builders
// ─────────────────────────────────────────────────────────────────────────────

function buildFunnel(rows: ThinEventRow[]): FunnelStep[] {
  // One row per unique user per funnel step — count unique users who ever fired
  // each event. No time-window filter: funnel shows all-time progress because
  // a user who signed up in week 1 and upgraded in week 4 should appear in the
  // upgrade bucket regardless of the selected window.
  const userSets = new Map<string, Set<string>>();

  for (const step of FUNNEL_STEPS_CONFIG) {
    userSets.set(step.event_name, new Set());
  }

  for (const row of rows) {
    if (row.user_id == null) continue;
    const set = userSets.get(row.event_name);
    if (set != null) set.add(row.user_id);
  }

  const topCount =
    userSets.get("signup_completed")?.size ?? 0;

  return FUNNEL_STEPS_CONFIG.map((step, i) => {
    const users = userSets.get(step.event_name)?.size ?? 0;
    const prev =
      i === 0
        ? users
        : (userSets.get(FUNNEL_STEPS_CONFIG[i - 1].event_name)?.size ?? 0);

    return {
      label: step.label,
      event_name: step.event_name,
      users,
      pct_of_prev: i === 0 ? "—" : pct(users, prev),
      pct_of_top: i === 0 ? "100%" : pct(users, topCount),
    };
  });
}

function buildRetention(
  signupRows: ThinEventRow[],
  activityRows: ThinEventRow[],
  now: Date,
): RetentionCohortRow[] {
  // Build user → earliest signup date map.
  const signupByUser = new Map<string, Date>();
  for (const row of signupRows) {
    if (row.user_id == null) continue;
    const ts = new Date(row.occurred_at);
    const existing = signupByUser.get(row.user_id);
    if (existing == null || ts < existing) {
      signupByUser.set(row.user_id, ts);
    }
  }

  // Build user → sorted activity timestamps map.
  const activityByUser = new Map<string, Date[]>();
  for (const row of activityRows) {
    if (row.user_id == null) continue;
    const ts = new Date(row.occurred_at);
    const list = activityByUser.get(row.user_id);
    if (list == null) {
      activityByUser.set(row.user_id, [ts]);
    } else {
      list.push(ts);
    }
  }

  // Group users by ISO cohort week.
  type CohortAccum = {
    weekStart: Date;
    label: string;
    userIds: string[];
  };
  const cohortMap = new Map<string, CohortAccum>();

  for (const [userId, signupDate] of signupByUser) {
    const label = isoWeekLabel(signupDate);
    const existing = cohortMap.get(label);
    if (existing == null) {
      cohortMap.set(label, {
        weekStart: startOfIsoWeek(signupDate),
        label,
        userIds: [userId],
      });
    } else {
      existing.userIds.push(userId);
    }
  }

  // Sort cohorts by weekStart ascending.
  const sortedCohorts = Array.from(cohortMap.values()).sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime(),
  );

  return sortedCohorts.map((cohort) => {
    const signups = cohort.userIds.length;
    let d1 = 0;
    let d7 = 0;
    let d30 = 0;

    for (const userId of cohort.userIds) {
      const signupDate = signupByUser.get(userId)!;
      const activities = activityByUser.get(userId) ?? [];

      let hasD1 = false;
      let hasD7 = false;
      let hasD30 = false;

      for (const actTs of activities) {
        if (actTs <= signupDate) continue; // same event or before — skip
        const days = daysBetween(signupDate, actTs);
        if (days <= 1) hasD1 = true;
        if (days <= 7) hasD7 = true;
        if (days <= 30) hasD30 = true;
        if (hasD1 && hasD7 && hasD30) break;
      }

      if (hasD1) d1++;
      if (hasD7) d7++;
      if (hasD30) d30++;
    }

    // A cohort is "D30 incomplete" if fewer than 30 days have elapsed since
    // the start of its signup week — numbers will grow as users return.
    const cohortAgeInDays = daysBetween(cohort.weekStart, now);
    const d30Incomplete = cohortAgeInDays < 30;

    return {
      week_label: cohort.label,
      signups,
      d1_count: d1,
      d7_count: d7,
      d30_count: d30,
      d1_pct: pct(d1, signups),
      d7_pct: pct(d7, signups),
      d30_pct: d30Incomplete ? "…" : pct(d30, signups),
      d30_incomplete: d30Incomplete,
    };
  });
}

function buildTimeToUpgrade(
  signupRows: ThinEventRow[],
  activatedRows: ThinEventRow[],
): FunnelPageData["timeToUpgrade"] {
  const signupByUser = new Map<string, Date>();
  for (const row of signupRows) {
    if (row.user_id == null) continue;
    const ts = new Date(row.occurred_at);
    const existing = signupByUser.get(row.user_id);
    if (existing == null || ts < existing) signupByUser.set(row.user_id, ts);
  }

  const activationByUser = new Map<string, Date>();
  for (const row of activatedRows) {
    if (row.user_id == null) continue;
    const ts = new Date(row.occurred_at);
    const existing = activationByUser.get(row.user_id);
    if (existing == null || ts < existing)
      activationByUser.set(row.user_id, ts);
  }

  const deltas: number[] = [];
  for (const [userId, activatedAt] of activationByUser) {
    const signedUpAt = signupByUser.get(userId);
    if (signedUpAt == null) continue;
    const days = daysBetween(signedUpAt, activatedAt);
    if (days >= 0) deltas.push(days);
  }

  if (deltas.length === 0) {
    return {
      rows: [],
      medianDays: "—",
      p75Days: "—",
    };
  }

  const sorted = [...deltas].sort((a, b) => a - b);

  const BUCKETS: Array<{ label: string; maxDays: number }> = [
    { label: "< 1 hour", maxDays: 1 / 24 },
    { label: "1 – 24 hours", maxDays: 1 },
    { label: "1 – 3 days", maxDays: 3 },
    { label: "3 – 7 days", maxDays: 7 },
    { label: "7 – 10 days (trial)", maxDays: 10 },
    { label: "10 – 30 days", maxDays: 30 },
    { label: "30+ days", maxDays: Infinity },
  ];

  let prev = 0;
  const rows: TimeToUpgradeRow[] = BUCKETS.map(({ label, maxDays }) => {
    const count = sorted.filter((d) => d > prev && d <= maxDays).length;
    prev = maxDays;
    return {
      bucket: label,
      count,
      pct: pct(count, sorted.length),
    };
  });

  return {
    rows,
    medianDays: formatDays(percentile(sorted, 50)),
    p75Days: formatDays(percentile(sorted, 75)),
  };
}

function buildUpgradeSurfaces(rows: ThinEventRow[]): UpgradeSurfaceRow[] {
  type Accum = {
    paywall_shown: number;
    upgrade_clicked: number;
    pro_activated: number;
  };
  const map = new Map<string, Accum>();

  const blank = (): Accum => ({
    paywall_shown: 0,
    upgrade_clicked: 0,
    pro_activated: 0,
  });

  for (const row of rows) {
    if (
      row.event_name !== "paywall_shown" &&
      row.event_name !== "upgrade_clicked" &&
      row.event_name !== "pro_activated"
    ) {
      continue;
    }

    // Normalise surface: use upgrade_surface if present, else "unknown".
    const surface =
      row.upgrade_surface?.trim() !== ""
        ? (row.upgrade_surface?.trim() ?? "unknown")
        : "unknown";

    const current = map.get(surface) ?? blank();

    if (row.event_name === "paywall_shown") current.paywall_shown += 1;
    if (row.event_name === "upgrade_clicked") current.upgrade_clicked += 1;
    if (row.event_name === "pro_activated") current.pro_activated += 1;

    map.set(surface, current);
  }

  return Array.from(map.entries())
    .map(([surface, counts]) => ({
      surface,
      paywall_shown: counts.paywall_shown,
      upgrade_clicked: counts.upgrade_clicked,
      pro_activated: counts.pro_activated,
      ctr: pct(counts.upgrade_clicked, counts.paywall_shown),
      cvr: pct(counts.pro_activated, counts.paywall_shown),
    }))
    .sort((a, b) => b.paywall_shown - a.paywall_shown);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function getFunnelPageData(): Promise<FunnelPageData> {
  const now = new Date();
  const setupNotes: string[] = [];

  const retentionCutoff = new Date(now);
  retentionCutoff.setUTCDate(
    retentionCutoff.getUTCDate() - RETENTION_LOOKBACK_DAYS,
  );

  // Fetch in parallel: funnel events (all-time) + activity events (lookback
  // window) + upgrade surface events (all-time). Funnel and surface need
  // all-time to correctly count unique users who eventually reached each step.
  let funnelRows: ThinEventRow[] = [];
  let activityRows: ThinEventRow[] = [];
  let surfaceRows: ThinEventRow[] = [];

  try {
    [funnelRows, activityRows, surfaceRows] = await Promise.all([
      fetchAllEventRows(FUNNEL_EVENT_NAMES),
      fetchAllEventRows(ACTIVITY_EVENT_NAMES, retentionCutoff.toISOString()),
      fetchAllEventRows(UPGRADE_SURFACE_EVENT_NAMES),
    ]);
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Unable to load funnel data.";
    setupNotes.push(msg);
  }

  const signupRows = funnelRows.filter(
    (r) => r.event_name === "signup_completed",
  );
  const activatedRows = funnelRows.filter(
    (r) => r.event_name === "pro_activated",
  );

  const funnel = buildFunnel(funnelRows);
  const retention = buildRetention(signupRows, activityRows, now);
  const timeToUpgrade = buildTimeToUpgrade(signupRows, activatedRows);
  const upgradeSurfaces = buildUpgradeSurfaces(surfaceRows);

  if (funnelRows.length === 0 && setupNotes.length === 0) {
    setupNotes.push(
      "No product_events rows found. Funnel data will populate as users sign up and interact.",
    );
  }

  return {
    asOf: now.toISOString(),
    setupNotes,
    funnel,
    retention,
    timeToUpgrade,
    upgradeSurfaces,
  };
}
