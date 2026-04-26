import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DecisionFeedbackForm } from "@/components/decision-feedback-form";
import { DecisionGuidanceForm } from "@/components/decision-guidance-form";
import { MessageIcon } from "@/components/icons";
import { getOverdueDecisionLogs } from "@/domain/decision/decision-log.service";
import { getFeedbackForDecisionGuidance } from "@/domain/decision/decision-feedback.service";
import {
  formatDecisionGuidanceForPage,
  formatStanceLabel,
} from "@/domain/decision/decision.formatter";
import { classifyDecisionSafety } from "@/domain/decision/decision.safety";
import { highlightAstroTerms } from "@/domain/display/astro-terms";
import { createNumerologyMentionFormatter } from "@/domain/display/numerology-mentions";
import { splitDisplayParagraphs } from "@/domain/display/narrative-display";
import {
  getDecisionGuidanceByIdForUser,
  getLatestDecisionGuidanceForUser,
  listRecentDecisionGuidanceForUser,
} from "@/domain/decision/decision.service";
import {
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import { getCurrentUser } from "@/lib/auth";
import { getServerAccessState } from "@/lib/debug-access";
import { isArtifactStaleForCurrentAccess } from "@/lib/access";

export const metadata: Metadata = {
  title: "Ask",
};

function renderParagraphs(text: string, formatText: (text: string) => string) {
  return splitDisplayParagraphs(formatText(text)).map((paragraph, index) => {
    const key = `${paragraph.slice(0, 24)}-${index}`;
    return (
      <p key={key} style={{ margin: 0 }}>
        {highlightAstroTerms(paragraph, key)}
      </p>
    );
  });
}

export default async function DecisionPage({
  searchParams,
}: {
  searchParams?: Promise<{ id?: string }>;
}) {
  const user = await getCurrentUser();

  if (user === null) {
    redirect("/login");
  }

  const record = await getOnboardingRecord(user.id);
  const access = await getServerAccessState(user);

  if (isOnboardingComplete(record) === false) {
    redirect("/onboarding");
  }

  const resolvedSearchParams = searchParams === undefined ? {} : await searchParams;
  const selectedId =
    typeof resolvedSearchParams.id === "string" && resolvedSearchParams.id.trim() !== ""
      ? resolvedSearchParams.id
      : null;

  const todayIso = new Date().toISOString().slice(0, 10);

  const [latestRow, recentRows, overdueFollowUps] = await Promise.all([
    getLatestDecisionGuidanceForUser(user.id),
    listRecentDecisionGuidanceForUser(user.id, 5),
    // Best-effort: if 008 migration hasn't been run, getOverdueDecisionLogs
    // returns [] silently. Never block the page.
    getOverdueDecisionLogs(user.id, todayIso).catch(() => []),
  ]);

  const selectedRow =
    selectedId === null
      ? latestRow
      : await getDecisionGuidanceByIdForUser(user.id, selectedId);
  const latest = selectedRow === null ? null : formatDecisionGuidanceForPage(selectedRow);
  const guidanceNeedsRegeneration =
    latest !== null &&
    isArtifactStaleForCurrentAccess(
      access.accessLevel,
      latest.generation_access_level,
    );
  const latestFeedback =
    selectedRow === null
      ? null
      : await getFeedbackForDecisionGuidance(user.id, selectedRow.id);
  const recent = recentRows
    .filter((row) => classifyDecisionSafety(row.question_text) === "normal")
    .map(formatDecisionGuidanceForPage);
  const formatNumerologyMention = createNumerologyMentionFormatter();
  const isViewingSaved =
    selectedId !== null && latestRow !== null && latestRow.id !== selectedId;

  return (
    <div className="stack">
      {/* Hero */}
      <section className="card page-hero">
        <div className="page-hero-grid">
          <div className="page-hero-kicker-row">
            <span className="page-hero-icon" aria-hidden>
              <MessageIcon size={22} />
            </span>
            <p className="page-kicker">Decision support</p>
          </div>
          <h1 className="page-title">Ask</h1>
          <p className="page-subtitle">
            Use one focused question to get a direct answer, the timing posture
            behind it, and the tradeoffs that matter most.
          </p>
        </div>

        <div className="page-meta">
          <span className="meta-pill">
            {access.featureAccess.canAskUnlimited ? "Pro" : "Free"} depth
          </span>
          <span className="meta-pill">
            {access.featureAccess.canAskUnlimited
              ? "Unlimited questions"
              : `${access.dailyUsageLimits.askQuestionsPerDay ?? 0}/day + 1 big decision/week`}
          </span>
        </div>
      </section>

      {/* Overdue follow-up banner */}
      {overdueFollowUps.length > 0 ? (
        <section className="card stack" style={{ background: "var(--surface-muted)" }}>
          <div className="stack" style={{ gap: "0.3rem" }}>
            <p className="card-eyebrow" style={{ margin: 0 }}>
              Check-back{overdueFollowUps.length > 1 ? "s" : ""}
            </p>
            <h2 style={{ margin: 0 }}>
              {overdueFollowUps.length === 1
                ? "How did that decision go?"
                : `${overdueFollowUps.length} decisions are ready for check-back`}
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              {overdueFollowUps.length === 1
                ? `You committed to: "${overdueFollowUps[0]!.committed_action}"`
                : "Tap a decision below to record how it went."}
            </p>
          </div>
          <div className="stack" style={{ gap: "0.5rem" }}>
            {overdueFollowUps.map((log) => (
              <Link
                key={log.id}
                href={`/decision/${log.decision_guidance_id}`}
                className="card card-muted"
                style={{ padding: "0.75rem 1rem", display: "block" }}
              >
                <p style={{ margin: 0, fontWeight: 500, fontSize: "0.95rem" }}>
                  {log.committed_action}
                </p>
                <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                  Due {new Date(log.revisit_at + "T12:00:00").toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })} · tap to record outcome →
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {latest === null ? (
        /* First time: form leads */
        <>
          <DecisionGuidanceForm
            askBigDecisionPerWeek={access.dailyUsageLimits.askBigDecisionPerWeek}
            askQuestionsPerDay={access.dailyUsageLimits.askQuestionsPerDay}
            canAskUnlimited={access.featureAccess.canAskUnlimited}
            userKey={user.id}
          />

          {selectedId !== null ? (
            <div className="card card-muted stack">
              <p className="card-eyebrow">Not found</p>
              <h2 className="card-title">That saved guidance isn&rsquo;t here</h2>
              <p className="card-subtitle">
                It may belong to a different account. Ask a new question above.
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {/* Tier 1: Answer first — question + direct answer + meta in one featured card */}
          {guidanceNeedsRegeneration ? (
            <div className="card card-state card-state--stale stack">
              <p className="card-eyebrow">Needs refresh</p>
              <h2 className="card-title">Ask again for your current tier</h2>
              <p className="card-subtitle">
                This Guidance was generated with free-tier context. Submit the
                question again to use the fuller context available on your current
                tier.
              </p>
            </div>
          ) : null}

          <section className="card card-featured card-hero stack">
            <div className="page-meta">
              <span className="meta-pill">
                {isViewingSaved ? "Saved question" : "Latest answer"}
              </span>
              <span className="meta-pill">
                {new Date(latest.created_at).toLocaleString()}
              </span>
              <span className="meta-pill">Confidence {latest.confidence}</span>
            </div>

            <div
              style={{
                borderLeft: "3px solid var(--accent-soft)",
                paddingLeft: "1rem",
                display: "grid",
                gap: "0.35rem",
              }}
            >
              <p className="card-eyebrow" style={{ margin: 0 }}>
                You asked
              </p>
              <p
                className="muted"
                style={{
                  margin: 0,
                  fontSize: "0.98rem",
                  lineHeight: 1.5,
                  fontStyle: "italic",
                }}
              >
                {highlightAstroTerms(
                  formatNumerologyMention(latest.question),
                  "decision-question",
                )}
              </p>
            </div>

            <div className="soft-divider" />

            <div className="answer-statement">
              <p className="card-eyebrow" style={{ margin: 0 }}>
                Direct answer
              </p>
              <h2 className="card-title">{latest.recommendation.headline}</h2>
              <span className="stance-pill">
                Stance: {formatStanceLabel(latest.recommendation.stance)}
              </span>
            </div>
          </section>

          {/* Tier 2: Why + What to do (the reasoning) */}
          <div className="section-grid two-up">
            <div className="card card-feature card-muted stack">
              <p className="card-eyebrow">Why this is happening</p>
              <h3 className="section-heading-serif">{latest.why_this_answer.headline}</h3>
              <div className="text-block">
                {renderParagraphs(
                  latest.why_this_answer.description,
                  formatNumerologyMention,
                )}
              </div>
            </div>

            <div className="card card-feature card-muted stack">
              <p className="card-eyebrow">What to do next</p>
              <h3 className="section-heading-serif">{latest.timing_posture.headline}</h3>
              <div className="text-block">
                {renderParagraphs(
                  latest.timing_posture.description,
                  formatNumerologyMention,
                )}
              </div>
            </div>
          </div>

          {/* Tier 3: Signals + Watch out (integrated into one card, internal split) */}
          <section className="card stack">
            <div className="section-grid two-up" style={{ gap: "1.5rem" }}>
              <div className="stack">
                <p className="card-eyebrow">What matters most</p>
                <p className="section-heading-serif">
                  {latest.supporting_signals.headline}
                </p>
                <ul className="signal-list">
                  {latest.supporting_signals.items.map((item) => (
                    <li key={item}>
                      {highlightAstroTerms(
                        formatNumerologyMention(item),
                        `support-${item.slice(0, 16)}`,
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="stack">
                <p className="card-eyebrow">Watch out for</p>
                <p className="section-heading-serif">
                  {latest.what_to_watch_out_for.headline}
                </p>
                <ul className="signal-list">
                  {latest.what_to_watch_out_for.items.map((item) => (
                    <li key={item}>
                      {highlightAstroTerms(
                        formatNumerologyMention(item),
                        `watch-${item.slice(0, 16)}`,
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <DecisionFeedbackForm
            decisionGuidanceId={latest.id}
            existingFeedback={latestFeedback}
          />

          {/* Form moved below the answer — "ask another question" */}
          <DecisionGuidanceForm
            askBigDecisionPerWeek={access.dailyUsageLimits.askBigDecisionPerWeek}
            askQuestionsPerDay={access.dailyUsageLimits.askQuestionsPerDay}
            canAskUnlimited={access.featureAccess.canAskUnlimited}
            userKey={user.id}
          />
        </>
      )}

      {recent.length <= 1 ? null : (
        <div className="card card-muted stack">
          <p className="card-eyebrow">Saved history</p>
          <h2 className="section-heading-serif">Recent questions</h2>
          <div className="list-links">
            {recent.map((item) => (
              <Link
                key={item.id}
                href={item.id === latest?.id ? "/decision" : `/decision?id=${item.id}`}
                className="list-link-row"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  opacity: item.id === latest?.id ? 1 : 0.92,
                }}
              >
                <span className="list-link-date">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
                <div className="list-link-copy" style={{ maxWidth: "36rem" }}>
                  <p className="list-link-title">{item.question}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
