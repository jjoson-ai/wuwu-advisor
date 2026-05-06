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
  BriefingFeedback,
  FormattedTodayBriefing,
  RatingEmojiValue,
  RatingThemeValue,
} from "@/types/api";

// Mirrors EMOJI_LABELS in the web component + feedback.types.ts.
const EMOJI_OPTIONS: Array<{
  value: RatingEmojiValue;
  icon: string;
  headline: string;
  blurb: string;
}> = [
  { value: "nailed_it", icon: "🎯", headline: "Nailed it", blurb: "Matched today." },
  { value: "vague", icon: "🌫️", headline: "Vague", blurb: "Too generic." },
  { value: "off", icon: "🙃", headline: "Off", blurb: "Read my day wrong." },
];

const THEME_OPTIONS: Array<{ value: RatingThemeValue; label: string }> = [
  { value: "career", label: "Career" },
  { value: "money", label: "Money" },
  { value: "relationships", label: "Relationships" },
  { value: "health", label: "Health" },
  { value: "personal_growth", label: "Growth" },
  { value: "timing", label: "Timing" },
];

function toggleArrayValue<T>(list: readonly T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

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
    ratingEmoji: RatingEmojiValue;
    ratingThemeHit: RatingThemeValue[];
    ratingThemeMiss: RatingThemeValue[];
    note: string | null;
  }) => Promise<void>;
};

function TodayFeedbackCard({
  briefingId,
  feedback,
  isSaving,
  onSave,
}: TodayFeedbackCardProps) {
  const [ratingEmoji, setRatingEmoji] = useState<RatingEmojiValue | null>(
    feedback?.rating_emoji ?? null,
  );
  const [themeHit, setThemeHit] = useState<RatingThemeValue[]>(
    feedback?.rating_theme_hit ?? [],
  );
  const [themeMiss, setThemeMiss] = useState<RatingThemeValue[]>(
    feedback?.rating_theme_miss ?? [],
  );
  const [note, setNote] = useState(feedback?.note ?? "");
  const [status, setStatus] = useState<string | null>(null);

  // Sync local state with remote when the feedback row updates (e.g. after
  // the mutation's invalidate refetches `feedback`).
  useEffect(() => {
    setRatingEmoji(feedback?.rating_emoji ?? null);
    setThemeHit(feedback?.rating_theme_hit ?? []);
    setThemeMiss(feedback?.rating_theme_miss ?? []);
    setNote(feedback?.note ?? "");
  }, [feedback]);

  const isExistingRating =
    feedback?.briefing_id === briefingId && feedback.rating_emoji !== null;

  function toggleHit(theme: RatingThemeValue) {
    setThemeHit((prev) => toggleArrayValue(prev, theme));
    setThemeMiss((prev) => prev.filter((item) => item !== theme));
  }

  function toggleMiss(theme: RatingThemeValue) {
    setThemeMiss((prev) => toggleArrayValue(prev, theme));
    setThemeHit((prev) => prev.filter((item) => item !== theme));
  }

  async function handleSave() {
    setStatus(null);

    if (ratingEmoji === null) {
      setStatus("Pick a rating first.");
      return;
    }

    try {
      await onSave({
        ratingEmoji,
        ratingThemeHit: themeHit,
        ratingThemeMiss: themeMiss,
        note: note.trim() === "" ? null : note.trim(),
      });
      setStatus("Thanks — this tunes future briefings.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save feedback.");
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Rate this briefing</Text>
      <Text style={styles.supportingText}>
        One tap helps us calibrate your chart. Details optional.
      </Text>

      <View style={styles.feedbackSection}>
        <View style={styles.emojiRow}>
          {EMOJI_OPTIONS.map((option) => {
            const selected = ratingEmoji === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setRatingEmoji(option.value)}
                style={[
                  styles.emojiButton,
                  selected && styles.emojiButtonActive,
                ]}
              >
                <Text style={styles.emojiIcon}>{option.icon}</Text>
                <Text style={styles.emojiHeadline}>{option.headline}</Text>
                <Text style={styles.emojiBlurb}>{option.blurb}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {ratingEmoji !== null ? (
        <>
          <ThemeChipGroup
            heading="What hit?"
            helper="Tap cards that matched today."
            selected={themeHit}
            disabled={themeMiss}
            onToggle={toggleHit}
            tone="hit"
          />

          <ThemeChipGroup
            heading="What missed?"
            helper="Tap anything the briefing got wrong."
            selected={themeMiss}
            disabled={themeHit}
            onToggle={toggleMiss}
            tone="miss"
          />

          <View style={styles.feedbackSection}>
            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              multiline
              onChangeText={setNote}
              placeholder="What was the actual day about?"
              placeholderTextColor={brandColors.textSubtle}
              style={styles.textArea}
              value={note}
            />
          </View>
        </>
      ) : null}

      <Pressable
        disabled={isSaving || ratingEmoji === null}
        onPress={() => {
          void handleSave();
        }}
        style={[
          styles.primaryButton,
          (isSaving || ratingEmoji === null) && styles.primaryButtonDisabled,
        ]}
      >
        {isSaving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {isExistingRating ? "Update rating" : "Submit rating"}
          </Text>
        )}
      </Pressable>

      <Text style={styles.statusText}>{status ?? " "}</Text>
    </View>
  );
}

type ThemeChipGroupProps = {
  heading: string;
  helper: string;
  selected: RatingThemeValue[];
  disabled: RatingThemeValue[];
  onToggle: (value: RatingThemeValue) => void;
  tone: "hit" | "miss";
};

function ThemeChipGroup({
  heading,
  helper,
  selected,
  disabled,
  onToggle,
  tone,
}: ThemeChipGroupProps) {
  const selectedSet = new Set(selected);
  const disabledSet = new Set(disabled);

  return (
    <View style={styles.feedbackSection}>
      <Text style={styles.fieldLabel}>{heading}</Text>
      <Text style={styles.supportingText}>{helper}</Text>
      <View style={styles.chipRow}>
        {THEME_OPTIONS.map((option) => {
          const isSelected = selectedSet.has(option.value);
          const isDisabled = disabledSet.has(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: isDisabled }}
              disabled={isDisabled}
              onPress={() => onToggle(option.value)}
              style={[
                styles.chip,
                isSelected && tone === "hit" && styles.chipActiveHit,
                isSelected && tone === "miss" && styles.chipActiveMiss,
                isDisabled && styles.chipDisabled,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  isSelected && styles.chipTextActive,
                  isDisabled && styles.chipTextDisabled,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
    ratingEmoji: RatingEmojiValue;
    ratingThemeHit: RatingThemeValue[];
    ratingThemeMiss: RatingThemeValue[];
    note: string | null;
  }) {
    if (briefing === null) {
      throw new Error("Generate Today before saving feedback.");
    }

    await feedbackMutation.mutateAsync({
      briefingId: briefing.id,
      ratingEmoji: input.ratingEmoji,
      ratingThemeHit: input.ratingThemeHit,
      ratingThemeMiss: input.ratingThemeMiss,
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
                <Text style={styles.secondaryButtonText}>Get more uses</Text>
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
                <Pressable
                  onPress={() => {
                    void (async () => {
                      await trackProductEvent({
                        event_name: "upgrade_clicked",
                        feature: "today",
                        plan_type: "pro",
                        upgrade_surface: "today_blueprint_upsell",
                      });

                      await startProCheckout({
                        feature: "today",
                        upgradeSurface: "today_blueprint_upsell",
                      });
                    })();
                  }}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Start 7-day free trial</Text>
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
  emojiRow: {
    flexDirection: "row",
    gap: 8,
  },
  emojiButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: brandRadii.control,
    borderWidth: 1,
    borderColor: brandColors.border,
    backgroundColor: brandColors.surface,
    gap: 4,
  },
  emojiButtonActive: {
    borderColor: brandColors.accent,
    borderWidth: 2,
    backgroundColor: brandColors.accentSoft,
  },
  emojiIcon: {
    fontSize: 26,
    lineHeight: 32,
  },
  emojiHeadline: {
    color: brandColors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  emojiBlurb: {
    color: brandColors.textMuted,
    fontSize: 11,
    lineHeight: 14,
    textAlign: "center",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: brandRadii.pill,
    borderWidth: 1,
    borderColor: brandColors.border,
    backgroundColor: brandColors.surface,
  },
  chipActiveHit: {
    borderColor: "#15803d",
    backgroundColor: "#15803d",
  },
  chipActiveMiss: {
    borderColor: "#b42318",
    backgroundColor: "#b42318",
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    color: brandColors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  chipTextDisabled: {
    color: brandColors.textSubtle,
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
