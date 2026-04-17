import { type ReactNode, useEffect, useMemo, useState } from "react";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  fetchToday,
  generateToday,
  mobileTodayQueryKey,
  submitTodayFeedback,
} from "@/api/today";
import { DebugAccessBanner } from "@/components/debug-access-banner";
import { GenerationLoadingState } from "@/components/generation-loading-state";
import {
  BoltIcon,
  BriefcaseIcon,
  CoinsIcon,
  SparklesIcon,
  SunIcon,
  UsersIcon,
} from "@/components/icons";
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
  BriefingFeedback,
  FormattedTodayBriefing,
} from "@/types/api";

const FEEDBACK_OPTIONS: Array<{ value: ActedOnValue; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "partial", label: "Partly" },
  { value: "no", label: "No" },
];

function formatDisplayDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type TodayFeedbackCardProps = {
  briefingId: string;
  feedback: BriefingFeedback | null;
  isSaving: boolean;
  onSave: (input: {
    usefulnessScore: number;
    actedOn: ActedOnValue;
    note: string | null;
  }) => Promise<void>;
};

function TodayFeedbackCard({
  briefingId,
  feedback,
  isSaving,
  onSave,
}: TodayFeedbackCardProps) {
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
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Your feedback</Text>
      <Text style={styles.supportingText}>
        Save feedback on the current Today guidance only.
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
            {feedback?.briefing_id === briefingId ? "Update feedback" : "Save feedback"}
          </Text>
        )}
      </Pressable>

      <Text style={styles.statusText}>{status ?? " "}</Text>
    </View>
  );
}

type InsightCardProps = {
  title: string;
  supporting?: string;
  children: ReactNode;
  icon?: ReactNode;
};

function InsightCard({ title, supporting, children, icon }: InsightCardProps) {
  return (
    <View style={styles.card}>
      {icon ? (
        <View style={styles.insightHead}>
          <View style={appUi.pageHeroIcon}>{icon}</View>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      ) : (
        <Text style={styles.sectionTitle}>{title}</Text>
      )}
      {supporting ? <Text style={styles.supportingLabel}>{supporting}</Text> : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function ActionCard({
  title,
  primary,
  secondary,
  formatText,
}: {
  title: string;
  primary: string;
  secondary?: string;
  formatText: (text: string) => string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <StructuredCopy text={primary} textStyle={styles.primaryText} formatText={formatText} />
      {secondary ? (
        <StructuredCopy
          text={secondary}
          textStyle={styles.secondaryText}
          formatText={formatText}
        />
      ) : null}
    </View>
  );
}

function TimingCard({
  briefing,
  formatText,
}: {
  briefing: FormattedTodayBriefing;
  formatText: (text: string) => string;
}) {
  return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Best timing</Text>
        <View style={styles.timingStack}>
          <View style={styles.timingRowFirst}>
            <Text style={styles.listLabel}>Best window</Text>
            <StructuredCopy
              text={briefing.timing.best_window}
              textStyle={styles.primaryText}
              formatText={formatText}
            />
          </View>
          <View style={styles.timingRow}>
            <Text style={styles.listLabel}>Avoid window</Text>
          <StructuredCopy
            text={briefing.timing.avoid_window}
            textStyle={styles.primaryText}
            formatText={formatText}
          />
        </View>
      </View>
    </View>
  );
}

export function TodayScreenContent() {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { accessLevel, dailyUsageLimits, featureAccess, user } = useAuthGateState();
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const todayQuery = useQuery({
    queryKey: mobileTodayQueryKey(user?.id),
    queryFn: fetchToday,
  });
  const generateMutation = useMutation({
    mutationFn: generateToday,
  });
  const feedbackMutation = useMutation({
    mutationFn: submitTodayFeedback,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mobileTodayQueryKey(user?.id),
      });
    },
  });

  const briefing = todayQuery.data?.briefing ?? null;
  const feedback = todayQuery.data?.feedback ?? null;
  const formatNumerologyMention = createNumerologyMentionFormatter();
  const briefingNeedsRegeneration =
    briefing !== null &&
    isArtifactStaleForCurrentAccess(
      accessLevel,
      briefing.generation_access_level,
    );
  const headerDate = briefing ? formatDisplayDate(briefing.date) : "No Briefing yet";
  const confidenceLabel = briefing ? titleCase(briefing.confidence) : null;
  const isGenerating = generateMutation.isPending;
  const queryError =
    todayQuery.error instanceof Error ? todayQuery.error.message : null;
  const topStatus = useMemo(() => {
    if (generateMutation.error instanceof Error) {
      return generateMutation.error.message;
    }

    return submitStatus;
  }, [generateMutation.error, submitStatus]);

  async function handleGenerateBriefing() {
    if (
      briefing !== null &&
      featureAccess.canGenerateUnlimitedToday === false &&
      dailyUsageLimits.todayRefreshesPerDay !== null &&
      user?.id
    ) {
      const refreshCount = await getDailyUsageCount("today-refresh", user.id);

      if (refreshCount >= dailyUsageLimits.todayRefreshesPerDay) {
        setShowUpgradePrompt(true);
        setSubmitStatus("Unlock unlimited refreshes for sharper daily timing.");
        void trackProductEvent(
          {
            event_name: "paywall_shown",
            feature: "today",
            plan_type: "pro",
            upgrade_surface: "today_refresh_limit",
          },
          { onceKey: "paywall:today:today_refresh_limit" },
        );
        return;
      }
    }

    setSubmitStatus(null);
    setShowUpgradePrompt(false);

    try {
      await generateMutation.mutateAsync();
    } catch (error) {
      setSubmitStatus(
        error instanceof Error ? error.message : "Unable to generate Today.",
      );
      return;
    }

    if (
      briefing !== null &&
      featureAccess.canGenerateUnlimitedToday === false &&
      dailyUsageLimits.todayRefreshesPerDay !== null &&
      user?.id
    ) {
      await incrementUsageCount("today-refresh", user.id);
    }

    await queryClient.invalidateQueries({
      queryKey: mobileTodayQueryKey(user?.id),
    });
  }

  async function handleSaveFeedback(input: {
    usefulnessScore: number;
    actedOn: ActedOnValue;
    note: string | null;
  }) {
    if (briefing === null) {
      throw new Error("Generate Today before saving feedback.");
    }

    await feedbackMutation.mutateAsync({
      briefingId: briefing.id,
      usefulnessScore: input.usefulnessScore,
      actedOn: input.actedOn,
      note: input.note,
    });
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 28,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          <View style={appUi.pageHeroKickerRow}>
            <View style={appUi.pageHeroIcon}>
              <SunIcon size={20} />
            </View>
            <Text style={styles.pageEyebrow}>Daily briefing</Text>
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.pageTitle}>Today</Text>
            <Text style={styles.pageSubtitle}>
              Your daily Briefing on timing, decisions, relationships, and energy.
            </Text>
          </View>
          <DebugAccessBanner accessLevel={accessLevel} />
          <View style={styles.headerMeta}>
            <Text style={styles.dateText}>{headerDate}</Text>
            {confidenceLabel ? (
              <View style={styles.confidencePill}>
                <Text style={styles.confidencePillText}>
                  Confidence {confidenceLabel}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.actionRow}>
            <Pressable
              disabled={isGenerating}
              onPress={() => {
                void handleGenerateBriefing();
              }}
              style={[
                styles.primaryButton,
                isGenerating && styles.primaryButtonDisabled,
              ]}
            >
              {isGenerating ? (
                <Text style={styles.primaryButtonText}>Working...</Text>
              ) : (
                <Text style={styles.primaryButtonText}>
                  {briefing === null ? "Generate Today" : "Refresh Today"}
                </Text>
              )}
            </Pressable>
          </View>
          {isGenerating || todayQuery.isRefetching ? (
            <GenerationLoadingState
              compact
              stages={["Reading today’s pattern", "Shaping today’s guidance"]}
            />
          ) : null}
          <Text style={styles.statusText}>
            {queryError ?? topStatus ?? " "}
          </Text>
          {showUpgradePrompt ? (
            <Pressable
              onPress={() => {
                void (async () => {
                  await trackProductEvent({
                    event_name: "upgrade_clicked",
                    feature: "today",
                    plan_type: "pro",
                    upgrade_surface: "today_refresh_limit",
                  });

                  await startProCheckout({
                    feature: "today",
                    upgradeSurface: "today_refresh_limit",
                  });
                })();
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Upgrade to Pro</Text>
            </Pressable>
          ) : null}
        </View>

        {todayQuery.isPending && briefing === null ? (
          <View style={styles.card}>
            <GenerationLoadingState
              stages={["Reading today’s pattern", "Shaping today’s guidance"]}
            />
          </View>
        ) : null}

        {briefing === null && queryError ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Unable to load Today</Text>
            <Text style={styles.supportingText}>{queryError}</Text>
          </View>
        ) : null}

        {briefing === null && todayQuery.isPending === false && queryError === null ? (
          <View style={appUi.emptyStateCard}>
            <Text style={appUi.sectionLabel}>First read</Text>
            <Text style={appUi.sectionTitle}>
              Your first daily Briefing is one tap away
            </Text>
            <Text style={appUi.supportingText}>
              Today reads your chart against the current transits and gives you
              a concrete take on timing, work, money, relationships, and energy.
            </Text>
            <View style={appUi.emptyStateList}>
              <View style={appUi.emptyStateRow}>
                <View style={appUi.emptyStateBullet}>
                  <SunIcon size={16} />
                </View>
                <Text style={appUi.emptyStateBulletText}>
                  Today's thesis and best timing window
                </Text>
              </View>
              <View style={appUi.emptyStateRow}>
                <View style={appUi.emptyStateBullet}>
                  <BriefcaseIcon size={16} />
                </View>
                <Text style={appUi.emptyStateBulletText}>
                  A specific move for work and money
                </Text>
              </View>
              <View style={appUi.emptyStateRow}>
                <View style={appUi.emptyStateBullet}>
                  <BoltIcon size={16} />
                </View>
                <Text style={appUi.emptyStateBulletText}>
                  Energy and pacing guidance
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {briefing ? (
          <>
            {briefingNeedsRegeneration ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Refresh for your current tier</Text>
                <Text style={styles.supportingText}>
                  This Briefing was generated with free-tier context. Refresh
                  Today to recompute it for your current tier.
                </Text>
              </View>
            ) : null}

            <InsightCard title="Summary">
              <StructuredCopy
                text={briefing.executive_summary}
                textStyle={styles.bodyText}
                formatText={formatNumerologyMention}
              />
            </InsightCard>

            <ActionCard
              title="What to lean into"
              formatText={formatNumerologyMention}
              primary={briefing.decision_of_day.do}
              secondary={briefing.decision_of_day.scenario}
            />

            <ActionCard
              title="Watch for"
              formatText={formatNumerologyMention}
              primary={briefing.decision_of_day.avoid}
              secondary={briefing.decision_of_day.why}
            />

            <TimingCard briefing={briefing} formatText={formatNumerologyMention} />

            <InsightCard
              icon={<CoinsIcon size={20} />}
              supporting={briefing.cards.money.headline}
              title="Money"
            >
              <Text style={styles.listLabel}>Best move</Text>
              <StructuredCopy
                text={briefing.cards.money.lean_toward}
                textStyle={styles.primaryText}
                formatText={formatNumerologyMention}
              />
              <Text style={styles.listLabel}>Be careful with</Text>
              <StructuredCopy
                text={briefing.cards.money.avoid}
                textStyle={styles.secondaryText}
                formatText={formatNumerologyMention}
              />
              <Text style={styles.listLabel}>Risk level</Text>
              <StructuredCopy
                text={briefing.cards.money.risk_level}
                textStyle={styles.secondaryText}
                formatText={formatNumerologyMention}
              />
            </InsightCard>

            <InsightCard
              icon={<UsersIcon size={20} />}
              supporting={briefing.cards.relationships.headline}
              title="Relationships"
            >
              <Text style={styles.listLabel}>Best move</Text>
              <StructuredCopy
                text={briefing.cards.relationships.best_action}
                textStyle={styles.primaryText}
                formatText={formatNumerologyMention}
              />
              <Text style={styles.listLabel}>Be careful with</Text>
              <StructuredCopy
                text={briefing.cards.relationships.avoid}
                textStyle={styles.secondaryText}
                formatText={formatNumerologyMention}
              />
            </InsightCard>

            <InsightCard
              icon={<BoltIcon size={20} />}
              supporting={briefing.cards.health.headline}
              title="Energy"
            >
              <Text style={styles.listLabel}>Best use</Text>
              <StructuredCopy
                text={briefing.cards.health.best_use}
                textStyle={styles.primaryText}
                formatText={formatNumerologyMention}
              />
              <Text style={styles.listLabel}>Be careful with</Text>
              <StructuredCopy
                text={briefing.cards.health.avoid}
                textStyle={styles.secondaryText}
                formatText={formatNumerologyMention}
              />
            </InsightCard>

            <InsightCard
              icon={<SparklesIcon size={20} />}
              supporting={briefing.cards.personal_growth.headline}
              title="Reflection"
            >
              <Text style={styles.listLabel}>Focus</Text>
              <StructuredCopy
                text={briefing.cards.personal_growth.focus}
                textStyle={styles.primaryText}
                formatText={formatNumerologyMention}
              />
              <Text style={styles.listLabel}>Good for</Text>
              <StructuredCopy
                text={briefing.cards.personal_growth.good_for}
                textStyle={styles.secondaryText}
                formatText={formatNumerologyMention}
              />
              <Text style={styles.listLabel}>Not ideal for</Text>
              <StructuredCopy
                text={briefing.cards.personal_growth.not_ideal_for}
                textStyle={styles.secondaryText}
                formatText={formatNumerologyMention}
              />
            </InsightCard>

            <InsightCard title="Small move">
              <StructuredCopy
                text={briefing.micro_claim.statement}
                textStyle={styles.primaryText}
                formatText={formatNumerologyMention}
              />
              <Text style={styles.listLabel}>Track prompt</Text>
              <StructuredCopy
                text={briefing.micro_claim.track_prompt}
                textStyle={styles.secondaryText}
                formatText={formatNumerologyMention}
              />
            </InsightCard>

            {featureAccess.canViewFullBlueprint ? null : (
              <InsightCard title="Make this sharper with your Blueprint">
                <StructuredCopy
                  text="Unlock deeper patterns behind today’s Briefing. Your Blueprint makes Timing and Guidance more precise."
                  textStyle={styles.secondaryText}
                  formatText={formatNumerologyMention}
                />
                <Pressable style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Upgrade to Pro</Text>
                </Pressable>
              </InsightCard>
            )}

            <TodayFeedbackCard
              briefingId={briefing.id}
              feedback={feedback}
              isSaving={feedbackMutation.isPending}
              onSave={handleSaveFeedback}
            />
          </>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    paddingHorizontal: brandSpacing.screen,
    gap: brandSpacing.section,
  },
  heroCard: {
    ...appUi.heroCard,
  },
  headerCopy: {
    gap: 8,
  },
  pageEyebrow: {
    ...appUi.pageEyebrow,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  pageTitle: {
    ...appUi.pageTitle,
  },
  pageSubtitle: {
    ...appUi.pageSubtitle,
  },
  dateText: {
    color: brandColors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  confidencePill: {
    borderRadius: brandRadii.pill,
    backgroundColor: brandColors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  confidencePillText: {
    color: brandColors.accent,
    fontSize: 13,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
  },
  card: {
    ...appUi.card,
  },
  sectionTitle: {
    ...appUi.sectionTitle,
  },
  supportingLabel: {
    ...appUi.supportingLabel,
  },
  supportingText: {
    ...appUi.supportingText,
  },
  cardBody: {
    gap: 12,
  },
  insightHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bodyText: {
    ...appUi.bodyText,
  },
  primaryText: {
    ...appUi.leadText,
  },
  secondaryText: {
    color: brandColors.textMuted,
    fontSize: 15,
    lineHeight: 24,
  },
  listLabel: {
    color: brandColors.text,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  timingStack: {
    gap: 12,
  },
  timingRowFirst: {
    gap: 8,
  },
  timingRow: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: brandColors.border,
    paddingTop: 12,
  },
  primaryButton: {
    ...appUi.primaryButton,
    minWidth: 160,
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
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: brandRadii.control,
    backgroundColor: brandColors.surface,
    color: brandColors.text,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 108,
    paddingHorizontal: 14,
    paddingVertical: 14,
    textAlignVertical: "top",
  },
});
