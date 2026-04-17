import { redirect } from "next/navigation";

import {
  getOperatorDashboardData,
  type DashboardFilters,
  type DashboardModelPathFilter,
  type DashboardPlatformFilter,
  type DashboardSurfaceFilter,
  type DashboardTierFilter,
  type DashboardTimeWindow,
} from "@/domain/ops/dashboard.service";
import { getCurrentUser } from "@/lib/auth";
import { getServerAccessState } from "@/lib/debug-access";

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

function StatusBadge({ status }: { status: "live" | "proxy" | "placeholder" }) {
  const style =
    status === "live"
      ? { background: "rgba(31, 122, 79, 0.12)", color: "#1f5d43" }
      : status === "proxy"
        ? { background: "rgba(171, 132, 27, 0.12)", color: "#7c5a10" }
        : { background: "rgba(123, 97, 65, 0.12)", color: "#6b5640" };

  return (
    <span
      style={{
        ...style,
        borderRadius: "999px",
        display: "inline-flex",
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

function MetricGrid({
  metrics,
}: {
  metrics: Array<{
    label: string;
    value: string;
    detail: string;
    status: "live" | "proxy" | "placeholder";
  }>;
}) {
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
}: {
  headers: string[];
  rows: string[][];
}) {
  if (rows.length === 0) {
    return (
      <div className="card card-feature">
        <p className="muted" style={{ margin: 0 }}>
          No matching rows for the current filters.
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
  const user = await getCurrentUser();

  if (user === null) {
    redirect("/login");
  }

  const accessState = await getServerAccessState(user);

  if (accessState.accessLevel !== "internal") {
    redirect("/dashboard");
  }

  const filters = buildFilters(await searchParams);
  const dashboard = await getOperatorDashboardData(filters);

  return (
    <div className="stack" style={{ gap: "1.5rem" }}>
      <section className="card card-featured card-hero stack">
        <p className="card-eyebrow" style={{ margin: 0 }}>
          Internal Dashboard
        </p>
        <h1 className="page-title" style={{ margin: 0 }}>
          Launch operator KPI dashboard
        </h1>
        <p className="page-intro" style={{ margin: 0 }}>
          Decision-useful launch view over first-party telemetry, billing state,
          and feedback. Usefulness is tracked separately from predictive
          accuracy.
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
          }}
        >
          <StatusBadge status="live" />
          <StatusBadge status="proxy" />
          <StatusBadge status="placeholder" />
          <p className="muted" style={{ margin: 0 }}>
            Window: {dashboard.windowLabel}
          </p>
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
            Revenue growth
          </p>
          <h2 className="section-heading-serif" style={{ margin: 0 }}>
            Conversion and paid growth
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
      </section>

      <section className="stack">
        <div className="stack" style={{ gap: "0.3rem" }}>
          <p className="card-eyebrow" style={{ margin: 0 }}>
            Retention & monetization quality
          </p>
          <h2 className="section-heading-serif" style={{ margin: 0 }}>
            Paid continuity and retention proxy
          </h2>
        </div>
        <MetricGrid metrics={dashboard.retention.metrics} />
      </section>

      <section className="stack">
        <div className="stack" style={{ gap: "0.3rem" }}>
          <p className="card-eyebrow" style={{ margin: 0 }}>
            Product usage & demand
          </p>
          <h2 className="section-heading-serif" style={{ margin: 0 }}>
            Surface demand and Ask intensity
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
            Cost & gross margin
          </p>
          <h2 className="section-heading-serif" style={{ margin: 0 }}>
            Routing discipline first, cost detail second
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
            Quality & trust
          </p>
          <h2 className="section-heading-serif" style={{ margin: 0 }}>
            Usefulness separate from predictive accuracy
          </h2>
        </div>
        <MetricGrid metrics={dashboard.quality.metrics} />
      </section>
    </div>
  );
}
