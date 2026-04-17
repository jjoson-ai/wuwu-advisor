import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { getUserAccessLevel, type AccessLevel } from "@/lib/access";
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
  usefulness_score: number;
  acted_on: "yes" | "partial" | "no";
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

type RoutingMixRow = {
  modelFamily: string;
  requests: number;
  share: string;
  fallbackRate: string;
};

export type OperatorDashboardData = {
  filters: DashboardFilters;
  windowLabel: string;
  setupNotes: string[];
  telemetryStatus: {
    productEventsReady: boolean;
    routingEventsReady: boolean;
  };
  revenue: {
    metrics: MetricCard[];
    conversionRows: SurfaceConversionRow[];
  };
  retention: {
    metrics: MetricCard[];
  };
  usage: {
    metrics: MetricCard[];
    usageRows: UsageRow[];
  };
  cost: {
    metrics: MetricCard[];
    routingRows: RoutingMixRow[];
  };
  quality: {
    metrics: MetricCard[];
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
  const setupNotes: string[] = [];

  const productEventsResult = await safeFetchTelemetryRows<ProductEventRow>(
    () =>
      fetchAllRows(async (from, to) =>
        await supabase
          .from("product_events")
          .select(
            "occurred_at, user_id, event_name, tier, platform, feature, plan_type, upgrade_surface, request_id, final_model_selected, generation_path, fallback_triggered, request_cost_estimate_usd, request_cost_is_estimated, is_first_use, repeat_within_24h",
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

  const briefingFeedbackRows = await fetchAllRows<BriefingFeedbackRow>(async (from, to) =>
    await supabase
      .from("briefing_feedback")
      .select("briefing_id, usefulness_score, acted_on, note, created_at")
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

  const todayUsefulness = average(
    filteredBriefingFeedback.map((row) => row.usefulness_score),
  );
  const askUsefulness = average(
    filteredDecisionFeedback.map((row) => row.usefulness_score),
  );
  const actedOnPositive =
    filteredBriefingFeedback.filter((row) => row.acted_on !== "no").length +
    filteredDecisionFeedback.filter((row) => row.acted_on !== "no").length;
  const totalFeedbackCount =
    filteredBriefingFeedback.length + filteredDecisionFeedback.length;

  return {
    filters,
    windowLabel: buildWindowLabel(filters),
    setupNotes,
    telemetryStatus: {
      productEventsReady: productEventsResult.ready,
      routingEventsReady: routingEventsResult.ready,
    },
    revenue: {
      metrics: [
        {
          label: "Current paid accounts",
          value: `${currentPaidUsers.length}`,
          detail: "Live from Supabase auth metadata.",
          status: "live",
        },
        {
          label: "Checkout start → completion",
          value: percentage(checkoutCompleted.length, checkoutStarted.length),
          detail: `${checkoutStarted.length} started / ${checkoutCompleted.length} completed in ${buildWindowLabel(filters).toLowerCase()}.`,
          status: "live",
        },
        {
          label: "Web share of paid checkouts",
          value: percentage(webCheckoutCompleted.length, checkoutCompleted.length),
          detail: "Live from checkout_completed platform split.",
          status: "live",
        },
      ],
      conversionRows,
    },
    retention: {
      metrics: [
        {
          label: "Paid active users",
          value: `${paidActiveUserIds.size}`,
          detail: `Proxy: currently paid accounts with any tracked event in ${buildWindowLabel(filters).toLowerCase()}.`,
          status: "proxy",
        },
        {
          label: "Paid active share",
          value: percentage(paidActiveUserIds.size, currentPaidUsers.length),
          detail: "Proxy only. True D7/D30 cohort retention is not yet persisted.",
          status: "proxy",
        },
        {
          label: "Paid D7 / D30 retention",
          value: "Pending",
          detail: "Placeholder until subscription cohort telemetry is persisted.",
          status: "placeholder",
        },
      ],
    },
    usage: {
      metrics: [
        {
          label: "Ask intensity per active ask user",
          value: formatDecimal(
            askSubmitted.length === 0
              ? null
              : askSubmitted.length / Math.max(countUniqueNonNull(askSubmitted.map((row) => row.user_id)), 1),
            2,
          ),
          detail: "Live from ask_submitted events.",
          status: "live",
        },
        {
          label: "Ask intensity per paid ask user",
          value: formatDecimal(
            askPaidSubmitted.length === 0
              ? null
              : askPaidSubmitted.length /
                  Math.max(countUniqueNonNull(askPaidSubmitted.map((row) => row.user_id)), 1),
            2,
          ),
          detail: "Live from Pro Ask usage only.",
          status: "live",
        },
        {
          label: "Repeat Ask within 24h",
          value: percentage(askRepeatWithin24h.length, askSubmitted.length),
          detail: "Live from repeat_within_24h instrumentation.",
          status: "live",
        },
        {
          label: "Ask regeneration rate",
          value: percentage(askRegenerated.length, askSubmitted.length),
          detail: "Live from ask_regenerated / ask_submitted.",
          status: "live",
        },
      ],
      usageRows,
    },
    cost: {
      metrics: [
        {
          label: "Tracked LLM cost",
          value: formatUsd(totalTrackedLlmCost || null),
          detail:
            llmCostTracked.length === 0
              ? "Placeholder until request_cost_estimate_usd is populated."
              : `Live from ${llmCostTracked.length} tracked generation events. ${estimatedLlmCostTracked.length} use provider-token-based USD estimates from the in-repo pricing snapshot.`,
          status: llmCostTracked.length === 0 ? "placeholder" : "live",
        },
        {
          label: "Astrology API cost by surface",
          value: "Pending",
          detail: "Placeholder until per-request astrology API cost is persisted.",
          status: "placeholder",
        },
        {
          label: "Gross margin by tier / surface / platform",
          value: "Pending",
          detail: "Placeholder until revenue allocation and cost estimates are both persisted.",
          status: "placeholder",
        },
      ],
      routingRows: routingMixRows,
    },
    quality: {
      metrics: [
        {
          label: "Today usefulness score",
          value: formatDecimal(todayUsefulness, 2),
          detail: `${filteredBriefingFeedback.length} feedback rows. Usefulness stays separate from predictive accuracy.`,
          status: "live",
        },
        {
          label: "Ask usefulness score",
          value: formatDecimal(askUsefulness, 2),
          detail: `${filteredDecisionFeedback.length} feedback rows. Usefulness stays separate from predictive accuracy.`,
          status: "live",
        },
        {
          label: "Acted-on share",
          value: percentage(actedOnPositive, totalFeedbackCount),
          detail: "Live from yes/partial feedback on Today and Ask.",
          status: "live",
        },
        {
          label: "Complaint / harmful-output rate",
          value: "Pending",
          detail: "Placeholder until complaints and harmful-output incidents are persisted as first-class telemetry.",
          status: "placeholder",
        },
      ],
    },
  };
}
