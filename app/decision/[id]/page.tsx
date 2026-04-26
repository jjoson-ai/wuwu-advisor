import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { AskFollowUpForm } from "@/components/ask-follow-up-form";
import { DecisionLogForm } from "@/components/decision-log-form";
import { DecisionOutcomeForm } from "@/components/decision-outcome-form";
import {
  formatDecisionGuidanceForPage,
  formatStanceLabel,
} from "@/domain/decision/decision.formatter";
import {
  getDecisionLog,
  getOverdueDecisionLogs,
} from "@/domain/decision/decision-log.service";
import { highlightAstroTerms } from "@/domain/display/astro-terms";
import { splitDisplayParagraphs } from "@/domain/display/narrative-display";
import { createNumerologyMentionFormatter } from "@/domain/display/numerology-mentions";
import { getConversationDataForUser } from "@/domain/decision/decision.service";
import {
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import { getCurrentUser } from "@/lib/auth";
import { getServerAccessState } from "@/lib/debug-access";

export const metadata: Metadata = {
  title: "Ask",
};

const FREE_FOLLOW_UP_LIMIT = 1;

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

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();

  if (user === null) {
    redirect("/login");
  }

  const record = await getOnboardingRecord(user.id);

  if (isOnboardingComplete(record) === false) {
    redirect("/onboarding");
  }

  const { id: conversationId } = await params;
  const conversationData = await getConversationDataForUser(
    user.id,
    conversationId,
  );

  if (conversationData === null) {
    notFound();
  }

  const access = await getServerAccessState(user);
  const { initialGuidance, turns } = conversationData;
  const guidance = formatDecisionGuidanceForPage(initialGuidance);
  const formatNumerologyMention = createNumerologyMentionFormatter();

  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const suggestedFollowups = lastTurn?.suggested_followups ?? [];
  const atTurnLimit = turns.length >= 10;

  // Decision log for this guidance — null if the migration hasn't run yet
  // (getDecisionLog returns null silently on schema errors, but throws on
  // other errors so we catch here to not break the page).
  const decisionLog = await getDecisionLog(user.id, initialGuidance.id).catch(
    () => null,
  );

  // Today in local ISO date for overdue check. We default to UTC here;
  // the component can refine on the client if needed.
  const todayIso = new Date().toISOString().slice(0, 10);
  const logIsOverdue =
    decisionLog !== null &&
    decisionLog.outcome === null &&
    decisionLog.revisit_at <= todayIso;

  return (
    <div className="stack">
      <section className="card page-hero">
        <div className="page-hero-grid">
          <Link href="/decision" className="page-kicker" style={{ color: "inherit", textDecoration: "none" }}>
            ← Ask
          </Link>
          <h1 className="page-title" style={{ fontSize: "1.25rem", fontWeight: 500 }}>
            {guidance.question}
          </h1>
        </div>

        <div className="page-meta">
          <span className="meta-pill">
            {new Date(guidance.created_at).toLocaleDateString()}
          </span>
          <span className="meta-pill">Confidence {guidance.confidence}</span>
          {turns.length > 0 ? (
            <span className="meta-pill">{turns.length} follow-up{turns.length !== 1 ? "s" : ""}</span>
          ) : null}
        </div>
      </section>

      <section className="card card-featured card-hero stack">
        <p className="card-eyebrow">Direct answer</p>
        <div className="answer-statement">
          <h2 className="card-title">{guidance.recommendation.headline}</h2>
          <span className="stance-pill">
            Stance: {formatStanceLabel(guidance.recommendation.stance)}
          </span>
        </div>
      </section>

      <div className="section-grid two-up">
        <div className="card card-feature card-muted stack">
          <p className="section-label">Why this is happening</p>
          <h2 className="section-heading-serif">{guidance.why_this_answer.headline}</h2>
          <div className="text-block">
            {renderParagraphs(guidance.why_this_answer.description, formatNumerologyMention)}
          </div>
        </div>

        <div className="card card-feature card-muted stack">
          <p className="section-label">What to do next</p>
          <h2 className="section-heading-serif">{guidance.timing_posture.headline}</h2>
          <div className="text-block">
            {renderParagraphs(guidance.timing_posture.description, formatNumerologyMention)}
          </div>
        </div>

        <div className="card card-feature stack">
          <p className="section-label">What matters most</p>
          <h2 className="section-heading-serif">{guidance.supporting_signals.headline}</h2>
          <ul className="signal-list">
            {guidance.supporting_signals.items.map((item) => (
              <li key={item}>
                {highlightAstroTerms(
                  formatNumerologyMention(item),
                  `support-${item.slice(0, 16)}`,
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="card card-feature stack">
          <p className="section-label">What to watch out for</p>
          <h2 className="section-heading-serif">{guidance.what_to_watch_out_for.headline}</h2>
          <ul className="signal-list">
            {guidance.what_to_watch_out_for.items.map((item) => (
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

      {turns.length > 0 ? (
        <div className="stack" style={{ gap: "0.75rem" }}>
          <p className="card-eyebrow" style={{ paddingLeft: "0.25rem" }}>
            Follow-up conversation
          </p>
          {turns.map((turn) => (
            <div key={turn.id} className="stack" style={{ gap: "0.5rem" }}>
              <div className="card card-muted" style={{ padding: "0.875rem 1rem" }}>
                <p className="card-eyebrow" style={{ marginBottom: "0.25rem" }}>You asked</p>
                <p style={{ margin: 0 }}>{turn.user_message}</p>
              </div>
              <div className="card card-featured stack">
                <p className="card-eyebrow">Response</p>
                <div className="text-block" style={{ maxWidth: "50rem" }}>
                  {turn.assistant_response
                    .split("\n\n")
                    .filter(Boolean)
                    .map((paragraph, i) => (
                      <p key={i} style={{ margin: 0 }}>
                        {paragraph}
                      </p>
                    ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Decision log / outcome follow-up */}
      {logIsOverdue && decisionLog !== null ? (
        <DecisionOutcomeForm
          log={decisionLog}
          questionText={initialGuidance.question_text}
        />
      ) : (
        <DecisionLogForm
          decisionGuidanceId={initialGuidance.id}
          existingLog={decisionLog}
        />
      )}

      <AskFollowUpForm
        conversationId={conversationId}
        canFollowUpUnlimited={access.featureAccess.canAskUnlimited}
        freeFollowUpsUsed={turns.length}
        freeFollowUpLimit={FREE_FOLLOW_UP_LIMIT}
        atTurnLimit={atTurnLimit}
        suggestedFollowups={suggestedFollowups}
      />
    </div>
  );
}
