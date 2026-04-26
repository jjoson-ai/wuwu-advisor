import { getFunnelPageData, type FunnelStep } from "@/domain/ops/funnel.service";

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components (mirrors ops/page.tsx style)
// ─────────────────────────────────────────────────────────────────────────────

function DataTable({
  headers,
  rows,
  emptyMessage,
}: {
  headers: string[];
  rows: Array<Array<{ text: string; muted?: boolean; accent?: boolean }>>;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="card card-feature">
        <p className="muted" style={{ margin: 0 }}>
          {emptyMessage ?? "No data yet."}
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
                  padding: "0 1.5rem 0.85rem 0",
                  textAlign: "left",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {row.map((cell, cellIdx) => (
                <td
                  key={cellIdx}
                  style={{
                    borderBottom:
                      rowIdx === rows.length - 1
                        ? "none"
                        : "1px solid rgba(111, 90, 67, 0.1)",
                    color: cell.muted
                      ? "var(--color-muted, #9a856e)"
                      : cell.accent
                        ? "#1f5d43"
                        : undefined,
                    fontWeight: cell.accent ? 600 : undefined,
                    padding: "0.9rem 1.5rem 0.9rem 0",
                    verticalAlign: "top",
                    whiteSpace: "nowrap",
                  }}
                >
                  {cell.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  heading,
}: {
  eyebrow: string;
  heading: string;
}) {
  return (
    <div className="stack" style={{ gap: "0.3rem" }}>
      <p className="card-eyebrow" style={{ margin: 0 }}>
        {eyebrow}
      </p>
      <h2 className="section-heading-serif" style={{ margin: 0 }}>
        {heading}
      </h2>
    </div>
  );
}

function StatPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="card card-feature stack">
      <p className="card-eyebrow" style={{ margin: 0 }}>
        {label}
      </p>
      <h3 className="card-title" style={{ margin: 0 }}>
        {value}
      </h3>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Funnel visualisation
// ─────────────────────────────────────────────────────────────────────────────

function FunnelBar({ step, maxUsers }: { step: FunnelStep; maxUsers: number }) {
  const barWidthPct =
    maxUsers > 0 ? `${((step.users / maxUsers) * 100).toFixed(1)}%` : "0%";

  return (
    <div
      style={{
        display: "grid",
        gap: "0.4rem",
        gridTemplateColumns: "10rem 1fr 5rem 5rem 5rem",
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: "0.85rem" }}>{step.label}</span>
      <div
        style={{
          background: "rgba(111, 90, 67, 0.1)",
          borderRadius: "3px",
          height: "1.25rem",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            background: "rgba(111, 90, 67, 0.45)",
            borderRadius: "3px",
            height: "100%",
            transition: "width 0.2s",
            width: barWidthPct,
          }}
        />
      </div>
      <span
        style={{
          fontSize: "0.85rem",
          fontWeight: 600,
          textAlign: "right",
        }}
      >
        {step.users.toLocaleString()}
      </span>
      <span
        className="muted"
        style={{ fontSize: "0.82rem", textAlign: "right" }}
      >
        {step.pct_of_top}
      </span>
      <span
        className="muted"
        style={{ fontSize: "0.82rem", textAlign: "right" }}
      >
        {step.pct_of_prev !== "—" && step.pct_of_prev !== "100%"
          ? `↓ ${step.pct_of_prev}`
          : step.pct_of_prev}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function FunnelPage() {
  const data = await getFunnelPageData();

  const maxFunnelUsers = data.funnel[0]?.users ?? 1;

  const asOfDate = new Date(data.asOf).toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="stack" style={{ gap: "1.5rem" }}>
      {/* Header */}
      <section className="card card-featured card-hero stack">
        <p className="card-eyebrow" style={{ margin: 0 }}>
          Internal — Funnel &amp; Retention
        </p>
        <h1 className="page-title" style={{ margin: 0 }}>
          Funnel + retention telemetry
        </h1>
        <p className="page-intro" style={{ margin: 0 }}>
          All-time conversion funnel, weekly cohort retention (D1 / D7 / D30),
          time-to-upgrade distribution, and upgrade-surface performance.
          Computed from <code>product_events</code>. No time-window filter —
          funnel and retention are naturally cohort-based.
        </p>
        <div
          style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}
        >
          <a href="/ops" style={{ fontSize: "0.85rem" }}>
            ← Back to operator KPI dashboard
          </a>
          <span className="muted" style={{ fontSize: "0.82rem" }}>
            As of {asOfDate} UTC
          </span>
        </div>
      </section>

      {/* Setup notes */}
      {data.setupNotes.length > 0 ? (
        <section className="card card-state card-state--stale stack">
          <p className="card-eyebrow" style={{ margin: 0 }}>
            Setup notes
          </p>
          {data.setupNotes.map((note) => (
            <p key={note} className="muted" style={{ margin: 0 }}>
              {note}
            </p>
          ))}
        </section>
      ) : null}

      {/* Conversion funnel */}
      <section className="stack">
        <SectionHeader
          eyebrow="Acquisition funnel"
          heading="Signup → Pro activation (all-time, unique users)"
        />
        <div className="card card-feature stack" style={{ gap: "0.75rem" }}>
          <div
            style={{
              display: "grid",
              gap: "0.4rem",
              gridTemplateColumns: "10rem 1fr 5rem 5rem 5rem",
              paddingBottom: "0.5rem",
              borderBottom: "1px solid rgba(111, 90, 67, 0.16)",
            }}
          >
            <span
              style={{
                fontSize: "0.78rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Step
            </span>
            <span />
            <span
              style={{
                fontSize: "0.78rem",
                letterSpacing: "0.08em",
                textAlign: "right",
                textTransform: "uppercase",
              }}
            >
              Users
            </span>
            <span
              style={{
                fontSize: "0.78rem",
                letterSpacing: "0.08em",
                textAlign: "right",
                textTransform: "uppercase",
              }}
            >
              of top
            </span>
            <span
              style={{
                fontSize: "0.78rem",
                letterSpacing: "0.08em",
                textAlign: "right",
                textTransform: "uppercase",
              }}
            >
              step drop
            </span>
          </div>
          {data.funnel.map((step) => (
            <FunnelBar
              key={step.event_name}
              step={step}
              maxUsers={maxFunnelUsers}
            />
          ))}
        </div>
      </section>

      {/* Cohort retention */}
      <section className="stack">
        <SectionHeader
          eyebrow="Cohort retention"
          heading="D1 / D7 / D30 by signup week (last 90 days)"
        />
        <DataTable
          headers={[
            "Week",
            "Signups",
            "D1 users",
            "D1 %",
            "D7 users",
            "D7 %",
            "D30 users",
            "D30 %",
          ]}
          rows={data.retention.map((row) => [
            { text: row.week_label },
            { text: row.signups.toLocaleString() },
            { text: row.d1_count.toLocaleString() },
            {
              text: row.d1_pct,
              accent: parseFloat(row.d1_pct) >= 40,
              muted: row.d1_pct === "—",
            },
            { text: row.d7_count.toLocaleString() },
            {
              text: row.d7_pct,
              accent: parseFloat(row.d7_pct) >= 30,
              muted: row.d7_pct === "—",
            },
            { text: row.d30_count.toLocaleString() },
            {
              text: row.d30_incomplete ? "…" : row.d30_pct,
              muted: row.d30_incomplete || row.d30_pct === "—",
              accent:
                !row.d30_incomplete && parseFloat(row.d30_pct) >= 20,
            },
          ])}
          emptyMessage="No signup cohort data yet. Will populate as users sign up and generate content."
        />
        <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
          D1/D7/D30 = users who generated any content (Today / Forecast /
          Blueprint / Ask) within 1, 7, or 30 days of signup. "…" = cohort
          younger than 30 days; D30 will update as users return. Thresholds for
          healthy consumer apps: D1 ≥ 40%, D7 ≥ 20%, D30 ≥ 10%.
        </p>
      </section>

      {/* Time to upgrade */}
      <section className="stack">
        <SectionHeader
          eyebrow="Time to upgrade"
          heading="How long from signup to Pro activation"
        />
        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          }}
        >
          <StatPair label="Median time to upgrade" value={data.timeToUpgrade.medianDays} />
          <StatPair label="P75 time to upgrade" value={data.timeToUpgrade.p75Days} />
        </div>
        <DataTable
          headers={["Time bucket", "Upgrades", "% of total"]}
          rows={data.timeToUpgrade.rows.map((row) => [
            { text: row.bucket },
            { text: row.count.toLocaleString() },
            {
              text: row.pct,
              muted: row.count === 0,
            },
          ])}
          emptyMessage="No upgrades yet. Will populate once users activate Pro."
        />
        <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
          Bucket "7 – 10 days (trial)" aligns with the 7-day free trial window.
          Upgrades in this bucket are likely trial-to-paid conversions on the
          annual plan.
        </p>
      </section>

      {/* Upgrade surface performance */}
      <section className="stack">
        <SectionHeader
          eyebrow="Upgrade surface performance"
          heading="Which surfaces drive paywall → click → activation"
        />
        <DataTable
          headers={[
            "Surface",
            "Paywalls shown",
            "Upgrade clicks",
            "Pro activations",
            "CTR (click / paywall)",
            "CVR (activate / paywall)",
          ]}
          rows={data.upgradeSurfaces.map((row) => [
            { text: row.surface },
            { text: row.paywall_shown.toLocaleString() },
            { text: row.upgrade_clicked.toLocaleString() },
            { text: row.pro_activated.toLocaleString() },
            {
              text: row.ctr,
              accent: parseFloat(row.ctr) >= 30,
              muted: row.ctr === "—",
            },
            {
              text: row.cvr,
              accent: parseFloat(row.cvr) >= 10,
              muted: row.cvr === "—",
            },
          ])}
          emptyMessage="No paywall impression data yet. Will populate once paywall_shown events are logged."
        />
        <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
          Surface values come from the <code>upgrade_surface</code> field on
          paywall / checkout events. CTR = upgrade_clicked / paywall_shown.
          CVR = pro_activated / paywall_shown (cross-session, not same-session).
        </p>
      </section>
    </div>
  );
}
