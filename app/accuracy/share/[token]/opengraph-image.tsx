import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

import {
  formatRatePct,
  getAccuracyReportForUserAdmin,
  rankThemesByNetScore,
} from "@/domain/accuracy/accuracy.service";
import type { RatingThemeValue } from "@/domain/feedback/feedback.types";
import { getShareByToken } from "@/domain/accuracy/share.service";

// Standard OG image dimensions.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const THEME_LABELS: Record<RatingThemeValue, string> = {
  career: "Career",
  money: "Money",
  relationships: "Relationships",
  health: "Health",
  personal_growth: "Personal growth",
  timing: "Timing",
};

// Brand tokens (hardcoded — CSS vars aren't available in next/og).
const BG = "#f3efe8";
const CARD_BG = "#fffdf9";
const TEXT = "#191510";
const TEXT_MUTED = "#6f6558";
const ACCENT = "#27485e";
const HIT_GREEN = "#1f5d43";
const MISS_RED = "#c0392b";
const BORDER = "rgba(114, 94, 67, 0.16)";

type Props = {
  params: Promise<{ token: string }>;
};

export default async function OgImage({ params }: Props) {
  const { token } = await params;

  const share = await getShareByToken(token).catch(() => null);
  if (share === null) notFound();

  const report = await getAccuracyReportForUserAdmin(share.user_id).catch(
    () => null,
  );
  if (report === null) notFound();

  const snapshot = report.snapshot14d;
  const hasData = report.hasEnoughDataForHeadline;
  const rate = formatRatePct(snapshot.nailedItRate);

  // Pick top 3 hit themes (net > 0, touched at least once).
  const ranked = rankThemesByNetScore(snapshot.perTheme);
  const topHits = ranked
    .filter((e) => e.stats.netScore > 0 && e.stats.touchedCount > 0)
    .slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: BG,
          display: "flex",
          flexDirection: "column",
          padding: "64px",
          fontFamily: '"Segoe UI", "Helvetica Neue", sans-serif',
          position: "relative",
        }}
      >
        {/* Top badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "36px",
          }}
        >
          <div
            style={{
              background: ACCENT,
              color: "#fff",
              borderRadius: "999px",
              padding: "6px 18px",
              fontSize: "18px",
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}
          >
            wuwu
          </div>
          <span style={{ color: TEXT_MUTED, fontSize: "18px" }}>
            accuracy report
          </span>
        </div>

        {/* Main card */}
        <div
          style={{
            background: CARD_BG,
            borderRadius: "24px",
            padding: "52px 60px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            flex: 1,
            border: `1px solid ${BORDER}`,
          }}
        >
          {hasData ? (
            <>
              {/* Headline */}
              <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                <span style={{ fontSize: "72px", lineHeight: 1 }}>🎯</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div
                    style={{
                      fontSize: "68px",
                      fontWeight: 800,
                      color: TEXT,
                      lineHeight: 1,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {rate}
                  </div>
                  <div
                    style={{
                      fontSize: "26px",
                      color: TEXT_MUTED,
                      fontWeight: 400,
                    }}
                  >
                    nailed it · last 14 days · {snapshot.totalRatings} rating
                    {snapshot.totalRatings === 1 ? "" : "s"}
                  </div>
                </div>
              </div>

              {/* Emoji distribution bar */}
              <div
                style={{
                  display: "flex",
                  gap: "16px",
                  marginTop: "8px",
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
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        background: "#f2ece1",
                        borderRadius: "12px",
                        padding: "10px 20px",
                      }}
                    >
                      <span style={{ fontSize: "24px" }}>{icon}</span>
                      <span style={{ fontSize: "22px", color: TEXT_MUTED }}>
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Theme hits */}
              {topHits.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 600,
                      color: TEXT_MUTED,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    Lands best on
                  </div>
                  <div style={{ display: "flex", gap: "12px" }}>
                    {topHits.map((entry) => (
                      <div
                        key={entry.theme}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          background: "rgba(31, 93, 67, 0.10)",
                          border: `1px solid rgba(31, 93, 67, 0.20)`,
                          borderRadius: "999px",
                          padding: "8px 20px",
                          fontSize: "22px",
                          color: HIT_GREEN,
                          fontWeight: 600,
                        }}
                      >
                        {THEME_LABELS[entry.theme]}{" "}
                        <span
                          style={{
                            fontSize: "18px",
                            fontWeight: 400,
                            opacity: 0.7,
                          }}
                        >
                          +{entry.stats.netScore}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Not enough data state */}
              <div
                style={{
                  fontSize: "48px",
                  fontWeight: 700,
                  color: TEXT,
                  lineHeight: 1.1,
                }}
              >
                Still collecting ratings
              </div>
              <div
                style={{
                  fontSize: "26px",
                  color: TEXT_MUTED,
                }}
              >
                5+ ratings in 14 days unlocks the accuracy read.
              </div>
            </>
          )}
        </div>

        {/* Bottom tagline */}
        <div
          style={{
            marginTop: "24px",
            fontSize: "20px",
            color: TEXT_MUTED,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Rate your daily briefings with one tap.</span>
          <span style={{ color: ACCENT, fontWeight: 600 }}>
            wuwu.app
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
