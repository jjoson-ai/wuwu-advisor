import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView as SafeAreaContextView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  fetchAskHome,
  generateAsk,
  mobileAskQueryKey,
  submitAskFeedback,
} from "@/api/ask";
import { DebugAccessBanner } from "@/components/debug-access-banner";
import { GenerationLoadingState } from "@/components/generation-loading-state";
import { MessageIcon } from "@/components/icons";
import { StructuredCopy } from "@/components/structured-copy";
import { useAuthGateState } from "@/hooks/use-auth-gate";
import { isArtifactStaleForCurrentAccess } from "@/lib/access";
import { createNumerologyMentionFormatter } from "@/lib/numerology-mentions";
import { trackProductEvent } from "@/lib/product-events";
import { startProCheckout } from "@/lib/pro-checkout";
import {
  getUsageCount as getDailyUsageCount,
  incrementUsageCount,
} from "@/lib/usage-limits";
import { appUi } from "@/theme/app-ui";
import { brandColors, brandRadii, brandSpacing } from "@/theme/brand";
import type {
  ActedOnValue,
  DecisionGuidanceFeedback,
  DecisionSafetyResponse,
  FormattedDecisionGuidance,
} from "@/types/api";

const FEEDBACK_OPTIONS: Array<{ value: ActedOnValue; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "partial", label: "Partly" },
  { value: "no", label: "No" },
];

function formatTimestamp(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type AskFeedbackCardProps = {
  guidanceId: string;
  feedback: DecisionGuidanceFeedback | null;
  isSaving: boolean;
  onSave: (input: {
    usefulnessScore: number;
    actedOn: ActedOnValue;
    note: string | null;
  }) => Promise<void>;
};

function AskFeedbackCard({
  guidanceId,
  feedback,
  isSaving,
  onSave,
}: AskFeedbackCardProps) {
  const [usefulnessScore, setUsefulnessScore] = useState<number>(
    feedback?.usefulness_score ?? 4,
  );
  const [actedOn, setActedOn] = useState<ActedOnValue>(
    feedback?.acted_on ?? "partial",
  );
  const [note, setNote] = useState(feedback?.note ?? "");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setUsefulnessScore(feedback?.usefulness_score ?? 4);
    setActedOn(feedback?.acted_on ?? "partial");
    setNote(feedback?.note ?? "");
  }, [feedback]);

  async function handleSave() {
    setStatus(null);

    try {
      await onSave({
        usefulnessScore,
        actedOn,
        note: note.trim() === "" ? null : note.trim(),
      });
      setStatus("Feedback saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save feedback.");
    }
  }

  return (
    <View style={styles.quietCard}>
      <Text style={styles.sectionLabel}>Reflection</Text>
      <Text style={styles.sectionTitle}>Your feedback</Text>
      <Text style={styles.supportingText}>
        Save feedback on the current Ask guidance only.
      </Text>

      <View style={styles.feedbackSection}>
        <Text style={styles.fieldLabel}>How useful was it?</Text>
        <View style={styles.scoreRow}>
          {[1, 2, 3, 4, 5].map((score) => (
            <Pressable
              key={score}
              onPress={() => setUsefulnessScore(score)}
              style={[
                styles.scoreButton,
                usefulnessScore === score && styles.scoreButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.scoreButtonText,
                  usefulnessScore === score && styles.scoreButtonTextActive,
                ]}
              >
                {score}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.feedbackSection}>
        <Text style={styles.fieldLabel}>Did you act on it?</Text>
        <View style={styles.segmentRow}>
          {FEEDBACK_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setActedOn(option.value)}
              style={[
                styles.segmentButton,
                actedOn === option.value && styles.segmentButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentButtonText,
                  actedOn === option.value && styles.segmentButtonTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.feedbackSection}>
        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput
          multiline
          onChangeText={setNote}
          placeholder="What landed or missed?"
          placeholderTextColor={brandColors.textSubtle}
          style={styles.textArea}
          value={note}
        />
      </View>

      <Pressable
        disabled={isSaving}
        onPress={() => {
          void handleSave();
        }}
        style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}
      >
        {isSaving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {feedback?.decision_guidance_id === guidanceId
              ? "Update feedback"
              : "Save feedback"}
          </Text>
        )}
      </Pressable>

      <Text style={styles.statusText}>{status ?? " "}</Text>
    </View>
  );
}

function QuestionCard({
  title,
  createdAt,
  confidence,
  question,
  formatText,
}: {
  title: string;
  createdAt: string;
  confidence: string;
  question: string;
  formatText: (text: string) => string;
}) {
  return (
    <View style={styles.quietCard}>
      <Text style={styles.metaText}>
        Saved {formatTimestamp(createdAt)} · Confidence {titleCase(confidence)}
      </Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <StructuredCopy text={question} textStyle={styles.primaryText} formatText={formatText} />
    </View>
  );
}

function RecommendationCard({
  headline,
  stance,
  formatText,
}: {
  headline: string;
  stance: string;
  formatText: (text: string) => string;
}) {
  return (
    <View style={styles.heroCard}>
      <Text style={styles.sectionLabel}>Direct guidance</Text>
      <Text style={styles.sectionTitle}>Direct answer</Text>
      <View style={styles.stancePill}>
        <Text style={styles.stancePillText}>
          {titleCase(stance.replace("_", " "))}
        </Text>
      </View>
      <StructuredCopy text={headline} textStyle={styles.primaryText} formatText={formatText} />
    </View>
  );
}

function ExplanationCard({
  title,
  supporting,
  description,
  formatText,
}: {
  title: string;
  supporting?: string;
  description: string;
  formatText: (text: string) => string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>Context</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      {supporting ? <Text style={styles.supportingLabel}>{supporting}</Text> : null}
      <StructuredCopy text={description} textStyle={styles.bodyText} formatText={formatText} />
    </View>
  );
}

function GuidanceSections({
  guidance,
  includeFeedback,
  feedback,
  isSavingFeedback,
  onSaveFeedback,
  formatText,
}: {
  guidance: FormattedDecisionGuidance;
  includeFeedback: boolean;
  feedback: DecisionGuidanceFeedback | null;
  isSavingFeedback: boolean;
  onSaveFeedback: (input: {
    usefulnessScore: number;
    actedOn: ActedOnValue;
    note: string | null;
  }) => Promise<void>;
  formatText: (text: string) => string;
}) {
  return (
    <>
      <QuestionCard
        title="Current question"
        createdAt={guidance.created_at}
        confidence={guidance.confidence}
        question={guidance.question}
        formatText={formatText}
      />

      <RecommendationCard
        headline={guidance.recommendation.headline}
        stance={guidance.recommendation.stance}
        formatText={formatText}
      />

      <ExplanationCard
        title="Why this is happening"
        supporting={guidance.why_this_answer.headline}
        description={guidance.why_this_answer.description}
        formatText={formatText}
      />

      <ExplanationCard
        title="What to do next"
        supporting={guidance.timing_posture.headline}
        description={guidance.timing_posture.description}
        formatText={formatText}
      />

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Signals</Text>
        <Text style={styles.sectionTitle}>What matters most</Text>
        <Text style={styles.supportingLabel}>{guidance.supporting_signals.headline}</Text>
        <View style={styles.listBlock}>
          {guidance.supporting_signals.items.map((item) => (
            <Text key={item} style={styles.bodyText}>
              • {formatText(item)}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Risk</Text>
        <Text style={styles.sectionTitle}>What to watch out for</Text>
        <Text style={styles.supportingLabel}>
          {guidance.what_to_watch_out_for.headline}
        </Text>
        <View style={styles.listBlock}>
          {guidance.what_to_watch_out_for.items.map((item) => (
            <Text key={item} style={styles.bodyText}>
              • {formatText(item)}
            </Text>
          ))}
        </View>
      </View>

      {includeFeedback ? (
        <AskFeedbackCard
          feedback={feedback}
          guidanceId={guidance.id}
          isSaving={isSavingFeedback}
          onSave={onSaveFeedback}
        />
      ) : null}
    </>
  );
}

function SafetyCard({
  question,
  safety,
  formatText,
}: {
  question: string;
  safety: DecisionSafetyResponse;
  formatText: (text: string) => string;
}) {
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Question</Text>
        <Text style={styles.sectionTitle}>Current question</Text>
        <Text style={styles.bodyText}>{formatText(question)}</Text>
      </View>
      <View style={[styles.card, styles.safetyCard]}>
        <Text style={styles.sectionLabel}>Safety</Text>
        <Text style={styles.sectionTitle}>{safety.headline}</Text>
        <StructuredCopy text={safety.message} textStyle={styles.bodyText} formatText={formatText} />
        <Text style={styles.safetyActionLabel}>Do this now</Text>
        <StructuredCopy
          text={safety.urgent_action}
          textStyle={styles.primaryText}
          formatText={formatText}
        />
        <View style={styles.listBlock}>
          {safety.resources.map((resource) => (
            <Text key={resource} style={styles.bodyText}>
              • {formatText(resource)}
            </Text>
          ))}
        </View>
      </View>
    </>
  );
}

export function AskScreenContent() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { accessLevel, dailyUsageLimits, featureAccess, user } =
    useAuthGateState();
  const [question, setQuestion] = useState("");
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [activeSafety, setActiveSafety] = useState<{
    question: string;
    response: DecisionSafetyResponse;
  } | null>(null);

  const askQuery = useQuery({
    queryKey: mobileAskQueryKey(user?.id),
    queryFn: fetchAskHome,
  });
  const submitMutation = useMutation({
    mutationFn: generateAsk,
  });
  const feedbackMutation = useMutation({
    mutationFn: submitAskFeedback,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mobileAskQueryKey(user?.id),
      });
    },
  });

  const latest = askQuery.data?.latest ?? null;
  const formatNumerologyMention = createNumerologyMentionFormatter();
  const latestFeedback = askQuery.data?.latestFeedback ?? null;
  const recent = askQuery.data?.recent ?? [];
  const guidanceNeedsRegeneration =
    latest !== null &&
    isArtifactStaleForCurrentAccess(
      accessLevel,
      latest.generation_access_level,
    );
  const queryError = askQuery.error instanceof Error ? askQuery.error.message : null;
  const topStatus = useMemo(() => {
    return submitStatus;
  }, [submitStatus]);

  async function handleSubmitQuestion() {
    const trimmed = question.trim();

    if (trimmed === "") {
      setSubmitStatus("Enter a question first.");
      return;
    }

    if (
      featureAccess.canAskUnlimited === false &&
      dailyUsageLimits.askQuestionsPerDay !== null &&
      user?.id
    ) {
      const questionCount = await getDailyUsageCount("ask", user.id);

      if (questionCount >= dailyUsageLimits.askQuestionsPerDay) {
        setShowUpgradePrompt(true);
        setSubmitStatus("Unlock unlimited Guidance for your next decisions.");
        setActiveSafety(null);
        void trackProductEvent(
          {
            event_name: "paywall_shown",
            feature: "ask",
            plan_type: "pro",
            upgrade_surface: "ask_usage_limit",
          },
          { onceKey: "paywall:ask:ask_usage_limit" },
        );
        return;
      }
    }

    setShowUpgradePrompt(false);
    setSubmitStatus(null);

    try {
      const response = await submitMutation.mutateAsync({ question: trimmed });

      if (
        featureAccess.canAskUnlimited === false &&
        dailyUsageLimits.askQuestionsPerDay !== null &&
        user?.id
      ) {
        await incrementUsageCount("ask", user.id);
      }

      if ("safety" in response) {
        setActiveSafety({
          question: trimmed,
          response: response.safety,
        });
        return;
      }

      setActiveSafety(null);
      setQuestion("");
      await queryClient.invalidateQueries({
        queryKey: mobileAskQueryKey(user?.id),
      });
    } catch (error) {
      setSubmitStatus(
        error instanceof Error ? error.message : "Unable to generate Ask guidance.",
      );
    }
  }

  async function handleSaveFeedback(input: {
    usefulnessScore: number;
    actedOn: ActedOnValue;
    note: string | null;
  }) {
    if (latest === null) {
      throw new Error("Ask a question before saving feedback.");
    }

    await feedbackMutation.mutateAsync({
      decisionGuidanceId: latest.id,
      usefulnessScore: input.usefulnessScore,
      actedOn: input.actedOn,
      note: input.note,
    });
  }

  const visibleRecent = latest === null
    ? recent
    : recent.filter((item) => item.id !== latest.id);

  return (
    <SafeAreaContextView edges={["top", "bottom"]} style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroCard}>
            <View style={appUi.pageHeroKickerRow}>
              <View style={appUi.pageHeroIcon}>
                <MessageIcon size={20} />
              </View>
              <Text style={styles.pageEyebrow}>Private guidance</Text>
            </View>
            <Text style={styles.pageTitle}>Ask</Text>
            <Text style={styles.pageSubtitle}>
              Get grounded Guidance on timing, choices, next steps, or a
              difficult conversation.
            </Text>
            <DebugAccessBanner accessLevel={accessLevel} />
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.sectionLabel}>Question intake</Text>
            <Text style={styles.sectionTitle}>Ask a question</Text>
            <Text style={styles.supportingText}>
              Keep it concrete. One decision, one timing window, one conversation.
            </Text>
            <TextInput
              multiline
              onChangeText={setQuestion}
              placeholder="What do you need help deciding?"
              placeholderTextColor={brandColors.textSubtle}
              style={styles.questionInput}
              value={question}
            />
            <Pressable
              disabled={submitMutation.isPending}
              onPress={() => {
                void handleSubmitQuestion();
              }}
              style={[
                styles.primaryButton,
                submitMutation.isPending && styles.primaryButtonDisabled,
              ]}
            >
              {submitMutation.isPending ? (
                <Text style={styles.primaryButtonText}>Working...</Text>
              ) : (
                <Text style={styles.primaryButtonText}>Get guidance</Text>
              )}
            </Pressable>
            {submitMutation.isPending || askQuery.isRefetching ? (
              <GenerationLoadingState
                compact
                stages={["Weighing your question", "Shaping your guidance"]}
              />
            ) : null}
            <Text style={styles.statusText}>{queryError ?? topStatus ?? " "}</Text>
            {showUpgradePrompt ? (
              <Pressable
                onPress={() => {
                  void (async () => {
                    await trackProductEvent({
                      event_name: "upgrade_clicked",
                      feature: "ask",
                      plan_type: "pro",
                      upgrade_surface: "ask_usage_limit",
                    });

                    await startProCheckout({
                      feature: "ask",
                      upgradeSurface: "ask_usage_limit",
                    });
                  })();
                }}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Start 7-day free trial</Text>
              </Pressable>
            ) : null}
          </View>

          {askQuery.isPending && latest === null && activeSafety === null ? (
            <View style={styles.card}>
              <GenerationLoadingState
                stages={["Weighing your question", "Shaping your guidance"]}
              />
            </View>
          ) : null}

          {activeSafety ? (
            <SafetyCard
              question={activeSafety.question}
              safety={activeSafety.response}
              formatText={formatNumerologyMention}
            />
          ) : latest ? (
            <>
              {guidanceNeedsRegeneration ? (
            <View style={[styles.card, styles.staleCard]}>
                  <Text style={styles.sectionTitle}>Ask again for your current tier</Text>
                  <Text style={styles.supportingText}>
                    This Guidance was generated with free-tier context. Submit the
                    question again to use the fuller context available on your
                    current tier.
                  </Text>
                </View>
              ) : null}
              <GuidanceSections
                feedback={latestFeedback}
                guidance={latest}
                includeFeedback
                isSavingFeedback={feedbackMutation.isPending}
                onSaveFeedback={handleSaveFeedback}
                formatText={formatNumerologyMention}
              />
            </>
          ) : queryError ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Unable to load Ask</Text>
              <Text style={styles.supportingText}>{queryError}</Text>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Start here</Text>
              <Text style={styles.sectionTitle}>No guidance yet</Text>
              <Text style={styles.supportingText}>
                Ask one focused question to get clear Guidance on timing, next
                steps, or a difficult conversation.
              </Text>
              <Text style={styles.supportingLabel}>
                Try: “Should I send this proposal this week?” or “How do I handle
                this difficult conversation?”
              </Text>
            </View>
          )}

          {visibleRecent.length > 0 ? (
            <View style={styles.quietCard}>
              <Text style={styles.sectionLabel}>History</Text>
              <Text style={styles.sectionTitle}>Recent questions</Text>
              <Text style={styles.supportingText}>
                Earlier saved questions stay here so they do not compete with the
                current result.
              </Text>
              <View style={styles.listBlock}>
                {visibleRecent.map((item, index) => (
                  <Link
                    asChild
                    href={`/ask/${item.id}`}
                    key={item.id}
                  >
                    <Pressable
                      style={[
                        styles.recentQuestionLink,
                        index > 0 && styles.recentQuestionLinkBorder,
                      ]}
                    >
                      <Text style={styles.recentQuestionMeta}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                      <Text style={styles.recentQuestionText}>{item.question}</Text>
                    </Pressable>
                  </Link>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaContextView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brandColors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    gap: brandSpacing.section,
    paddingHorizontal: brandSpacing.screen,
  },
  heroCard: {
    ...appUi.heroCard,
  },
  pageEyebrow: {
    ...appUi.pageEyebrow,
  },
  pageTitle: {
    ...appUi.pageTitle,
  },
  pageSubtitle: {
    ...appUi.pageSubtitle,
  },
  card: {
    ...appUi.card,
  },
  quietCard: {
    ...appUi.quietCard,
  },
  safetyCard: {
    borderColor: brandColors.cautionBorder,
    borderWidth: 1,
    backgroundColor: brandColors.cautionBackground,
  },
  staleCard: {
    ...appUi.staleCard,
  },
  sectionTitle: {
    ...appUi.sectionTitle,
  },
  sectionLabel: {
    ...appUi.sectionLabel,
  },
  metaText: {
    ...appUi.metaText,
  },
  supportingText: {
    ...appUi.supportingText,
  },
  supportingLabel: {
    ...appUi.supportingLabel,
  },
  bodyText: {
    ...appUi.bodyText,
  },
  primaryText: {
    ...appUi.leadText,
  },
  stancePill: {
    ...appUi.pill,
  },
  stancePillText: {
    ...appUi.pillText,
  },
  listBlock: {
    ...appUi.listBlock,
  },
  questionInput: {
    ...appUi.textInput,
    minHeight: 104,
    textAlignVertical: "top",
  },
  primaryButton: {
    ...appUi.primaryButton,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    ...appUi.primaryButtonText,
  },
  secondaryButton: {
    ...appUi.secondaryButton,
  },
  secondaryButtonText: {
    ...appUi.secondaryButtonText,
  },
  statusText: {
    ...appUi.metaText,
    minHeight: 20,
  },
  feedbackSection: {
    gap: 8,
  },
  fieldLabel: {
    color: brandColors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  scoreRow: {
    flexDirection: "row",
    gap: 8,
  },
  scoreButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: brandRadii.pill,
    borderWidth: 1,
    borderColor: brandColors.border,
  },
  scoreButtonActive: {
    borderColor: brandColors.accent,
    backgroundColor: brandColors.accentSoft,
  },
  scoreButtonText: {
    color: brandColors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  scoreButtonTextActive: {
    color: brandColors.accent,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: brandRadii.control,
    paddingVertical: 12,
  },
  segmentButtonActive: {
    borderColor: brandColors.accent,
    backgroundColor: brandColors.accentSoft,
  },
  segmentButtonText: {
    color: brandColors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  segmentButtonTextActive: {
    color: brandColors.accent,
  },
  textArea: {
    ...appUi.textInput,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 108,
    textAlignVertical: "top",
  },
  safetyActionLabel: {
    ...appUi.sectionLabel,
    color: brandColors.text,
  },
  recentQuestionLink: {
    gap: 4,
    paddingTop: 4,
    paddingBottom: 2,
  },
  recentQuestionLinkBorder: {
    borderTopColor: brandColors.border,
    borderTopWidth: 1,
    paddingTop: 14,
  },
  recentQuestionMeta: {
    ...appUi.metaText,
    color: brandColors.textSubtle,
  },
  recentQuestionText: {
    ...appUi.bodyText,
    fontSize: 15,
    lineHeight: 23,
  },
});
