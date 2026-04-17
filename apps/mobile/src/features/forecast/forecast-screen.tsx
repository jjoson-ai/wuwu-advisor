import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  fetchForecast,
  generateForecast,
  mobileForecastQueryKey,
} from "@/api/forecast";
import { DebugAccessBanner } from "@/components/debug-access-banner";
import { GenerationLoadingState } from "@/components/generation-loading-state";
import { TrendingIcon } from "@/components/icons";
import { LockedFeatureCard } from "@/components/locked-feature-card";
import { StructuredCopy } from "@/components/structured-copy";
import { useAuthGateState } from "@/hooks/use-auth-gate";
import { isArtifactStaleForCurrentAccess } from "@/lib/access";
import { formatNarrativeSectionsForDisplay } from "@/lib/narrative-display";
import { createNumerologyMentionFormatter } from "@/lib/numerology-mentions";
import { appUi } from "@/theme/app-ui";
import { brandColors, brandRadii, brandSpacing } from "@/theme/brand";

const FIXED_FORECAST_SECTION_TITLES = {
  current_phase: "Current phase",
  career_and_money: "Career and money",
  relationships: "Relationships",
  energy_and_pacing: "Energy and pacing",
  best_use_of_this_period: "Best use of this period",
  what_to_avoid: "What to avoid",
} as const;

const FORECAST_SUMMARY_TITLES = [
  "What’s unfolding this month",
  "Current phase",
  "What is gaining momentum",
  "What to build steadily",
  "What to avoid forcing",
  "Likely turning point",
] as const;

const FREE_FORECAST_LOCKED_TITLES = [
  FIXED_FORECAST_SECTION_TITLES.career_and_money,
  FIXED_FORECAST_SECTION_TITLES.relationships,
  FIXED_FORECAST_SECTION_TITLES.energy_and_pacing,
] as const;

const FORECAST_LOCKED_BULLETS = [
  `${FIXED_FORECAST_SECTION_TITLES.career_and_money} — where work and money deserve steady effort, and where patience serves better`,
  `${FIXED_FORECAST_SECTION_TITLES.relationships} — what this period is asking of your relationships, and where timing matters`,
  `${FIXED_FORECAST_SECTION_TITLES.energy_and_pacing} — how to pace the month well and avoid forcing the wrong rhythm`,
] as const;

function formatTimestamp(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

type ForecastSectionCardProps = {
  title: string;
  supporting?: string;
  description: string;
  formatText: (text: string) => string;
};

function ForecastSectionCard({
  title,
  supporting,
  description,
  formatText,
}: ForecastSectionCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {supporting ? <Text style={styles.supportingLabel}>{supporting}</Text> : null}
      <StructuredCopy
        text={description}
        textStyle={styles.bodyText}
        formatText={formatText}
      />
    </View>
  );
}

export function ForecastScreenContent() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { accessLevel, featureAccess, user } = useAuthGateState();
  const forecastQuery = useQuery({
    queryKey: mobileForecastQueryKey(user?.id),
    queryFn: fetchForecast,
  });
  const generateMutation = useMutation({
    mutationFn: generateForecast,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mobileForecastQueryKey(user?.id),
      });
    },
  });

  const forecast = forecastQuery.data?.forecast ?? null;
  const formatNumerologyMention = createNumerologyMentionFormatter();
  const queryError =
    forecastQuery.error instanceof Error ? forecastQuery.error.message : null;
  const forecastNeedsRegeneration =
    forecast !== null &&
    featureAccess.canViewFullForecast &&
    isArtifactStaleForCurrentAccess(
      accessLevel,
      forecast.generation_access_level,
    );
  const canViewFullForecast =
    featureAccess.canViewFullForecast && forecastNeedsRegeneration === false;
  const summarySections =
    forecast === null
      ? []
      : formatNarrativeSectionsForDisplay({
          text: formatNumerologyMention(forecast.summary),
          titles: FORECAST_SUMMARY_TITLES,
        });
  const topStatus = useMemo(() => {
    if (generateMutation.error instanceof Error) {
      return generateMutation.error.message;
    }

    return null;
  }, [generateMutation.error]);
  const leadSummarySection = summarySections[0] ?? null;
  const secondarySummarySections = summarySections.slice(1);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
      >
        <View style={styles.heroCard}>
          <View style={appUi.pageHeroKickerRow}>
            <View style={appUi.pageHeroIcon}>
              <TrendingIcon size={20} />
            </View>
            <Text style={styles.pageEyebrow}>30-day guidance</Text>
          </View>
          <Text style={styles.pageTitle}>Forecast</Text>
          <Text style={styles.pageSubtitle}>
            Signals taking shape over the next 30 days, where to focus steadily,
            and which timing to respect.
          </Text>
          <DebugAccessBanner accessLevel={accessLevel} />
          {forecast ? (
            <Text style={styles.metaText}>
              Updated {formatTimestamp(forecast.updated_at)}
            </Text>
          ) : null}
          <Pressable
            disabled={generateMutation.isPending}
            onPress={() => {
              generateMutation.mutate();
            }}
            style={[
              styles.primaryButton,
              generateMutation.isPending && styles.primaryButtonDisabled,
            ]}
          >
            {generateMutation.isPending ? (
              <Text style={styles.primaryButtonText}>Working...</Text>
            ) : (
              <Text style={styles.primaryButtonText}>
                {forecast === null ? "Generate My Forecast" : "Regenerate Forecast"}
              </Text>
            )}
          </Pressable>
          {generateMutation.isPending || forecastQuery.isRefetching ? (
            <GenerationLoadingState
              compact
              stages={["Reading the next month", "Mapping the current phase"]}
            />
          ) : null}
          <Text style={styles.statusText}>{queryError ?? topStatus ?? " "}</Text>
        </View>

        {forecastQuery.isPending && forecast === null ? (
          <View style={styles.card}>
            <GenerationLoadingState
              stages={["Reading the next month", "Mapping the current phase"]}
            />
          </View>
        ) : null}

        {forecast === null && queryError ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Unable to load Forecast</Text>
            <Text style={styles.supportingText}>{queryError}</Text>
          </View>
        ) : null}

        {forecast === null && forecastQuery.isPending === false && queryError === null ? (
          <View style={appUi.emptyStateCard}>
            <Text style={appUi.sectionLabel}>30-day planning brief</Text>
            <Text style={appUi.sectionTitle}>Generate your Forecast</Text>
            <Text style={appUi.supportingText}>
              A structured read on the month ahead — where momentum belongs,
              what's worth building steadily, and what to not force.
            </Text>
            <View style={appUi.emptyStateList}>
              <View style={appUi.emptyStateRow}>
                <View style={appUi.emptyStateBullet}>
                  <TrendingIcon size={16} />
                </View>
                <Text style={appUi.emptyStateBulletText}>
                  The current phase and what it's asking of you
                </Text>
              </View>
              <View style={appUi.emptyStateRow}>
                <View style={appUi.emptyStateBullet}>
                  <TrendingIcon size={16} />
                </View>
                <Text style={appUi.emptyStateBulletText}>
                  Career, money, relationships, and pacing
                </Text>
              </View>
              <View style={appUi.emptyStateRow}>
                <View style={appUi.emptyStateBullet}>
                  <TrendingIcon size={16} />
                </View>
                <Text style={appUi.emptyStateBulletText}>
                  Best use of the month and what to avoid
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {forecast ? (
          <>
            {forecastNeedsRegeneration ? (
              <View style={[styles.card, styles.staleCard]}>
                <Text style={styles.sectionTitle}>Refresh for your current tier</Text>
                <Text style={styles.supportingText}>
                  This Forecast was generated with free-tier context. Regenerate
                  it to load the fuller planning depth for your current tier.
                </Text>
              </View>
            ) : null}

            <View style={styles.heroCard}>
              <Text style={styles.pageEyebrow}>Monthly thesis</Text>
              <Text style={styles.sectionTitle}>What’s unfolding this month</Text>
              {leadSummarySection ? (
                <StructuredCopy
                  text={leadSummarySection.body}
                  textStyle={styles.leadText}
                  formatText={formatNumerologyMention}
                />
              ) : null}
              {secondarySummarySections.length > 0 ? (
                <View style={styles.summarySections}>
                  {secondarySummarySections.map((section, index) => (
                    <View
                      key={`${section.title}-${section.body.slice(0, 24)}`}
                      style={[styles.summarySection, index > 0 && styles.summarySectionBorder]}
                    >
                      <Text style={styles.summarySectionTitle}>{section.title}</Text>
                      <StructuredCopy
                        text={section.body}
                        textStyle={styles.supportingText}
                        formatText={formatNumerologyMention}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            {canViewFullForecast ? (
              <>
                <View style={styles.featuredCard}>
                  <Text style={styles.pageEyebrow}>Planning lens</Text>
                  <Text style={styles.sectionTitle}>
                    {FIXED_FORECAST_SECTION_TITLES.current_phase}
                  </Text>
                  <Text style={styles.supportingLabel}>
                    {forecast.current_phase.headline}
                  </Text>
                  <StructuredCopy
                    text={forecast.current_phase.description}
                    textStyle={styles.bodyText}
                    formatText={formatNumerologyMention}
                  />
                </View>
                <ForecastSectionCard
                  title={FIXED_FORECAST_SECTION_TITLES.career_and_money}
                  supporting={forecast.career_and_money.headline}
                  description={forecast.career_and_money.description}
                  formatText={formatNumerologyMention}
                />
                <ForecastSectionCard
                  title={FIXED_FORECAST_SECTION_TITLES.relationships}
                  supporting={forecast.relationships.headline}
                  description={forecast.relationships.description}
                  formatText={formatNumerologyMention}
                />
                <ForecastSectionCard
                  title={FIXED_FORECAST_SECTION_TITLES.energy_and_pacing}
                  supporting={forecast.energy_and_pacing.headline}
                  description={forecast.energy_and_pacing.description}
                  formatText={formatNumerologyMention}
                />
                <ForecastSectionCard
                  title={FIXED_FORECAST_SECTION_TITLES.best_use_of_this_period}
                  supporting={forecast.best_use_of_this_period.headline}
                  description={forecast.best_use_of_this_period.description}
                  formatText={formatNumerologyMention}
                />
                <ForecastSectionCard
                  title={FIXED_FORECAST_SECTION_TITLES.what_to_avoid}
                  supporting={forecast.what_to_avoid.headline}
                  description={forecast.what_to_avoid.description}
                  formatText={formatNumerologyMention}
                />
              </>
            ) : forecastNeedsRegeneration ? (
              <LockedFeatureCard
                bullets={FREE_FORECAST_LOCKED_TITLES.map(
                  (t) =>
                    `${t} — regenerate to load the fuller planning depth available on your current tier`,
                )}
                ctaLabel="Regenerate Forecast"
                description="This Forecast was generated at the free tier. Regenerate it to load the fuller planning depth now included in your plan."
                featured
                statusLabel="Needs refresh"
                title="Refresh your full Forecast"
              />
            ) : (
              <LockedFeatureCard
                bullets={FORECAST_LOCKED_BULLETS}
                description="Pro unlocks the deeper sections and the full month-ahead detail, so Forecast guidance gets measurably more specific to you."
                feature="forecast"
                featured
                title="Unlock your full Forecast"
                upgradeSurface="forecast_consolidated_paywall"
              />
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brandColors.background,
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
  metaText: {
    ...appUi.metaText,
  },
  card: {
    ...appUi.card,
  },
  featuredCard: {
    ...appUi.featuredCard,
  },
  staleCard: {
    ...appUi.staleCard,
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
  bodyText: {
    ...appUi.bodyText,
  },
  leadText: {
    ...appUi.leadText,
  },
  summarySections: {
    gap: 14,
  },
  summarySection: {
    gap: 6,
  },
  summarySectionBorder: {
    borderTopColor: brandColors.border,
    borderTopWidth: 1,
    paddingTop: 14,
  },
  summarySectionTitle: {
    ...appUi.sectionLabel,
    color: brandColors.textMuted,
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
  statusText: {
    ...appUi.metaText,
    minHeight: 20,
  },
});
