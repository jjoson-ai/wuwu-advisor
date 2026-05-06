import {
  getOperatorDashboardData,
  type DashboardFilters,
  type DashboardModelPathFilter,
  type DashboardPlatformFilter,
  type DashboardSurfaceFilter,
  type DashboardTierFilter,
  type DashboardTimeWindow,
} from "@/domain/ops/dashboard.service";

function readEnumValue<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T,
) {
  if (typeof value !== "string") {
    return fallback;
  }

  return allowed.includes(value as T) ? (value as T) : fallback;
}

function buildFilters(
  searchParams: Record<string, string | string[] | undefined>,
): DashboardFilters {
  return {
    timeWindow: readEnumValue<DashboardTimeWindow>(
      searchParams.window,
      ["today", "7d", "30d", "mtd"],
      "7d",
    ),
    tier: readEnumValue<DashboardTierFilter>(
      searchParams.tier,
      ["all", "free", "pro", "internal"],
      "all",
    ),
    surface: readEnumValue<DashboardSurfaceFilter>(
      searchParams.surface,
      ["all", "today", "forecast", "blueprint", "ask"],
      "all",
    ),
    platform: readEnumValue<DashboardPlatformFilter>(
      searchParams.platform,
      ["all", "web", "mobile"],
      "all",
    ),
    modelPath: readEnumValue<DashboardModelPathFilter>(
      searchParams.modelPath,
      ["all", "single_pass", "cheap_final", "frontier_final", "full_fallback"],
      "all",
    ),
  };
}

/** Only renders a badge for non-live status — live is the default, no badge needed. */
function StatusBadge({ status }: { status: "live" | "proxy" | "placeholder" }) {
  if (status === "live") return null;

  const style =
    status === "proxy"
      ? { background: "rgba(171, 132, 27, 0.12)", color: "#7c5a10" }
      : { background: "rgba(123, 97, 65, 0.12)", color: "#6b5640" };

  return (
    <span
      style={{
        ...style,
        borderRadius: "999px",
        display: "inline-flex",
        flexShrink: 0,
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        padding: "0.25rem 0.55rem",
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  status: "live" | "proxy" | "placeholder";
  delta?: string | null;
  deltaDirection?: "up" | "down" | "neutral";
};

function MetricGrid({ metrics }: { metrics: MetricCardProps[] }) {
  return (
    <div
      style={{
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      }}
    >
      {metrics.map((metric) => (
        <div className="card card-feature stack" key={metric.label}>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              justifyContent: "space-between",
              gap: "0.75rem",
            }}
          >
            <p className="card-eyebrow" style={{ margin: 0 }}>
              {metric.label}
            </p>
            <StatusBadge status={metric.status} />
          </div>
          <h3 className="card-title" style={{ margin: 0 }}>
            {metric.value}
          </h3>
          {metric.delta ? (
            <p
              style={{
                margin: 0,
                fontSize: "0.8rem",
                fontWeight: 600,
                color:
                  metric.deltaDirection === "up"
                    ? "#1f5d43"
                    : metric.deltaDirection === "down"
                      ? "#c0392b"
                      : "inherit",
              }}
            >
              {metric.delta}
            </p>
          ) : null}
          <p className="muted" style={{ margin: 0 }}>
            {metric.detail}
          </p>
        </div>
      ))}
    </div>
  );
}

function DataTable({
  headers,
  rows,
  emptyMessage,
}: {
  headers: string[];
  rows: string[][];
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="card card-feature">
        <p className="muted" style={{ margin: 0 }}>
          {emptyMessage ?? "No matching rows for the current filters."}
        </p>
      </div>
    );
  }

  return (
    <div className="card card-feature" style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                style={{
                  borderBottom: "1px solid rgba(111, 90, 67, 0.16)",
                  fontSize: "0.8rem",
                  letterSpacing: "0.08em",
                  padding: "0 0 0.85rem",
                  textAlign: "left",
                  textTransform: "uppercase",
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.join("|")}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`${cell}-${cellIndex}`}
                  style={{
                    borderBottom:
                      index === rows.length - 1
                        ? "none"
                        : "1px solid rgba(111, 90, 67, 0.1)",
                    padding: "0.9rem 0",
                    verticalAlign: "top",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function OpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = buildFilters(await searchParams);
  const dashboard = await getOperatorDashboardData(filters);

  return (
    <div className="stack" style={{ gap: "1.5rem" }}>
      <section className="card card-featured card-hero stack">
        <p className="card-eyebrow" style={{ margin: 0 }}>
          Operator
        </p>
        <h1 className="page-title" style={{ margin: 0 }}>
          Wuwu metrics
        </h1>
        <p className="page-intro" style={{ margin: 0 }}>
          Revenue minus cost, and the levers that move them.
        </p>
        <form
          className="card card-feature"
          style={{
            display: "grid",
            gap: "0.9rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          }}
        >
          <label className="stack" style={{ gap: "0.35rem" }}>
            <span className="card-eyebrow" style={{ margin: 0 }}>
              Time window
            </span>
            <select defaultValue={filters.timeWindow} name="window">
              <option value="today">Today</option>
              <option value="7d">Last 7d</option>
              <option value="30d">Last 30d</option>
              <option value="mtd">Month to date</option>
            </select>
          </label>

          <label className="stack" style={{ gap: "0.35rem" }}>
            <span className="card-eyebrow" style={{ margin: 0 }}>
              Tier
            </span>
            <select defaultValue={filters.tier} name="tier">
              <option value="all">All</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="internal">Internal</option>
            </select>
          </label>

          <label className="stack" style={{ gap: "0.35rem" }}>
            <span className="card-eyebrow" style={{ margin: 0 }}>
              Surface
            </span>
            <select defaultValue={filters.surface} name="surface">
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="forecast">Forecast</option>
              <option value="blueprint">Blueprint</option>
              <option value="ask">Ask</option>
            </select>
          </label>

          <label className="stack" style={{ gap: "0.35rem" }}>
            <span className="card-eyebrow" style={{ margin: 0 }}>
              Platform
            </span>
            <select defaultValue={filters.platform} name="platform">
              <option value="all">All</option>
              <option value="web">Web</option>
              <option value="mobile">Mobile</option>
            </select>
          </label>

          <label className="stack" style={{ gap: "0.35rem" }}>
            <span className="card-eyebrow" style={{ margin: 0 }}>
              Model path
            </span>
            <select defaultValue={filters.modelPath} name="modelPath">
              <option value="all">All</option>
              <option value="single_pass">Single pass</option>
              <option value="cheap_final">Cheap final</option>
              <option value="frontier_final">Frontier final</option>
              <option value="full_fallback">Full fallback</option>
            </select>
          </label>

          <div className="stack" style={{ justifyContent: "end" }}>
            <button className="button" type="submit">
              Apply filters
            </button>
          </div>
        </form>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
          }}
        >
          <p className="muted" style={{ margin: 0 }}>
            <StatusBadge status="proxy" />{" "}proxy = estimated &nbsp;
            <StatusBadge status="placeholder" />{" "}placeholder = not yet tracked
          </p>
          <p className="muted" style={{ margin: 0, marginLeft: "auto" }}>
            Window: {dashboard.windowLabel}
          </p>
          <a href="/ops/funnel" style={{ fontSize: "0.85rem" }}>
            Funnel &amp; retention →
          </a>
        </div>
      </section>

      {dashboard.setupNotes.length > 0 ? (
        <section className="card card-state card-state--stale stack">
          <p className="card-eyebrow" style={{ margin: 0 }}>
            Setup notes
          </p>
          {dashboard.setupNotes.map((note) => (
            <p key={note} className="muted" style={{ margin: 0 }}>
              {note}
            </p>
          ))}
        </section>
      ) : null}

      <section className="stack">
        <div className="stack" style={{ gap: "0.3rem" }}>
          <p className="card-eyebrow" style={{ margin: 0 }}>
            P&amp;L
          </p>
          <h2 className="section-heading-serif" style={{ margin: 0 }}>
            Revenue, cost, and margin
          </h2>
        </div>
        <MetricGrid metrics={dashboard.profitability.metrics} />
      </section>

      <section className="stack">
        <div className="stack" style={{ gap: "0.3rem" }}>
          <p className="card-eyebrow" style={{ margin: 0 }}>
            Revenue
          </p>
          <h2 className="section-heading-serif" style={{ margin: 0 }}>
            Conversion and new paid
          </h2>
        </div>
        <MetricGrid metrics={dashboard.revenue.metrics} />
        <DataTable
          headers={[
            "Surface",
            "Platform",
            "Paywalls",
            "Clicks",
            "Starts",
            "Paid",
            "Click → Paid",
            "Paywall → Paid",
          ]}
          rows={dashboard.revenue.conversionRows.map((row) => [
            row.surface,
            row.platform,
            `${row.paywallShown}`,
            `${row.upgradeClicked}`,
            `${row.checkoutStarted}`,
            `${row.checkoutCompleted}`,
            row.clickToPaidRate,
            row.paywallToPaidRate,
          ])}
        />
        <div className="stack" style={{ gap: "0.3rem" }}>
          <p className="card-eyebrow" style={{ margin: 0 }}>
            By channel
          </p>
          <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
            First-touch attribution snapshot from the acquisition cookie.
            Channels: <code>google_paid</code> (gclid), <code>meta_paid</code>{" "}
            (fbclid), <code>other_paid</code> (UTM), <code>organic_search</code>,{" "}
            <code>referral</code>, <code>direct</code>.
            CPA-by-channel is now computed from <code>ad_spend</code> data below (see
            roadmap 2.7).
          </p>
        </div>
        <DataTable
          headers={[
            "Channel",
            "Signups",
            "Paywalls",
            "Starts",
            "Paid activations",
            "Paywall → Paid",
          ]}
          rows={dashboard.revenue.channelRows.map((row) => [
            row.channel,
            `${row.signups}`,
            `${row.paywallShown}`,
            `${row.checkoutStarted}`,
            `${row.paidActivations}`,
            row.paywallToPaidRate,
          ])}
          emptyMessage="No attribution data yet. Will populate as users arrive with UTM params or click IDs (gclid / fbclid)."
        />
        <div className="stack" style={{ gap: "0.3rem" }}>
          <p className="card-eyebrow" style={{ margin: 0 }}>
            By surface
          </p>
          <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
            First-use → paywall → upgrade → pro activation per feature surface.
            Identifies which surface converts best to Pro.
          </p>
        </div>
        <DataTable
          headers={["Surface", "First use", "Paywalls", "Upgrades", "Pro activated", "Free → Pro"]}
          rows={dashboard.revenue.surfaceConversionRows.map((row) => [
            row.surface,
            `${row.firstUseCount}`,
            `${row.paywallShown}`,
            `${row.upgradeClicked}`,
            `${row.proActivated}`,
            row.freeToProRate,
          ])}
          emptyMessage="No surface conversion data yet. Requires first_today/forecast/blueprint/ask + paywall/upgrade/pro_activated events."
        />
      </section>

      <section className="stack">
        <div
          style={{
            alignItems: "baseline",
            display: "flex",
            gap: "1rem",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div className="stack" style={{ gap: "0.3rem" }}>
            <p className="card-eyebrow" style={{ margin: 0 }}>
              Retention
            </p>
            <h2 className="section-heading-serif" style={{ margin: 0 }}>
              Paid continuity
            </h2>
          </div>
          <a href="/ops/funnel" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
            Cohort table →
          </a>
        </div>
        <MetricGrid metrics={dashboard.retention.metrics} />
        <DataTable
          headers={["Cohort (week)", "Signups", "D7 active", "D7 %", "D14 active", "D14 %", "D30 active", "D30 %"]}
          rows={dashboard.retention.cohortRows.map((row) => [
            row.week_label,
            `${row.signups}`,
            `${row.active_d7}`,
            row.d7_pct,
            `${row.active_d14}`,
            row.d14_pct,
            row.d30_incomplete ? "…" : `${row.active_d30}`,
            row.d30_pct,
          ])}
          emptyMessage="No cohort data yet. Will populate as users sign up and generate content."
        />
      </section>

      <section className="stack">
        <div className="stack" style={{ gap: "0.3rem" }}>
          <p className="card-eyebrow" style={{ margin: 0 }}>
            LTV estimate
          </p>
          <h2 className="section-heading-serif" style={{ margin: 0 }}>
            Revenue per user over time
          </h2>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
          LTV per paid user: (avg subscription tenure in weeks) × (MRR ÷ paid users).{" "}
          Annualised by multiplying by 12. Uses Stripe MRR when available; falls back to
          $14/mo when Stripe is disconnected. Cohort LTV assumes uniform distribution
          across signups in each cohort.
        </p>
        <MetricGrid metrics={dashboard.ltv.metrics} />
        <DataTable
          headers={["Cohort (week)", "Signups", "Avg tenure (wks)", "MRR/user", "Est LTV/user"]}
          rows={dashboard.ltv.rows.map((row) => [
            row.cohort_label,
            `${row.users}`,
            row.avg_tenure_weeks.toFixed(1),
            row.mrr_per_user !== null ? `$${row.mrr_per_user.toFixed(2)}` : "—",
            row.est_ltv_per_user,
          ])}
          emptyMessage="No LTV data yet. Requires paid user tenure data from product_events."
        />
      </section>

      <section className="stack">
        <div className="stack" style={{ gap: "0.3rem" }}>
          <p className="card-eyebrow" style={{ margin: 0 }}>
            Usage
          </p>
          <h2 className="section-heading-serif" style={{ margin: 0 }}>
            Surface demand and Ask depth
          </h2>
        </div>
        <MetricGrid metrics={dashboard.usage.metrics} />
        <DataTable
          headers={["Surface", "Generated", "First use", "Repeat within 24h"]}
          rows={dashboard.usage.usageRows.map((row) => [
            row.surface,
            `${row.generated}`,
            `${row.firstUse}`,
            `${row.repeatWithin24h}`,
          ])}
        />
      </section>

      <section className="stack">
        <div className="stack" style={{ gap: "0.3rem" }}>
          <p className="card-eyebrow" style={{ margin: 0 }}>
            Moat engagement
          </p>
          <h2 className="section-heading-serif" style={{ margin: 0 }}>
            Decision log · Accuracy report · Briefing ratings
          </h2>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Leading indicators of longitudinal value — the mechanics that justify
          a 7-day trial and differentiate Wuwu from a generic AI chat
          substitute. Target: ≥30% of Pro users log ≥1 decision per week;
          ≥20% view Accuracy Report within 30 days of signup.
        </p>
        <MetricGrid metrics={dashboard.usage.moatMetrics} />
      </section>

      <section className="stack">
        <div className="stack" style={{ gap: "0.3rem" }}>
          <p className="card-eyebrow" style={{ margin: 0 }}>
            Cost
          </p>
          <h2 className="section-heading-serif" style={{ margin: 0 }}>
            LLM spend and routing mix
          </h2>
        </div>
        <MetricGrid metrics={dashboard.cost.metrics} />
        <DataTable
          headers={["Model family", "Requests", "Share", "Fallback rate"]}
          rows={dashboard.cost.routingRows.map((row) => [
            row.modelFamily,
            `${row.requests}`,
            row.share,
            row.fallbackRate,
          ])}
        />
      </section>

      <section className="stack">
        <div className="stack" style={{ gap: "0.3rem" }}>
          <p className="card-eyebrow" style={{ margin: 0 }}>
            Quality
          </p>
          <h2 className="section-heading-serif" style={{ margin: 0 }}>
            Do users say the app helps them?
          </h2>
        </div>
        <MetricGrid metrics={dashboard.quality.metrics} />
      </section>

      <section className="stack">
        <div className="stack" style={{ gap: "0.3rem" }}>
          <p className="card-eyebrow" style={{ margin: 0 }}>
            Ad spend
          </p>
          <h2 className="section-heading-serif" style={{ margin: 0 }}>
            Cost per channel and CPA
          </h2>
        </div>
        <MetricGrid metrics={dashboard.adSpend.metrics} />
        {dashboard.adSpend.channelRows.length > 0 && (
          <DataTable
            headers={["Channel", "Spend", "Impressions", "Clicks", "CPC", "CPM", "Source"]}
            rows={dashboard.adSpend.channelRows.map((row) => [
              row.channel,
              row.spend,
              row.impressions.toLocaleString(),
              row.clicks.toLocaleString(),
              row.cpc,
              row.cpm,
              row.source,
            ])}
          />
        )}
      </section>
    </div>
  );
}
