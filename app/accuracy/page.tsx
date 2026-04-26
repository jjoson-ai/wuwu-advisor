import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatRatePct,
  getAccuracyReportForUser,
  rankThemesByNetScore,
  type AccuracySnapshot,
} from "@/domain/accuracy/accuracy.service";
import type { RatingThemeValue } from "@/domain/feedback/feedback.types";
import { AccuracyShareButton } from "@/components/accuracy-share-button";
import { getCurrentUser, isAgeVerified } from "@/lib/auth";
import { getServerAccessState } from "@/lib/debug-access";
import { getRequestPlatform } from "@/lib/product-events";
import { logProductEvent } from "@/lib/product-events.server";

export const metadata: Metadata = {
  title: "Your accuracy",
};

const THEME_LABELS: Record<RatingThemeValue, string> = {
  career: "Career",
  money: "Money",
  relationships: "Relationships",
  health: "Health",
  personal_growth: "Personal growth",
  timing: "Timing window",
};

/**
 * 5.2 Phase B — per-user Accuracy Report.
 *
 * Shows the user's own nailed-it rate and per-theme hit/miss breakdown over
 * 14-day and 30-day windows. Reads only the new emoji-rating columns.
 *
 * Gated behind 5 ratings in the 14-day window to keep the headline number
 * from being noisy. Below that we show a low-data coach state.
 */
export default async function AccuracyPage() {
  const user = await getCurrentUser();

  if (user === null) {
    redirect("/login?next=/accuracy");
  }

  if (!isAgeVerified(user)) {
    redirect("/age-gate?next=/accuracy");
  }

  const report = await getAccuracyReportForUser(user.id);

  // Fire the "viewed" event so /ops can track engagement with the report
  // independently of ratings submitted. Best-effort — never throw here.
  try {
    // Server pages don't have the request object directly, but for this
    // funnel-counting use we don't need mobile/web split (the page is only
    // reachable on web for now). Pin platform to "web".
    const access = await getServerAccessState(user);
    await logProductEvent({
      event_name: "accuracy_report_viewed",
      timestamp: new Date().toISOString(),
      user_id: user.id,
      tier: access.accessLevel,
      // getRequestPlatform needs a Request; pages/Next app-router doesn't pass
      // one to server components. Fall back to "web" which is accurate here.
      platform: "web",
      feature: "today",
      plan_type: access.accessLevel === "free" ? "free" : "pro",
      upgrade_surface: null,
      request_id: null,
      final_model_selected: null,
      generation_path: null,
      fallback_triggered: null,
      request_cost_estimate_usd: null,
      request_cost_is_estimated: null,
      is_first_use: null,
      repeat_within_24h: null,
    });
    // Silence the unused-import lint by referencing getRequestPlatform. We
    // keep it imported so a future mobile route can swap in the real platform.
    void getRequestPlatform;
  } catch (error) {
    console.error("[accuracy_report_viewed_log_failed]", error);
  }

  return (
    <div className="stack" style={{ gap: "1.5rem" }}>
      <section className="card card-featured card-hero stack">
        <p className="card-eyebrow" style={{ margin: 0 }}>
          Calibration
        </p>
        <h1 className="page-title" style={{ margin: 0 }}>
          Your accuracy
        </h1>
        <p className="page-intro" style={{ margin: 0 }}>
          How often your daily briefings have landed, and which themes hit or
          miss for you. Built from your 🎯 / 🌫️ / 🙃 ratings — nothing else.
        </p>
        <p className="muted" style={{ margin: 0 }}>
          <Link href="/dashboard">← Back to today</Link>
        </p>
      </section>

      {report.hasEnoughDataForHeadline === false ? (
        <LowDataCoachCard message={report.lowDataMessage ?? ""} />
      ) : (
        <>
          <HeadlineCard snapshot={report.snapshot14d} />
          <ShareCard />
        </>
      )}

      <WindowSection
        label="Last 14 days"
        snapshot={report.snapshot14d}
        hasEnoughData={report.hasEnoughDataForHeadline}
      />

      <WindowSection
        label="Last 30 days"
        snapshot={report.snapshot30d}
        hasEnoughData={report.snapshot30d.totalRatings >= 5}
      />

      <FooterNote totalLifetimeRatings={report.snapshot30d.totalRatings} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function LowDataCoachCard({ message }: { message: string }) {
  return (
    <section className="card card-state card-state--stale stack">
      <p className="card-eyebrow" style={{ margin: 0 }}>
        Not enough data yet
      </p>
      <h2 className="section-heading-serif" style={{ margin: 0 }}>
        A few more ratings and this page lights up
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        {message}
      </p>
      <p className="muted" style={{ margin: 0 }}>
        Rating takes one tap at the bottom of any Today briefing. The more
        days you rate, the sharper this page gets — and the sharper future
        briefings will get for you specifically.
      </p>
      <Link className="button" href="/dashboard">
        Rate today's briefing
      </Link>
    </section>
  );
}

function HeadlineCard({ snapshot }: { snapshot: AccuracySnapshot }) {
  const rate = formatRatePct(snapshot.nailedItRate);
  return (
    <section className="card card-featured stack">
      <p className="card-eyebrow" style={{ margin: 0 }}>
        Last 14 days
      </p>
      <h2 className="section-heading-serif" style={{ margin: 0 }}>
        Wuwu nailed it for you {rate} of the time
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        Based on {snapshot.totalRatings} rating
        {snapshot.totalRatings === 1 ? "" : "s"} in the last two weeks.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "0.75rem",
        }}
      >
        <EmojiDistributionCard
          icon="🎯"
          label="Nailed it"
          count={snapshot.nailedItCount}
          total={snapshot.totalRatings}
        />
        <EmojiDistributionCard
          icon="🌫️"
          label="Vague"
          count={snapshot.vagueCount}
          total={snapshot.totalRatings}
        />
        <EmojiDistributionCard
          icon="🙃"
          label="Off"
          count={snapshot.offCount}
          total={snapshot.totalRatings}
        />
      </div>
    </section>
  );
}

function EmojiDistributionCard({
  icon,
  label,
  count,
  total,
}: {
  icon: string;
  label: string;
  count: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div className="card card-muted stack" style={{ gap: "0.35rem" }}>
      <div style={{ fontSize: "1.4rem", lineHeight: 1 }}>{icon}</div>
      <p className="card-eyebrow" style={{ margin: 0 }}>
        {label}
      </p>
      <p style={{ margin: 0, fontWeight: 700, fontSize: "1.1rem" }}>
        {count} · {pct}%
      </p>
    </div>
  );
}

function WindowSection({
  label,
  snapshot,
  hasEnoughData,
}: {
  label: string;
  snapshot: AccuracySnapshot;
  hasEnoughData: boolean;
}) {
  const ranked = rankThemesByNetScore(snapshot.perTheme);
  const anyTouched = ranked.some((entry) => entry.stats.touchedCount > 0);

  return (
    <section className="stack">
      <div className="stack" style={{ gap: "0.3rem" }}>
        <p className="card-eyebrow" style={{ margin: 0 }}>
          {label}
        </p>
        <h2 className="section-heading-serif" style={{ margin: 0 }}>
          Per-theme hit / miss
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Themes ranked by net score (hits minus misses). An untagged theme on
          any given day doesn't count — only rows where you flagged it as
          hitting or missing show up here.
        </p>
      </div>

      {hasEnoughData === false ? (
        <div className="card card-muted">
          <p className="muted" style={{ margin: 0 }}>
            Still collecting data for this window (
            {snapshot.totalRatings} rating
            {snapshot.totalRatings === 1 ? "" : "s"}).
          </p>
        </div>
      ) : anyTouched === false ? (
        <div className="card card-muted">
          <p className="muted" style={{ margin: 0 }}>
            You haven't tagged any per-theme hits or misses yet — rating
            options below each emoji.
          </p>
        </div>
      ) : (
        <div className="card card-feature" style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {["Theme", "Hit", "Miss", "Net"].map((header) => (
                  <th
                    key={header}
                    style={{
                      borderBottom: "1px solid rgba(111, 90, 67, 0.16)",
                      fontSize: "0.8rem",
                      letterSpacing: "0.08em",
                      padding: "0 0 0.85rem",
                      textAlign: header === "Theme" ? "left" : "right",
                      textTransform: "uppercase",
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((entry, index) => {
                const { stats } = entry;
                const net = stats.netScore;
                const netColor =
                  net > 0 ? "#1f5d43" : net < 0 ? "#c0392b" : "inherit";
                return (
                  <tr key={entry.theme}>
                    <td
                      style={{
                        borderBottom:
                          index === ranked.length - 1
                            ? "none"
                            : "1px solid rgba(111, 90, 67, 0.1)",
                        padding: "0.9rem 0",
                      }}
                    >
                      {THEME_LABELS[entry.theme]}
                    </td>
                    <td
                      style={{
                        borderBottom:
                          index === ranked.length - 1
                            ? "none"
                            : "1px solid rgba(111, 90, 67, 0.1)",
                        padding: "0.9rem 0",
                        textAlign: "right",
                      }}
                    >
                      {stats.hitCount}
                    </td>
                    <td
                      style={{
                        borderBottom:
                          index === ranked.length - 1
                            ? "none"
                            : "1px solid rgba(111, 90, 67, 0.1)",
                        padding: "0.9rem 0",
                        textAlign: "right",
                      }}
                    >
                      {stats.missCount}
                    </td>
                    <td
                      style={{
                        borderBottom:
                          index === ranked.length - 1
                            ? "none"
                            : "1px solid rgba(111, 90, 67, 0.1)",
                        padding: "0.9rem 0",
                        textAlign: "right",
                        color: netColor,
                        fontWeight: 600,
                      }}
                    >
                      {net > 0 ? `+${net}` : `${net}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ShareCard() {
  return (
    <section className="card stack">
      <div className="stack" style={{ gap: "0.3rem" }}>
        <p className="card-eyebrow" style={{ margin: 0 }}>
          Share
        </p>
        <h2 className="section-heading-serif" style={{ margin: 0 }}>
          Show off your read
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Creates a public link with your nailed-it rate and theme breakdown.
          No name is attached to it — just the numbers.
        </p>
      </div>
      <AccuracyShareButton />
    </section>
  );
}

function FooterNote({
  totalLifetimeRatings,
}: {
  totalLifetimeRatings: number;
}) {
  return (
    <section className="stack" style={{ gap: "0.3rem" }}>
      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
        Based on your ratings in the last 30 days (
        {totalLifetimeRatings} total). Legacy 1–5 ratings from before the
        accuracy loop launched are not included — the scales aren't
        comparable.
      </p>
      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
        The more you rate, the more this page — and future briefings — tune
        to your actual life.
      </p>
    </section>
  );
}
