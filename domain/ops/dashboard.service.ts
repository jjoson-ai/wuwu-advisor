import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { getUserAccessLevel, type AccessLevel } from "@/lib/access";
import { fetchAdSpend, seedMockAdSpendIfNeeded, type AdSpendRow } from "@/lib/ad-spend.server";
import { getStripeServerClient } from "@/lib/stripe";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type DashboardTimeWindow = "today" | "7d" | "30d" | "mtd";
export type DashboardTierFilter = "all" | AccessLevel;
export type DashboardSurfaceFilter = "all" | "today" | "forecast" | "blueprint" | "ask";
export type DashboardPlatformFilter = "all" | "web" | "mobile";
export type DashboardModelPathFilter =
  | "all"
  | "single_pass"
  | "cheap_final"
  | "frontier_final"
  | "full_fallback";

export type DashboardFilters = {
  timeWindow: DashboardTimeWindow;
  tier: DashboardTierFilter;
  surface: DashboardSurfaceFilter;
  platform: DashboardPlatformFilter;
  modelPath: DashboardModelPathFilter;
};

type MetricStatus = "live" | "proxy" | "placeholder";

type MetricCard = {
  label: string;
  value: string;
  detail: string;
  status: MetricStatus;
  /** Change vs the prior equivalent window, e.g. "+14% vs prior 7d" */
  delta?: string | null;
  deltaDirection?: "up" | "down" | "neutral";
};

type ProductEventRow = {
  occurred_at: string;
  user_id: string | null;
  event_name: string;
  tier: AccessLevel | null;
  platform: "web" | "mobile" | null;
  feature: "today" | "forecast" | "blueprint" | "ask" | null;
  plan_type: "free" | "pro" | null;
  upgrade_surface: string | null;
  request_id: string | null;
  final_model_selected: string | null;
  generation_path:
    | "single_pass"
    | "cheap_final"
    | "frontier_final"
    | "full_fallback"
    | null;
  fallback_triggered: boolean | null;
  request_cost_estimate_usd: number | null;
  request_cost_is_estimated: boolean | null;
  is_first_use: boolean | null;
  repeat_within_24h: boolean | null;
  attribution_channel: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

type RoutingEventRow = {
  occurred_at: string;
  request_id: string;
  feature: "today" | "forecast" | "ask";
  tier: AccessLevel;
  platform: "web" | "mobile";
  final_model_selected: string;
  path_taken: "cheap_final" | "frontier_final" | "full_fallback";
  fallback_triggered: boolean;
};

type BriefingFeedbackRow = {
  briefing_id: string;
  // New emoji rating shape (5.2 Phase A). Null on legacy rows.
  rating_emoji: "nailed_it" | "vague" | "off" | null;
  rating_theme_hit: string[] | null;
  rating_theme_miss: string[] | null;
  // Legacy 1-5 score / acted_on. Null on new rows.
  usefulness_score: number | null;
  acted_on: "yes" | "partial" | "no" | null;
  note: string | null;
  created_at: string;
};

type BriefingRow = {
  id: string;
  generation_access_level: AccessLevel | null;
};

type DecisionFeedbackRow = {
  decision_guidance_id: string;
  usefulness_score: number;
  acted_on: "yes" | "partial" | "no";
  note: string | null;
  created_at: string;
};

type DecisionRow = {
  id: string;
  generation_access_level: AccessLevel | null;
};

type SurfaceConversionRow = {
  surface: string;
  platform: string;
  paywallShown: number;
  upgradeClicked: number;
  checkoutStarted: number;
  checkoutCompleted: number;
  clickToPaidRate: string;
  paywallToPaidRate: string;
};

type UsageRow = {
  surface: string;
  generated: number;
  firstUse: number;
  repeatWithin24h: number;
};

/** Per-channel attribution rollup used by the Acquisition → By channel card. */
type ChannelRow = {
  channel: string;
  signups: number;
  paidActivations: number;
  paywallShown: number;
  checkoutStarted: number;
  checkoutCompleted: number;
  paywallToPaidRate: string;
};

type RoutingMixRow = {
  modelFamily: string;
  requests: number;
  share: string;
  fallbackRate: string;
};

type RetentionCohortRow = {
  week_label: string;
  signups: number;
  active_d7: number;
  d7_pct: string;
};

type LtvRow = {
  cohort_label: string;
  users: number;
  avg_tenure_weeks: number;
  est_ltv_per_user: string;
};

type AdSpendChannelRow = {
  channel: string;
  spend: string;
  impressions: number;
  clicks: number;
  cpc: string;
  cpm: string;
  source: string;
};

export type OperatorDashboardData = {
  filters: DashboardFilters;
  windowLabel: string;
  setupNotes: string[];
  telemetryStatus: {
    productEventsReady: boolean;
    routingEventsReady: boolean;
  };
  /** Top-level P&L snapshot — MRR, cost, margin, net new. */
  profitability: {
    metrics: MetricCard[];
  };
  revenue: {
    metrics: MetricCard[];
    conversionRows: SurfaceConversionRow[];
    /** Signups / paywall / activations broken out by first-touch channel. */
    channelRows: ChannelRow[];
  };
  retention: {
    metrics: MetricCard[];
    cohortRows: RetentionCohortRow[];
  };
  ltv: {
    metrics: MetricCard[];
    rows: LtvRow[];
  };
  usage: {
    metrics: MetricCard[];
    usageRows: UsageRow[];
    /** Leading-indicator moat metrics: decision log, accuracy report, briefing ratings. */
    moatMetrics: MetricCard[];
  };
  cost: {
    metrics: MetricCard[];
    routingRows: RoutingMixRow[];
  };
  quality: {
    metrics: MetricCard[];
  };
  adSpend: {
    metrics: MetricCard[];
    channelRows: AdSpendChannelRow[];
  };
};

function formatDbError(error: PostgrestError | null, fallback: string) {
  if (error === null) {
    return fallback;
  }

  const relationName =
    error.message.match(/'public\.([^']+)'/)?.[1] ??
    error.message.match(/relation "public\.([^"]+)"/)?.[1] ??
    null;

  if (error.code === "PGRST205" || error.message.includes("schema cache")) {
    const relationLabel = relationName ?? "the required tables";
    return `Supabase setup error: public.${relationLabel} is missing. Run sql/002_operator_telemetry.sql in Supabase.`;
  }

  return error.message || fallback;
}

function buildTimeWindowStart(timeWindow: DashboardTimeWindow, now: Date) {
  const start = new Date(now);

  if (timeWindow === "today") {
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }

  if (timeWindow === "mtd") {
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }

  const days = timeWindow === "7d" ? 7 : 30;
  start.setUTCDate(start.getUTCDate() - days);
  return start;
}

function buildWindowLabel(filters: DashboardFilters) {
  switch (filters.timeWindow) {
    case "today":
      return "Today";
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    case "mtd":
      return "Month to date";
  }
}

function deriveSurface(
  event: Pick<ProductEventRow, "feature" | "upgrade_surface">,
): DashboardSurfaceFilter {
  if (event.feature != null) {
    return event.feature;
  }

  const source = event.upgrade_surface?.trim().toLowerCase() ?? "";

  if (source.includes("ask")) {
    return "ask";
  }

  if (source.includes("forecast")) {
    return "forecast";
  }

  if (source.includes("blueprint")) {
    return "blueprint";
  }

  if (source.includes("today")) {
    return "today";
  }

  return "all";
}

function matchesTier(
  value: AccessLevel | null | undefined,
  filter: DashboardTierFilter,
) {
  if (filter === "all") {
    return true;
  }

  return value === filter;
}

function matchesPlatform(
  value: "web" | "mobile" | null | undefined,
  filter: DashboardPlatformFilter,
) {
  if (filter === "all") {
    return true;
  }

  return value === filter;
}

function matchesSurface(
  value: DashboardSurfaceFilter,
  filter: DashboardSurfaceFilter,
) {
  if (filter === "all") {
    return true;
  }

  return value === filter;
}

function matchesModelPath(
  value: DashboardModelPathFilter | null | undefined,
  filter: DashboardModelPathFilter,
) {
  if (filter === "all") {
    return true;
  }

  return value === filter;
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return "—";
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countUniqueNonNull(values: Array<string | null | undefined>) {
  return new Set(values.filter((value): value is string => Boolean(value))).size;
}

function formatDecimal(value: number | null, digits = 1) {
  if (value === null || Number.isFinite(value) === false) {
    return "—";
  }

  return value.toFixed(digits);
}

function formatUsd(value: number | null) {
  if (value === null) {
    return "—";
  }

  return `$${value.toFixed(2)}`;
}

/**
 * Prior window immediately preceding the current window (same duration).
 * Used for period-over-period delta computation.
 */
function buildPriorWindowRange(
  timeWindow: DashboardTimeWindow,
  now: Date,
): { start: Date; end: Date } {
  const currentStart = buildTimeWindowStart(timeWindow, now);

  if (timeWindow === "today") {
    const end = new Date(currentStart); // today 00:00
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 1); // yesterday 00:00
    return { start, end };
  }

  if (timeWindow === "mtd") {
    const end = new Date(currentStart); // first of this month
    const start = new Date(end);
    start.setUTCMonth(start.getUTCMonth() - 1); // first of last month
    return { start, end };
  }

  const days = timeWindow === "7d" ? 7 : 30;
  const end = new Date(currentStart); // e.g. now-7d
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return { start, end };
}

/**
 * Returns a formatted delta string and direction for a numeric comparison.
 * Returns null when there is no meaningful prior (both zero or no prior data).
 */
function formatDelta(
  current: number,
  prior: number,
): { text: string; direction: "up" | "down" | "neutral" } | null {
  if (prior === 0 && current === 0) return null;
  if (prior === 0) return { text: `+${current} new`, direction: "up" };
  const pct = ((current - prior) / prior) * 100;
  if (Math.abs(pct) < 1) return { text: "≈ flat vs prior", direction: "neutral" };
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${Math.round(pct)}% vs prior`,
    direction: pct > 0 ? "up" : "down",
  };
}

/**
 * Scales a period LLM cost to an approximate monthly figure for margin estimation.
 */
function estimateMonthlyLlmCost(
  totalCost: number,
  timeWindow: DashboardTimeWindow,
  now: Date,
): number {
  const daysInWindow =
    timeWindow === "today" ? 1
    : timeWindow === "7d" ? 7
    : timeWindow === "30d" ? 30
    : now.getUTCDate(); // mtd: days elapsed this month
  return daysInWindow > 0 ? (totalCost / daysInWindow) * 30 : 0;
}

type StripeRevenueData = {
  mrr: number | null;
  monthlyCount: number;
  annualCount: number;
  totalCount: number;
};

async function safeFetchStripeRevenue(
  setupNotes: string[],
): Promise<StripeRevenueData> {
  try {
    const stripe = getStripeServerClient();
    let mrr = 0;
    let monthlyCount = 0;
    let annualCount = 0;

    const subscriptions = await stripe.subscriptions.list({
      status: "active",
      limit: 100,
      expand: ["data.items.data.price"],
    });

    for (const sub of subscriptions.data) {
      for (const item of sub.items.data) {
        const price = item.price;
        const gross = ((price.unit_amount ?? 0) * (item.quantity ?? 1)) / 100;

        if (price.recurring?.interval === "month") {
          mrr += gross;
          monthlyCount++;
        } else if (price.recurring?.interval === "year") {
          mrr += gross / 12;
          annualCount++;
        }
      }
    }

    return { mrr, monthlyCount, annualCount, totalCount: monthlyCount + annualCount };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stripe revenue fetch failed.";
    setupNotes.push(`Stripe MRR unavailable: ${message}`);
    return { mrr: null, monthlyCount: 0, annualCount: 0, totalCount: 0 };
  }
}

function getModelFamily(model: string) {
  const normalized = model.toLowerCase();

  if (normalized.includes("opus")) {
    return "Opus";
  }

  if (normalized.includes("sonnet")) {
    return "Sonnet";
  }

  if (normalized.includes("gpt")) {
    return "GPT";
  }

  return "Other";
}

function toAccessUser(user: {
  email?: string | null;
  app_metadata: Record<string, unknown> | null;
  user_metadata: Record<string, unknown> | null;
}) {
  return {
    email: user.email ?? undefined,
    app_metadata: user.app_metadata ?? undefined,
    user_metadata: user.user_metadata ?? undefined,
  };
}

async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => Promise<{
    data: T[] | null;
    error: PostgrestError | null;
  }>,
) {
  const rows: T[] = [];
  const pageSize = 1000;

  for (let page = 0; page < 20; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const result = await fetchPage(from, to);

    if (result.error !== null) {
      throw new Error(formatDbError(result.error, "Unable to load telemetry rows."));
    }

    const batch = result.data ?? [];
    rows.push(...batch);

    if (batch.length < pageSize) {
      break;
    }
  }

  return rows;
}

async function safeFetchTelemetryRows<T>(
  fetcher: () => Promise<T[]>,
  setupNotes: string[],
) {
  try {
    return {
      rows: await fetcher(),
      ready: true,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load telemetry rows.";
    setupNotes.push(message);
    return {
      rows: [] as T[],
      ready: false,
    };
  }
}

async function listAllAuthUsers() {
  const supabase = getSupabaseAdminClient();
  const users: Array<{
    id: string;
    email?: string | null;
    app_metadata: Record<string, unknown> | null;
    user_metadata: Record<string, unknown> | null;
    last_sign_in_at?: string | null;
  }> = [];

  for (let page = 1; page <= 20; page += 1) {
    const result = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (result.error !== null) {
      throw new Error(result.error.message || "Unable to list auth users.");
    }

    const batch = result.data.users ?? [];
    users.push(...batch);

    if (batch.length < 1000) {
      break;
    }
  }

  return users;
}

export async function getOperatorDashboardData(
  filters: DashboardFilters,
): Promise<OperatorDashboardData> {
  const supabase = getSupabaseAdminClient();
  const now = new Date();
  const windowStart = buildTimeWindowStart(filters.timeWindow, now).toISOString();
  const priorRange = buildPriorWindowRange(filters.timeWindow, now);
  const setupNotes: string[] = [];

  // Seed mock ad-spend data if the table is empty (no real API creds yet).
  // This is fire-and-forget — dashboard does not block on seeding.
  void seedMockAdSpendIfNeeded(30).catch(() => {});

  const [stripeRevenue] = await Promise.all([safeFetchStripeRevenue(setupNotes)]);

  const productEventsResult = await safeFetchTelemetryRows<ProductEventRow>(
    () =>
      fetchAllRows(async (from, to) =>
        await supabase
          .from("product_events")
          .select(
            "occurred_at, user_id, event_name, tier, platform, feature, plan_type, upgrade_surface, request_id, final_model_selected, generation_path, fallback_triggered, request_cost_estimate_usd, request_cost_is_estimated, is_first_use, repeat_within_24h, attribution_channel, utm_source, utm_medium, utm_campaign",
          )
          .gte("occurred_at", windowStart)
          .lte("occurred_at", now.toISOString())
          .order("occurred_at", { ascending: false })
          .range(from, to),
      ),
    setupNotes,
  );

  const routingEventsResult = await safeFetchTelemetryRows<RoutingEventRow>(
    () =>
      fetchAllRows(async (from, to) =>
        await supabase
          .from("routing_events")
          .select(
            "occurred_at, request_id, feature, tier, platform, final_model_selected, path_taken, fallback_triggered",
          )
          .gte("occurred_at", windowStart)
          .lte("occurred_at", now.toISOString())
          .order("occurred_at", { ascending: false })
          .range(from, to),
      ),
    setupNotes,
  );

  // Prior-period product events — only the fields needed for delta computation
  const priorProductEventsResult = await safeFetchTelemetryRows<
    Pick<ProductEventRow, "event_name" | "request_cost_estimate_usd" | "user_id" | "tier">
  >(
    () =>
      fetchAllRows(async (from, to) =>
        await supabase
          .from("product_events")
          .select("event_name, request_cost_estimate_usd, user_id, tier")
          .gte("occurred_at", priorRange.start.toISOString())
          .lte("occurred_at", priorRange.end.toISOString())
          .range(from, to),
      ),
    setupNotes,
  );

  // ── Ad-spend data ──────────────────────────────────────────────────────────
  // Fetches daily ad_spend rows for the selected window and prior window (for
  // deltas). Falls back gracefully if the table does not exist yet.
  const adSpendWindowStart = buildTimeWindowStart(filters.timeWindow, now)
    .toISOString()
    .slice(0, 10);
  const adSpendWindowEnd = now.toISOString().slice(0, 10);
  const adSpendRows: AdSpendRow[] = await fetchAdSpend(adSpendWindowStart, adSpendWindowEnd).catch(
    () => {
      setupNotes.push("Ad-spend table not yet created. Run sql/014_ad_spend.sql in Supabase.");
      return [] as AdSpendRow[];
    },
  );
  const priorAdSpendRows: AdSpendRow[] = await fetchAdSpend(
    priorRange.start.toISOString().slice(0, 10),
    priorRange.end.toISOString().slice(0, 10),
  ).catch(() => [] as AdSpendRow[]);

  const briefingFeedbackRows = await fetchAllRows<BriefingFeedbackRow>(async (from, to) =>
    await supabase
      .from("briefing_feedback")
      .select(
        "briefing_id, rating_emoji, rating_theme_hit, rating_theme_miss, usefulness_score, acted_on, note, created_at",
      )
      .gte("created_at", windowStart)
      .lte("created_at", now.toISOString())
      .order("created_at", { ascending: false })
      .range(from, to),
  );

  const decisionFeedbackRows = await fetchAllRows<DecisionFeedbackRow>(async (from, to) =>
    await supabase
      .from("decision_guidance_feedback")
      .select("decision_guidance_id, usefulness_score, acted_on, note, created_at")
      .gte("created_at", windowStart)
      .lte("created_at", now.toISOString())
      .order("created_at", { ascending: false })
      .range(from, to),
  );

  const briefingIds = Array.from(new Set(briefingFeedbackRows.map((row) => row.briefing_id)));
  const decisionIds = Array.from(
    new Set(decisionFeedbackRows.map((row) => row.decision_guidance_id)),
  );

  const briefingRows =
    briefingIds.length === 0
      ? []
      : ((await supabase
          .from("daily_briefings")
          .select("id, generation_access_level")
          .in("id", briefingIds)).data as BriefingRow[] | null) ?? [];

  const decisionRows =
    decisionIds.length === 0
      ? []
      : ((await supabase
          .from("decision_guidance")
          .select("id, generation_access_level")
          .in("id", decisionIds)).data as DecisionRow[] | null) ?? [];

  const briefingTierById = new Map(
    briefingRows.map((row) => [row.id, (row.generation_access_level ?? "free") as AccessLevel]),
  );
  const decisionTierById = new Map(
    decisionRows.map((row) => [row.id, (row.generation_access_level ?? "free") as AccessLevel]),
  );

  const authUsers = await listAllAuthUsers();
  const currentPaidUsers = authUsers.filter(
    (user) =>
      getUserAccessLevel(
        toAccessUser(user) as Parameters<typeof getUserAccessLevel>[0],
      ) === "pro",
  );
  const currentPaidUserIds = new Set(currentPaidUsers.map((user) => user.id));

  const filteredProductEvents = productEventsResult.rows.filter((event) => {
    const surface = deriveSurface(event);
    return (
      matchesTier(event.tier, filters.tier) &&
      matchesPlatform(event.platform, filters.platform) &&
      matchesSurface(surface, filters.surface) &&
      matchesModelPath(event.generation_path, filters.modelPath)
    );
  });

  const filteredRoutingEvents = routingEventsResult.rows.filter((event) => {
    return (
      matchesTier(event.tier, filters.tier) &&
      matchesPlatform(event.platform, filters.platform) &&
      matchesSurface(event.feature, filters.surface) &&
      matchesModelPath(event.path_taken, filters.modelPath)
    );
  });

  const checkoutStarted = filteredProductEvents.filter(
    (event) => event.event_name === "checkout_started",
  );
  const checkoutCompleted = filteredProductEvents.filter(
    (event) => event.event_name === "checkout_completed",
  );
  const webCheckoutCompleted = checkoutCompleted.filter(
    (event) => event.platform === "web",
  );

  const paidActiveUserIds = new Set(
    filteredProductEvents
      .filter(
        (event) =>
          event.user_id !== null &&
          currentPaidUserIds.has(event.user_id),
      )
      .map((event) => event.user_id!),
  );

  const askSubmitted = filteredProductEvents.filter(
    (event) => event.event_name === "ask_submitted",
  );
  const askRegenerated = filteredProductEvents.filter(
    (event) => event.event_name === "ask_regenerated",
  );
  const askRepeatWithin24h = askSubmitted.filter(
    (event) => event.repeat_within_24h === true,
  );
  const askPaidSubmitted = askSubmitted.filter(
    (event) => event.tier === "pro" || event.tier === "internal",
  );

  // ── Moat engagement events ────────────────────────────────────────────────
  // These events are already in the product_events taxonomy but were never
  // surfaced here. They are the leading indicators of the longitudinal value
  // that justifies the 7-day trial: users who log decisions, check their
  // accuracy report, and rate briefings are the ones who experience the moat.
  const decisionLoggedEvents = filteredProductEvents.filter(
    (event) => event.event_name === "decision_logged",
  );
  const accuracyReportViewedEvents = filteredProductEvents.filter(
    (event) => event.event_name === "accuracy_report_viewed",
  );
  const briefingRatingSubmittedEvents = filteredProductEvents.filter(
    (event) => event.event_name === "briefing_rating_submitted",
  );

  const decisionLoggerUserIds = new Set(
    decisionLoggedEvents
      .map((e) => e.user_id)
      .filter((id): id is string => id !== null),
  );
  const accuracyReportViewerUserIds = new Set(
    accuracyReportViewedEvents
      .map((e) => e.user_id)
      .filter((id): id is string => id !== null),
  );
  const briefingRaterUserIds = new Set(
    briefingRatingSubmittedEvents
      .map((e) => e.user_id)
      .filter((id): id is string => id !== null),
  );

  const generatedEvents = filteredProductEvents.filter((event) =>
    [
      "today_generated",
      "forecast_generated",
      "blueprint_generated",
      "ask_submitted",
    ].includes(event.event_name),
  );
  const firstUseEvents = filteredProductEvents.filter((event) => event.is_first_use === true);

  const llmCostTracked = filteredProductEvents.filter(
    (event) => event.request_cost_estimate_usd != null,
  );
  const estimatedLlmCostTracked = llmCostTracked.filter(
    (event) => event.request_cost_is_estimated === true,
  );
  const totalTrackedLlmCost = llmCostTracked.reduce(
    (sum, event) => sum + (event.request_cost_estimate_usd ?? 0),
    0,
  );

  // LLM cost split by tier
  const paidLlmCostEvents = llmCostTracked.filter(
    (e) => e.tier === "pro" || e.tier === "internal",
  );
  const freeLlmCostEvents = llmCostTracked.filter((e) => e.tier === "free");
  const paidLlmCost = paidLlmCostEvents.reduce(
    (sum, e) => sum + (e.request_cost_estimate_usd ?? 0), 0,
  );
  const freeLlmCost = freeLlmCostEvents.reduce(
    (sum, e) => sum + (e.request_cost_estimate_usd ?? 0), 0,
  );
  const paidLlmUserIds = new Set(
    paidLlmCostEvents.map((e) => e.user_id).filter((id): id is string => id !== null),
  );
  const freeLlmUserIds = new Set(
    freeLlmCostEvents.map((e) => e.user_id).filter((id): id is string => id !== null),
  );

  // Prior period deltas
  const priorCheckoutCompleted = priorProductEventsResult.rows.filter(
    (e) => e.event_name === "checkout_completed",
  );
  const priorLlmCostTracked = priorProductEventsResult.rows.filter(
    (e) => e.request_cost_estimate_usd != null,
  );
  const priorTotalLlmCost = priorLlmCostTracked.reduce(
    (sum, e) => sum + (e.request_cost_estimate_usd ?? 0), 0,
  );
  const priorAskSubmitted = priorProductEventsResult.rows.filter(
    (e) => e.event_name === "ask_submitted",
  );

  // Gross margin estimate: MRR vs annualised period LLM cost
  const monthlyLlmCostEst = estimateMonthlyLlmCost(totalTrackedLlmCost, filters.timeWindow, now);
  const grossMarginEst =
    stripeRevenue.mrr !== null && stripeRevenue.mrr > 0 && totalTrackedLlmCost > 0
      ? ((stripeRevenue.mrr - monthlyLlmCostEst) / stripeRevenue.mrr) * 100
      : null;

  const conversionRowMap = filteredProductEvents.reduce((map, event) => {
      if (
        event.event_name !== "paywall_shown" &&
        event.event_name !== "upgrade_clicked" &&
        event.event_name !== "checkout_started" &&
        event.event_name !== "checkout_completed"
      ) {
        return map;
      }

      const surface = deriveSurface(event);

      if (surface === "all") {
        return map;
      }

      const key = `${surface}:${event.platform ?? "unknown"}`;
      const current = map.get(key) ?? {
        surface,
        platform: event.platform ?? "unknown",
        paywallShown: 0,
        upgradeClicked: 0,
        checkoutStarted: 0,
        checkoutCompleted: 0,
      };

      if (event.event_name === "paywall_shown") {
        current.paywallShown += 1;
      }
      if (event.event_name === "upgrade_clicked") {
        current.upgradeClicked += 1;
      }
      if (event.event_name === "checkout_started") {
        current.checkoutStarted += 1;
      }
      if (event.event_name === "checkout_completed") {
        current.checkoutCompleted += 1;
      }

      map.set(key, current);
      return map;
    }, new Map<string, Omit<SurfaceConversionRow, "clickToPaidRate" | "paywallToPaidRate">>());

  const conversionRows = Array.from(conversionRowMap.values())
    .map((row) => ({
      ...row,
      clickToPaidRate: percentage(row.checkoutCompleted, row.upgradeClicked),
      paywallToPaidRate: percentage(row.checkoutCompleted, row.paywallShown),
    }))
    .sort((left, right) => right.checkoutCompleted - left.checkoutCompleted);

  // ── By-channel acquisition rollup ──────────────────────────────────────────
  // Groups attribution_channel across the full acquisition funnel. Every event
  // now carries attribution_channel (stamped at insert time from the first-touch
  // cookie, falling back to user_attribution when the cookie is absent), so
  // this is a pure in-memory reduce over filteredProductEvents.
  //
  // Signups count distinct users, not distinct events, so a user who fires
  // multiple signup_completed events (shouldn't, but defensive) counts once.
  // Paid activations use checkout_completed as the canonical purchase event,
  // matching how the rest of the dashboard attributes revenue.
  const channelSignupUserIds = new Map<string, Set<string>>();
  const channelRowMap = filteredProductEvents.reduce((map, event) => {
    if (
      event.event_name !== "signup_completed" &&
      event.event_name !== "paywall_shown" &&
      event.event_name !== "checkout_started" &&
      event.event_name !== "checkout_completed"
    ) {
      return map;
    }

    const channel = event.attribution_channel ?? "unknown";
    const current = map.get(channel) ?? {
      channel,
      signups: 0,
      paidActivations: 0,
      paywallShown: 0,
      checkoutStarted: 0,
      checkoutCompleted: 0,
    };

    if (event.event_name === "signup_completed") {
      if (event.user_id !== null) {
        const set = channelSignupUserIds.get(channel) ?? new Set<string>();
        set.add(event.user_id);
        channelSignupUserIds.set(channel, set);
      } else {
        current.signups += 1;
      }
    }
    if (event.event_name === "paywall_shown") current.paywallShown += 1;
    if (event.event_name === "checkout_started") current.checkoutStarted += 1;
    if (event.event_name === "checkout_completed") {
      current.checkoutCompleted += 1;
      current.paidActivations += 1;
    }

    map.set(channel, current);
    return map;
  }, new Map<string, Omit<ChannelRow, "paywallToPaidRate">>());

  // Fold unique signup user_ids into the signups count.
  for (const [channel, userSet] of channelSignupUserIds.entries()) {
    const row = channelRowMap.get(channel);
    if (row !== undefined) {
      row.signups += userSet.size;
      channelRowMap.set(channel, row);
    } else {
      channelRowMap.set(channel, {
        channel,
        signups: userSet.size,
        paidActivations: 0,
        paywallShown: 0,
        checkoutStarted: 0,
        checkoutCompleted: 0,
      });
    }
  }

  const channelRows: ChannelRow[] = Array.from(channelRowMap.values())
    .map((row) => ({
      ...row,
      paywallToPaidRate: percentage(row.checkoutCompleted, row.paywallShown),
    }))
    .sort((left, right) => {
      // Paid activations first, then signups, then alphabetical — keeps the
      // operator's eye on the channels that matter for CAC payback.
      if (right.paidActivations !== left.paidActivations) {
        return right.paidActivations - left.paidActivations;
      }
      if (right.signups !== left.signups) {
        return right.signups - left.signups;
      }
      return left.channel.localeCompare(right.channel);
    });

  const usageRows: UsageRow[] = (["today", "forecast", "blueprint", "ask"] as const).map(
    (surface) => {
      const surfaceEvents = generatedEvents.filter((event) => deriveSurface(event) === surface);
      const surfaceFirstUse = firstUseEvents.filter((event) => deriveSurface(event) === surface);
      const surfaceRepeats =
        surface === "ask"
          ? askRepeatWithin24h.length
          : surfaceEvents.filter((event) => event.repeat_within_24h === true).length;

      return {
        surface: surface[0].toUpperCase() + surface.slice(1),
        generated: surfaceEvents.length,
        firstUse: surfaceFirstUse.length,
        repeatWithin24h: surfaceRepeats,
      };
    },
  );

  const routingMixMap = filteredRoutingEvents.reduce((map, event) => {
      const family = getModelFamily(event.final_model_selected);
      const current = map.get(family) ?? {
        modelFamily: family,
        requests: 0,
        fallbackCount: 0,
      };

      current.requests += 1;
      if (event.fallback_triggered) {
        current.fallbackCount += 1;
      }

      map.set(family, current);
      return map;
    }, new Map<string, { modelFamily: string; requests: number; fallbackCount: number }>());

  const routingMixRows = Array.from(routingMixMap.values())
    .map((row) => ({
      modelFamily: row.modelFamily,
      requests: row.requests,
      share: percentage(row.requests, filteredRoutingEvents.length),
      fallbackRate: percentage(row.fallbackCount, row.requests),
    }))
    .sort((left, right) => right.requests - left.requests);

  const filteredBriefingFeedback = briefingFeedbackRows.filter((row) =>
    matchesSurface("today", filters.surface) &&
    matchesTier(briefingTierById.get(row.briefing_id) ?? "free", filters.tier),
  );
  const filteredDecisionFeedback = decisionFeedbackRows.filter((row) =>
    matchesSurface("ask", filters.surface) &&
    matchesTier(decisionTierById.get(row.decision_guidance_id) ?? "free", filters.tier),
  );

  // Legacy 1-5 score — still computed for back-compat on rows submitted before
  // 5.2 Phase A shipped. New rows will be null here and excluded by `average`.
  const todayUsefulness = average(
    filteredBriefingFeedback
      .map((row) => row.usefulness_score)
      .filter((value): value is number => value !== null),
  );
  const askUsefulness = average(
    filteredDecisionFeedback.map((row) => row.usefulness_score),
  );

  // 5.2 Phase A: emoji rating rows carry rating_emoji. Only these feed the
  // new "Nailed it" / "Vague" / "Off" distribution — legacy 1-5 rows aren't
  // comparable and stay in their own legacy metric.
  const emojiRatedRows = filteredBriefingFeedback.filter(
    (row) => row.rating_emoji !== null,
  );
  const nailedItCount = emojiRatedRows.filter(
    (row) => row.rating_emoji === "nailed_it",
  ).length;
  const vagueCount = emojiRatedRows.filter(
    (row) => row.rating_emoji === "vague",
  ).length;
  const offCount = emojiRatedRows.filter(
    (row) => row.rating_emoji === "off",
  ).length;

  // Ask-side acted-on share stays pure — decision_guidance_feedback still uses
  // the 1-5 + acted_on shape. Briefing feedback no longer contributes here
  // (emoji rows have null acted_on, so filtering would double-count legacy
  // rows only; cleaner to report Ask-only below).
  const actedOnPositive = filteredDecisionFeedback.filter(
    (row) => row.acted_on !== "no",
  ).length;

  const checkoutDelta = priorProductEventsResult.ready
    ? formatDelta(checkoutCompleted.length, priorCheckoutCompleted.length)
    : null;
  const llmCostDelta = priorProductEventsResult.ready && priorTotalLlmCost > 0
    ? formatDelta(totalTrackedLlmCost, priorTotalLlmCost)
    : null;
  const askDelta = priorProductEventsResult.ready
    ? formatDelta(askSubmitted.length, priorAskSubmitted.length)
    : null;

  // ── Cohort retention ───────────────────────────────────────────────────────
  // Approximate D7 retention by signup week from product_events. We bucket
  // users by the ISO week of their first event, then check how many had
  // activity within 7 days of signup. This is a rough proxy — true cohort
  // retention is at /ops/funnel.
  const RETENTION_LOOKBACK_DAYS = 90;
  const retentionCutoff = new Date(now);
  retentionCutoff.setUTCDate(retentionCutoff.getUTCDate() - RETENTION_LOOKBACK_DAYS);

  const signupRowsForRetention = productEventsResult.rows.filter(
    (row) =>
      row.event_name === "signup_completed" &&
      row.user_id !== null &&
      row.occurred_at >= retentionCutoff.toISOString(),
  );

  const activityEventNames = new Set([
    "today_generated", "forecast_generated", "blueprint_generated", "ask_submitted",
    "first_today_generated", "first_forecast_generated",
    "first_blueprint_generated", "first_ask_submitted",
  ]);

  const userFirstEventTime = new Map<string, number>();
  const userActivityWeeks = new Map<string, Set<string>>();

  for (const row of productEventsResult.rows) {
    if (row.user_id === null) continue;
    const occurredAt = new Date(row.occurred_at).getTime();
    const existingFirst = userFirstEventTime.get(row.user_id);
    if (existingFirst === undefined || occurredAt < existingFirst) {
      userFirstEventTime.set(row.user_id, occurredAt);
    }
    if (activityEventNames.has(row.event_name)) {
      const weekLabel = getIsoWeekLabel(new Date(occurredAt));
      const weeks = userActivityWeeks.get(row.user_id) ?? new Set<string>();
      weeks.add(weekLabel);
      userActivityWeeks.set(row.user_id, weeks);
    }
  }

  function getIsoWeekLabel(date: Date) {
    const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getUTCDay() + 1) / 7,
    );
    return `W${weekNo.toString().padStart(2, "0")} ${date.getUTCFullYear()}`;
  }

  interface CohortAccum {
    label: string;
    signups: number;
    activeD7: number;
  }

  const cohortMap = new Map<string, CohortAccum>();
  for (const row of signupRowsForRetention) {
    const userId = row.user_id!;
    const firstTime = userFirstEventTime.get(userId);
    if (firstTime === undefined) continue;
    const signupDate = new Date(firstTime);
    const label = getIsoWeekLabel(signupDate);
    const signupWeekStart = getWeekStart(signupDate);
    const existing = cohortMap.get(label);
    if (existing) {
      existing.signups += 1;
    } else {
      cohortMap.set(label, { label, signups: 1, activeD7: 0 });
    }
    const userWeeks = userActivityWeeks.get(userId) ?? new Set<string>();
    for (const weekLabel of userWeeks) {
      const weekDate = parseIsoWeekLabel(weekLabel);
      if (weekDate === null) continue;
      const daysDiff = (weekDate.getTime() - signupWeekStart.getTime()) / 86400000;
      if (daysDiff >= 1 && daysDiff <= 7) {
        const cohort = cohortMap.get(label)!;
        cohort.activeD7 += 1;
      }
    }
  }

  function getWeekStart(date: Date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d;
  }

  function parseIsoWeekLabel(label: string) {
    const match = label.match(/^W(\d+)\s+(\d+)$/);
    if (!match) return null;
    const weekNo = parseInt(match[1], 10);
    const year = parseInt(match[2], 10);
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const daysIntoYear = (weekNo - 1) * 7;
    const jan1Day = startOfYear.getUTCDay();
    const daysToMonday = (jan1Day <= 4 ? jan1Day - 1 : jan1Day - 8) * -1;
    return new Date(Date.UTC(year, 0, 1 + daysIntoYear + daysToMonday));
  }

  const sortedCohorts = Array.from(cohortMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );

  const cohortRows: RetentionCohortRow[] = sortedCohorts.map((cohort) => ({
    week_label: cohort.label,
    signups: cohort.signups,
    active_d7: cohort.activeD7,
    d7_pct: cohort.signups > 0 ? `${((cohort.activeD7 / cohort.signups) * 100).toFixed(0)}%` : "—",
  }));

  // ── LTV estimation ─────────────────────────────────────────────────────────
  // Rough LTV per paid user: (avg tenure in weeks) * (MRR / current paid users).
  // Tenure is estimated from the gap between each paid user's first event and
  // the latest event in the window. Only paid users with ≥1 event contribute.
  const MONTHLY_PRICE = 14;
  const paidUsersWithTenure = currentPaidUsers
    .map((user) => {
      const userEvents = productEventsResult.rows.filter(
        (row) => row.user_id === user.id,
      );
      if (userEvents.length === 0) return null;
      const firstTime = Math.min(...userEvents.map((e) => new Date(e.occurred_at).getTime()));
      const lastTime = Math.max(...userEvents.map((e) => new Date(e.occurred_at).getTime()));
      const tenureMs = lastTime - firstTime;
      if (tenureMs <= 0) return null;
      return tenureMs / (7 * 24 * 60 * 60 * 1000);
    })
    .filter((t): t is number => t !== null);

  const avgTenureWeeks =
    paidUsersWithTenure.length > 0
      ? paidUsersWithTenure.reduce((sum, t) => sum + t, 0) / paidUsersWithTenure.length
      : null;

  const windowWeeks =
    filters.timeWindow === "today" ? 1
    : filters.timeWindow === "7d" ? 1
    : filters.timeWindow === "30d" ? 4.3
    : now.getUTCDate() / 7;

  const avgLtvPerUser =
    avgTenureWeeks !== null && currentPaidUsers.length > 0
      ? avgTenureWeeks * (MONTHLY_PRICE / Math.max(currentPaidUsers.length / windowWeeks, 1))
      : null;

  const ltvRows: LtvRow[] = sortedCohorts.map((cohort) => {
    const estLtv =
      cohort.signups > 0 && avgTenureWeeks !== null
        ? cohort.signups * (MONTHLY_PRICE / Math.max(cohort.signups, 1)) * avgTenureWeeks
        : 0;
    return {
      cohort_label: cohort.label,
      users: cohort.signups,
      avg_tenure_weeks: avgTenureWeeks ?? 0,
      est_ltv_per_user: avgLtvPerUser !== null ? `$${avgLtvPerUser.toFixed(2)}` : "—",
    };
  });

  return {
    filters,
    windowLabel: buildWindowLabel(filters),
    setupNotes,
    telemetryStatus: {
      productEventsReady: productEventsResult.ready,
      routingEventsReady: routingEventsResult.ready,
    },
    profitability: {
      metrics: [
        {
          label: "MRR",
          value: stripeRevenue.mrr !== null ? `$${stripeRevenue.mrr.toFixed(2)}` : "—",
          detail:
            stripeRevenue.mrr !== null
              ? `${stripeRevenue.totalCount} active sub${stripeRevenue.totalCount !== 1 ? "s" : ""}. ${stripeRevenue.monthlyCount} monthly, ${stripeRevenue.annualCount} annual (normalised to monthly).`
              : "Stripe connection unavailable. Check STRIPE_SECRET_KEY.",
          status: stripeRevenue.mrr !== null ? "live" : "placeholder",
        } satisfies MetricCard,
        {
          label: "LLM cost (period)",
          value: llmCostTracked.length === 0 ? "—" : formatUsd(totalTrackedLlmCost),
          detail:
            llmCostTracked.length === 0
              ? "No tracked cost yet. request_cost_estimate_usd not populated."
              : `Paid: ${formatUsd(paidLlmCost)} across ${paidLlmUserIds.size} users. Free: ${formatUsd(freeLlmCost)} across ${freeLlmUserIds.size} users. ${estimatedLlmCostTracked.length} of ${llmCostTracked.length} events use token-based estimates.`,
          status: llmCostTracked.length === 0 ? "placeholder" : "live",
          delta: llmCostDelta?.text ?? null,
          deltaDirection: llmCostDelta?.direction ?? "neutral",
        } satisfies MetricCard,
        {
          label: "Gross margin (est.)",
          value: grossMarginEst !== null ? `${grossMarginEst.toFixed(1)}%` : "—",
          detail:
            grossMarginEst !== null
              ? `MRR $${stripeRevenue.mrr!.toFixed(2)} − est. monthly LLM $${monthlyLlmCostEst.toFixed(2)}. Excludes astro API, infra, ads.`
              : stripeRevenue.mrr === null
                ? "Needs Stripe MRR."
                : "Needs tracked LLM cost.",
          status: grossMarginEst !== null ? "proxy" : "placeholder",
        } satisfies MetricCard,
        {
          label: "New paid (period)",
          value: `${checkoutCompleted.length}`,
          detail: `Checkout completions in ${buildWindowLabel(filters).toLowerCase()}. Cancellations tracked in Stripe, not yet surfaced here.`,
          status: "live",
          delta: checkoutDelta?.text ?? null,
          deltaDirection: checkoutDelta?.direction ?? "neutral",
        } satisfies MetricCard,
      ],
    },
    revenue: {
      metrics: [
        {
          label: "Paid accounts",
          value: `${currentPaidUsers.length}`,
          detail: "Active Pro accounts from Supabase auth metadata.",
          status: "live",
        },
        {
          label: "Checkout conversion",
          value: percentage(checkoutCompleted.length, checkoutStarted.length),
          detail: `${checkoutStarted.length} started / ${checkoutCompleted.length} completed in ${buildWindowLabel(filters).toLowerCase()}.`,
          status: "live",
          delta: checkoutDelta?.text ?? null,
          deltaDirection: checkoutDelta?.direction ?? "neutral",
        },
      ],
      conversionRows,
      channelRows,
    },
    retention: {
      metrics: [
        {
          label: "Paid active users",
          value: `${paidActiveUserIds.size}`,
          detail: `Proxy: paid accounts with ≥1 tracked event in the window. True D7/D30 cohort at /ops/funnel.`,
          status: "proxy",
        },
        {
          label: "Paid active share",
          value: percentage(paidActiveUserIds.size, currentPaidUsers.length),
          detail: "Proxy. True cohort retention table at /ops/funnel.",
          status: "proxy",
        },
      ],
      cohortRows,
    },
    ltv: {
      metrics: [
        {
          label: "Avg LTV per paid user",
          value: avgLtvPerUser !== null ? `$${avgLtvPerUser.toFixed(2)}` : "—",
          detail:
            avgLtvPerUser !== null
              ? `Based on ${currentPaidUsers.length} active paid users across ~${windowWeeks} weeks. Annualised: $${(avgLtvPerUser * 12).toFixed(2)}/user. Rough estimate — actual depends on retention and plan mix.`
              : "Insufficient paid-user tenure data.",
          status: currentPaidUsers.length > 0 ? "proxy" : "placeholder",
        } satisfies MetricCard,
        {
          label: "Avg tenure (weeks)",
          value: avgTenureWeeks !== null ? avgTenureWeeks.toFixed(1) : "—",
          detail:
            avgTenureWeeks !== null
              ? `Average subscription tenure across ${currentPaidUsers.length} active paid users in this window. Excludes users with no product_events.`
              : "No tenure data yet.",
          status: currentPaidUsers.length > 0 ? "proxy" : "placeholder",
        } satisfies MetricCard,
      ],
      rows: ltvRows,
    },
    usage: {
      metrics: [
        {
          label: "Asks per active user",
          value: formatDecimal(
            askSubmitted.length === 0
              ? null
              : askSubmitted.length /
                  Math.max(countUniqueNonNull(askSubmitted.map((row) => row.user_id)), 1),
            2,
          ),
          detail: "Ask submissions per unique user with ≥1 ask in the window.",
          status: "live",
          delta: askDelta?.text ?? null,
          deltaDirection: askDelta?.direction ?? "neutral",
        },
        {
          label: "Asks per paid user",
          value: formatDecimal(
            askPaidSubmitted.length === 0
              ? null
              : askPaidSubmitted.length /
                  Math.max(countUniqueNonNull(askPaidSubmitted.map((row) => row.user_id)), 1),
            2,
          ),
          detail: "Pro Ask submissions per unique paid user in the window.",
          status: "live",
        },
        {
          label: "Repeat Ask within 24h",
          value: percentage(askRepeatWithin24h.length, askSubmitted.length),
          detail: "Share of ask sessions followed by another within 24 hours.",
          status: "live",
        },
        {
          label: "Ask regeneration rate",
          value: percentage(askRegenerated.length, askSubmitted.length),
          detail: "ask_regenerated / ask_submitted — proxy for response dissatisfaction.",
          status: "live",
        },
      ],
      usageRows,
      moatMetrics: [
        {
          label: "Decision loggers",
          value: decisionLoggerUserIds.size === 0 ? "—" : `${decisionLoggerUserIds.size}`,
          detail:
            decisionLoggerUserIds.size === 0
              ? "No decision_logged events yet. Will populate as users log decisions."
              : `${decisionLoggedEvents.length} decision${decisionLoggedEvents.length !== 1 ? "s" : ""} logged by ${decisionLoggerUserIds.size} unique user${decisionLoggerUserIds.size !== 1 ? "s" : ""} in this window. % of paid: ${percentage(
                  Array.from(decisionLoggerUserIds).filter((id) => currentPaidUserIds.has(id)).length,
                  currentPaidUsers.length,
                )}.`,
          status: decisionLoggerUserIds.size === 0 ? "placeholder" : "live",
        } satisfies MetricCard,
        {
          label: "Decisions / logger",
          value:
            decisionLoggerUserIds.size === 0
              ? "—"
              : formatDecimal(decisionLoggedEvents.length / decisionLoggerUserIds.size, 1),
          detail:
            decisionLoggerUserIds.size === 0
              ? "No decision_logged events yet."
              : `Average decisions logged per user who logged ≥1 in this window.`,
          status: decisionLoggerUserIds.size === 0 ? "placeholder" : "live",
        } satisfies MetricCard,
        {
          label: "Accuracy report viewers",
          value:
            accuracyReportViewerUserIds.size === 0
              ? "—"
              : `${accuracyReportViewerUserIds.size}`,
          detail:
            accuracyReportViewerUserIds.size === 0
              ? "No accuracy_report_viewed events yet. Will populate once users open their accuracy score."
              : `${accuracyReportViewedEvents.length} view${accuracyReportViewedEvents.length !== 1 ? "s" : ""} by ${accuracyReportViewerUserIds.size} unique user${accuracyReportViewerUserIds.size !== 1 ? "s" : ""} in this window. % of paid: ${percentage(
                  Array.from(accuracyReportViewerUserIds).filter((id) => currentPaidUserIds.has(id)).length,
                  currentPaidUsers.length,
                )}.`,
          status: accuracyReportViewerUserIds.size === 0 ? "placeholder" : "live",
        } satisfies MetricCard,
        {
          label: "Briefing raters",
          value:
            briefingRaterUserIds.size === 0 ? "—" : `${briefingRaterUserIds.size}`,
          detail:
            briefingRaterUserIds.size === 0
              ? "No briefing_rating_submitted events yet. Will populate as users rate daily briefings."
              : `${briefingRatingSubmittedEvents.length} rating${briefingRatingSubmittedEvents.length !== 1 ? "s" : ""} submitted by ${briefingRaterUserIds.size} unique user${briefingRaterUserIds.size !== 1 ? "s" : ""} in this window (${formatDecimal(briefingRatingSubmittedEvents.length / Math.max(briefingRaterUserIds.size, 1), 1)} ratings/rater).`,
          status: briefingRaterUserIds.size === 0 ? "placeholder" : "live",
        } satisfies MetricCard,
      ],
    },
    cost: {
      metrics: [
        {
          label: "LLM cost (period)",
          value: llmCostTracked.length === 0 ? "—" : formatUsd(totalTrackedLlmCost),
          detail:
            llmCostTracked.length === 0
              ? "Not yet populated. request_cost_estimate_usd missing from product_events."
              : `${llmCostTracked.length} generation events. ${estimatedLlmCostTracked.length} use provider-token-based estimates.`,
          status: llmCostTracked.length === 0 ? "placeholder" : "live",
          delta: llmCostDelta?.text ?? null,
          deltaDirection: llmCostDelta?.direction ?? "neutral",
        },
        {
          label: "Cost per paid user",
          value:
            paidLlmUserIds.size > 0 && paidLlmCost > 0
              ? formatUsd(paidLlmCost / paidLlmUserIds.size)
              : "—",
          detail:
            paidLlmUserIds.size > 0
              ? `${paidLlmUserIds.size} paid user${paidLlmUserIds.size !== 1 ? "s" : ""} with tracked LLM cost in this window.`
              : "No paid user LLM cost tracked yet.",
          status: paidLlmUserIds.size > 0 ? "live" : "placeholder",
        },
        {
          label: "Cost per free user",
          value:
            freeLlmUserIds.size > 0 && freeLlmCost > 0
              ? formatUsd(freeLlmCost / freeLlmUserIds.size)
              : "—",
          detail:
            freeLlmUserIds.size > 0
              ? `${freeLlmUserIds.size} free user${freeLlmUserIds.size !== 1 ? "s" : ""} with tracked LLM cost in this window.`
              : "No free user LLM cost tracked yet.",
          status: freeLlmUserIds.size > 0 ? "live" : "placeholder",
        },
      ],
      routingRows: routingMixRows,
    },
    quality: {
      metrics: [
        {
          label: "Today rating: Nailed it",
          value: percentage(nailedItCount, emojiRatedRows.length),
          detail:
            emojiRatedRows.length > 0
              ? `${nailedItCount}/${emojiRatedRows.length} Today ratings landed as 🎯 in this window.`
              : "No Today ratings submitted yet in this window.",
          status: emojiRatedRows.length > 0 ? "live" : "placeholder",
        },
        {
          label: "Today rating mix",
          value:
            emojiRatedRows.length > 0
              ? `🎯 ${nailedItCount} · 🌫️ ${vagueCount} · 🙃 ${offCount}`
              : "—",
          detail:
            emojiRatedRows.length > 0
              ? `Out of ${emojiRatedRows.length} Today ratings.`
              : "Waiting on first rating submissions.",
          status: emojiRatedRows.length > 0 ? "live" : "placeholder",
        },
        {
          label: "Today legacy 1-5 (pre-5.2)",
          value: formatDecimal(todayUsefulness, 2),
          detail:
            filteredBriefingFeedback.filter((row) => row.usefulness_score !== null)
              .length > 0
              ? `${filteredBriefingFeedback.filter((row) => row.usefulness_score !== null).length} legacy 1-5 responses (pre-emoji rating launch).`
              : "No legacy 1-5 responses remain in this window.",
          status: "live",
        },
        {
          label: "Ask usefulness",
          value: formatDecimal(askUsefulness, 2),
          detail: `${filteredDecisionFeedback.length} feedback responses on Ask sessions.`,
          status: "live",
        },
        {
          label: "Ask acted-on share",
          value: percentage(actedOnPositive, filteredDecisionFeedback.length),
          detail:
            filteredDecisionFeedback.length > 0
              ? "yes + partial feedback on Ask guidance."
              : "No Ask feedback in this window.",
          status: filteredDecisionFeedback.length > 0 ? "live" : "placeholder",
        },
        {
          label: "Complaint rate",
          value: "—",
          detail: "Not yet tracked. Add complaint events to product_events.",
          status: "placeholder",
        },
      ],
    },
    // ── Ad-spend section ──────────────────────────────────────────────────────
    // Aggregates ad_spend by channel for the selected window. CPA is computed
    // by joining with the attribution data already in channelRows (signups,
    // activations per channel). Data source is mock until real API credentials
    // (META_ADS_ACCESS_TOKEN, GOOGLE_ADS_*) are configured.
    adSpend: (() => {
      const totalSpend = adSpendRows.reduce((sum, row) => sum + row.spend_usd, 0);
      const priorTotalSpend = priorAdSpendRows.reduce((sum, row) => sum + row.spend_usd, 0);
      const spendDelta = formatDelta(totalSpend, priorTotalSpend);

      const totalImpressions = adSpendRows.reduce(
        (sum, row) => sum + (row.impressions ?? 0), 0,
      );
      const totalClicks = adSpendRows.reduce(
        (sum, row) => sum + (row.clicks ?? 0), 0,
      );

      // CPA: total spend / total paid activations (across all channels)
      const totalPaidActivations = channelRows.reduce(
        (sum, row) => sum + row.paidActivations, 0,
      );
      const cpa = totalPaidActivations > 0 ? totalSpend / totalPaidActivations : null;

      // Per-channel aggregation
      const channelSpendMap = new Map<string, { spend: number; impressions: number; clicks: number; source: string }>();
      for (const row of adSpendRows) {
        const existing = channelSpendMap.get(row.channel) ?? { spend: 0, impressions: 0, clicks: 0, source: row.source };
        existing.spend += row.spend_usd;
        existing.impressions += row.impressions ?? 0;
        existing.clicks += row.clicks ?? 0;
        channelSpendMap.set(row.channel, existing);
      }

      const adSpendChannelRows: AdSpendChannelRow[] = Array.from(channelSpendMap.entries())
        .map(([channel, data]) => ({
          channel: channel === "meta" ? "Meta" : channel === "google" ? "Google" : channel,
          spend: formatUsd(data.spend),
          impressions: data.impressions,
          clicks: data.clicks,
          cpc: data.clicks > 0 ? formatUsd(data.spend / data.clicks) : "—",
          cpm: data.impressions > 0 ? formatUsd((data.spend / data.impressions) * 1000) : "—",
          source: data.source,
        }))
        .sort((a, b) => {
          const aSpend = parseFloat(a.spend.replace(/[$,]/g, "")) || 0;
          const bSpend = parseFloat(b.spend.replace(/[$,]/g, "")) || 0;
          return bSpend - aSpend;
        });

      const adSpendStatus: MetricStatus = adSpendRows.length > 0
        ? (adSpendRows[0].source === "mock" ? "proxy" : "live")
        : "placeholder";
      const isMock = adSpendRows.length > 0 && adSpendRows[0].source === "mock";

      return {
        metrics: [
          {
            label: "Total ad spend",
            value: adSpendRows.length === 0 ? "—" : formatUsd(totalSpend),
            detail:
              adSpendRows.length === 0
                ? "No ad-spend data yet. Run sql/014_ad_spend.sql and seed mock data or configure API credentials."
                : isMock
                  ? `${adSpendRows.length} rows of mock data. ${totalClicks > 0 ? `${totalClicks.toLocaleString()} clicks across ${channelSpendMap.size} channel(s).` : ""} Configure META_ADS_ACCESS_TOKEN and GOOGLE_ADS_* for real data.`
                  : `${adSpendRows.length} rows across ${channelSpendMap.size} channel(s). ${totalClicks > 0 ? `${totalClicks.toLocaleString()} clicks.` : ""}`,
            status: adSpendStatus,
            delta: spendDelta?.text ?? null,
            deltaDirection: spendDelta?.direction ?? "neutral",
          } satisfies MetricCard,
          {
            label: "CPA (blended)",
            value: cpa !== null ? formatUsd(cpa) : "—",
            detail:
              cpa !== null
                ? `Total spend / paid activations. ${totalPaidActivations} activation${totalPaidActivations !== 1 ? "s" : ""} in this window.`
                : "No paid activations in this window — CPA cannot be computed.",
            status: cpa !== null ? adSpendStatus : "placeholder",
          } satisfies MetricCard,
          {
            label: "CTR",
            value: percentage(totalClicks, totalImpressions),
            detail:
              totalImpressions > 0
                ? `${totalClicks.toLocaleString()} clicks / ${totalImpressions.toLocaleString()} impressions across all channels.`
                : "No impression data available.",
            status: totalImpressions > 0 ? adSpendStatus : "placeholder",
          } satisfies MetricCard,
        ],
        channelRows: adSpendChannelRows,
      };
    })(),
  };
}
