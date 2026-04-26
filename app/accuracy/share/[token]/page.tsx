import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  formatRatePct,
  getAccuracyReportForUserAdmin,
  rankThemesByNetScore,
  type AccuracySnapshot,
} from "@/domain/accuracy/accuracy.service";
import type { RatingThemeValue } from "@/domain/feedback/feedback.types";
import { getShareByToken } from "@/domain/accuracy/share.service";

const THEME_LABELS: Record<RatingThemeValue, string> = {
  career: "Career",
  money: "Money",
  relationships: "Relationships",
  health: "Health",
  personal_growth: "Personal growth",
  timing: "Timing window",
};

type Props = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const share = await getShareByToken(token).catch(() => null);
  if (share === null) {
    return { title: "Accuracy report not found" };
  }

  const report = await getAccuracyReportForUserAdmin(share.user_id).catch(
    () => null,
  );
  const rate =
    report?.hasEnoughDataForHeadline === true
      ? formatRatePct(report.snapshot14d.nailedItRate)
      : null;

  return {
    title: rate !== null ? `Wuwu accuracy: ${rate} nailed it` : "Wuwu accuracy",
    description:
      "See how accurately Wuwu's daily briefings match real life — and try it for yourself.",
    openGraph: {
      images: [`/accuracy/share/${token}/opengraph-image`],
    },
  };
}

export default async function SharedAccuracyPage({ params }: Props) {
  const { token } = await params;

  const share = await getShareByToken(token).catch(() => null);
  if (share === null) notFound();

  const report = await getAccuracyReportForUserAdmin(share.user_id).catch(
    () => null,
  );
  if (report === null) notFound();

  return (
    <div className="stack" style={{ gap: "1.5rem" }}>
      <section className="card card-featured card-hero stack">
        <p className="card-eyebrow" style={{ margin: 0 }}>
          Shared accuracy read
        </p>
        <h1 className="page-title" style={{ margin: 0 }}>
          Their briefing record
        </h1>
        <p className="page-intro" style={{ margin: 0 }}>
          Built from 🎯 / 🌫️ / 🙃 ratings on daily briefings — nothing
          else.
        </p>
        <p className="muted" style={{ margin: 0 }}>
          <Link href="/dashboard">Try it for yourself →</Link>
        </p>
      </section>

      {report.hasEnoughDataForHeadline === false ? (
        <section className="card card-muted stack">
          <p className="muted" style={{ margin: 0 }}>
            Not enough ratings yet to show a headline number.
          </p>
        </section>
      ) : (
        <SharedHeadlineCard snapshot={report.snapshot14d} />
      )}

      {report.hasEnoughDataForHeadline && (
        <SharedThemeSection snapshot={report.snapshot14d} />
      )}

      <SignUpCta />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SharedHeadlineCard({ snapshot }: { snapshot: AccuracySnapshot }) {
  const rate = formatRatePct(snapshot.nailedItRate);
  return (
    <section className="card card-featured stack">
      <p className="card-eyebrow" style={{ margin: 0 }}>
        Last 14 days
      </p>
      <h2 className="section-heading-serif" style={{ margin: 0 }}>
        Wuwu nailed it {rate} of the time for them
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
        {(
          [
            { icon: "🎯", label: "Nailed it", count: snapshot.nailedItCount },
            { icon: "🌫️", label: "Vague", count: snapshot.vagueCount },
            { icon: "🙃", label: "Off", count: snapshot.offCount },
          ] as const
        ).map(({ icon, label, count }) => {
          const pct =
            snapshot.totalRatings === 0
              ? 0
              : Math.round((count / snapshot.totalRatings) * 100);
          return (
            <div
              key={label}
              className="card card-muted stack"
              style={{ gap: "0.35rem" }}
            >
              <div style={{ fontSize: "1.4rem", lineHeight: 1 }}>{icon}</div>
              <p className="card-eyebrow" style={{ margin: 0 }}>
                {label}
              </p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "1.1rem" }}>
                {count} · {pct}%
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SharedThemeSection({ snapshot }: { snapshot: AccuracySnapshot }) {
  const ranked = rankThemesByNetScore(snapshot.perTheme);
  const anyTouched = ranked.some((entry) => entry.stats.touchedCount > 0);

  if (!anyTouched) return null;

  return (
    <section className="stack">
      <div className="stack" style={{ gap: "0.3rem" }}>
        <p className="card-eyebrow" style={{ margin: 0 }}>
          Last 14 days
        </p>
        <h2 className="section-heading-serif" style={{ margin: 0 }}>
          Per-theme hit / miss
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Themes ranked by net score (hits minus misses).
        </p>
      </div>
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
              const isLast = index === ranked.length - 1;
              const border = isLast
                ? "none"
                : "1px solid rgba(111, 90, 67, 0.1)";
              return (
                <tr key={entry.theme}>
                  <td style={{ borderBottom: border, padding: "0.9rem 0" }}>
                    {THEME_LABELS[entry.theme]}
                  </td>
                  <td
                    style={{
                      borderBottom: border,
                      padding: "0.9rem 0",
                      textAlign: "right",
                    }}
                  >
                    {stats.hitCount}
                  </td>
                  <td
                    style={{
                      borderBottom: border,
                      padding: "0.9rem 0",
                      textAlign: "right",
                    }}
                  >
                    {stats.missCount}
                  </td>
                  <td
                    style={{
                      borderBottom: border,
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
    </section>
  );
}

function SignUpCta() {
  return (
    <section className="card card-featured stack">
      <p className="card-eyebrow" style={{ margin: 0 }}>
        Get your own read
      </p>
      <h2 className="section-heading-serif" style={{ margin: 0 }}>
        See how accurate Wuwu is for you
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        Rate your daily briefings with one tap. After 14 days you get a
        personal accuracy report — and briefings start tuning to your actual
        life.
      </p>
      <Link className="button" href="/login">
        Start free →
      </Link>
    </section>
  );
}
