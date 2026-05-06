/**
 * Ad-spend ingestion — server-only.
 *
 * Daily spend data from Meta Ads and Google Ads (or mock data until real
 * API credentials are configured). Written to the `ad_spend` table and
 * surfaced on the /ops dashboard alongside attribution data for CPA-by-channel.
 *
 * Roadmap reference: 2.7
 */
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type AdSpendRow = {
  channel: "meta" | "google" | string;
  account_id: string | null;
  campaign_name: string | null;
  spend_date: string; // YYYY-MM-DD
  spend_usd: number;
  impressions: number | null;
  clicks: number | null;
  source: "mock" | "meta_api" | "google_api" | "manual";
};

/**
 * Insert one or more ad_spend rows. Uses upsert on (channel, spend_date, account_id)
 * so re-running ingestion for the same day is idempotent.
 */
export async function upsertAdSpend(rows: AdSpendRow[]): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("ad_spend").upsert(
    rows.map((row) => ({
      channel: row.channel,
      account_id: row.account_id ?? null,
      campaign_name: row.campaign_name ?? null,
      spend_date: row.spend_date,
      spend_usd: row.spend_usd,
      impressions: row.impressions ?? null,
      clicks: row.clicks ?? null,
      source: row.source,
    })),
    { onConflict: "channel,spend_date,account_id" },
  );

  if (error !== null) {
    console.error("[ad_spend] upsert failed:", error.message);
  }
}

/**
 * Fetch ad_spend rows for a date range. Used by the ops dashboard.
 * Returns rows ordered by spend_date desc, then channel.
 */
export async function fetchAdSpend(
  startDate: string,
  endDate: string,
): Promise<AdSpendRow[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ad_spend")
    .select("channel, account_id, campaign_name, spend_date, spend_usd, impressions, clicks, source")
    .gte("spend_date", startDate)
    .lte("spend_date", endDate)
    .order("spend_date", { ascending: false })
    .order("channel", { ascending: true });

  if (error !== null) {
    console.error("[ad_spend] fetch failed:", error.message);
    return [];
  }

  return (data ?? []) as AdSpendRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate realistic mock ad-spend rows for the past N days.
 * Uses a seeded deterministic pattern so the dashboard always renders
 * plausible data while the real API credentials are not configured.
 *
 * Call `seedMockAdSpend(30)` from a one-off script or the dashboard
 * boot path to populate the table.
 */
export function generateMockAdSpend(days: number): AdSpendRow[] {
  const now = new Date();
  const rows: AdSpendRow[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - dayOffset);
    const spendDate = date.toISOString().slice(0, 10);

    // Day-of-week factor: weekends get ~60% of weekday spend
    const dow = date.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const dowFactor = isWeekend ? 0.6 : 1.0;

    // Gentle growth trend: ~2% daily compound from 30 days ago
    const growthFactor = Math.pow(1.02, days - dayOffset);

    // Small day-to-day noise (±15%)
    const noise = 0.85 + Math.random() * 0.3;

    const baseMeta = 18.50; // daily baseline in USD
    const baseGoogle = 12.75;

    // Meta spend
    const metaSpend = Math.round(baseMeta * dowFactor * growthFactor * noise * 100) / 100;
    const metaImpressions = Math.round(metaSpend * (isWeekend ? 320 : 270));
    const metaClicks = Math.round(metaImpressions * (0.012 + Math.random() * 0.006));

    rows.push({
      channel: "meta",
      account_id: "act_mock_meta_001",
      campaign_name: null,
      spend_date: spendDate,
      spend_usd: metaSpend,
      impressions: metaImpressions,
      clicks: metaClicks,
      source: "mock",
    });

    // Google spend
    const googleSpend = Math.round(baseGoogle * dowFactor * growthFactor * noise * 100) / 100;
    const googleImpressions = Math.round(googleSpend * (isWeekend ? 220 : 190));
    const googleClicks = Math.round(googleImpressions * (0.018 + Math.random() * 0.008));

    rows.push({
      channel: "google",
      account_id: "cust_mock_google_001",
      campaign_name: null,
      spend_date: spendDate,
      spend_usd: googleSpend,
      impressions: googleImpressions,
      clicks: googleClicks,
      source: "mock",
    });
  }

  return rows;
}

/**
 * Seed mock ad-spend data for the past N days if no rows exist yet.
 * Safe to call from dashboard boot — idempotent due to upsert.
 */
export async function seedMockAdSpendIfNeeded(days: number): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from("ad_spend")
    .select("*", { count: "exact", head: true });

  if (error !== null || (count ?? 0) > 0) {
    return false;
  }

  const rows = generateMockAdSpend(days);
  await upsertAdSpend(rows);
  console.info(`[ad_spend] seeded ${rows.length} mock rows for past ${days} days`);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Real API stubs — to be implemented when credentials are available
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pull daily spend from Meta Marketing API.
 *
 * Requires: META_ADS_ACCESS_TOKEN and META_ADS_ACCOUNT_ID env vars.
 * Endpoint: GET graph.facebook.com/v19.0/{account_id}/insights
 *   ?level=account
 *   &fields=spend,impressions,clicks
 *   &date_preset=last_nd&time_range={"since":"...","until":"..."}
 *   &access_token=...
 *
 * For now returns an empty array and logs a warning.
 */
export async function pullMetaAdSpend(
  _startDate: string,
  _endDate: string,
): Promise<AdSpendRow[]> {
  const accessToken = process.env.META_ADS_ACCESS_TOKEN;
  const accountId = process.env.META_ADS_ACCOUNT_ID;

  if (!accessToken || !accountId) {
    console.info("[ad_spend] META_ADS_ACCESS_TOKEN / META_ADS_ACCOUNT_ID not configured — skipping Meta pull");
    return [];
  }

  // TODO: Implement Meta Marketing API call when credentials are available.
  // Reference: https://developers.facebook.com/docs/marketing-api/insights
  console.warn("[ad_spend] Meta Ads API integration not yet implemented — credentials detected but pull skipped");
  return [];
}

/**
 * Pull daily spend from Google Ads API.
 *
 * Requires: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID,
 *   GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN,
 *   GOOGLE_ADS_CUSTOMER_ID env vars.
 * Uses the Google Ads API (v17) CustomerService + GoogleAdsService
 * to query segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks.
 *
 * For now returns an empty array and logs a warning.
 */
export async function pullGoogleAdSpend(
  _startDate: string,
  _endDate: string,
): Promise<AdSpendRow[]> {
  const hasCreds =
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID;

  if (!hasCreds) {
    console.info("[ad_spend] GOOGLE_ADS_DEVELOPER_TOKEN / GOOGLE_ADS_CUSTOMER_ID not configured — skipping Google pull");
    return [];
  }

  // TODO: Implement Google Ads API call when credentials are available.
  // Reference: https://developers.google.com/google-ads/api/docs/start
  console.warn("[ad_spend] Google Ads API integration not yet implemented — credentials detected but pull skipped");
  return [];
}