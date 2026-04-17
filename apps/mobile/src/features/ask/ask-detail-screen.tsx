import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView as SafeAreaContextView, useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchAskById, mobileAskDetailQueryKey } from "@/api/ask";
import { MessageIcon } from "@/components/icons";
import { StructuredCopy } from "@/components/structured-copy";
import { createNumerologyMentionFormatter } from "@/lib/numerology-mentions";
import { appUi } from "@/theme/app-ui";
import { brandColors, brandRadii, brandSpacing } from "@/theme/brand";
import type { FormattedDecisionGuidance } from "@/types/api";

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

function DetailSections({
  guidance,
  formatText,
}: {
  guidance: FormattedDecisionGuidance;
  formatText: (text: string) => string;
}) {
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.metaText}>
          Saved {formatTimestamp(guidance.created_at)} · Confidence{" "}
          {titleCase(guidance.confidence)}
        </Text>
        <Text style={styles.sectionLabel}>Question</Text>
        <Text style={styles.sectionTitle}>Current question</Text>
        <StructuredCopy text={guidance.question} textStyle={styles.primaryText} formatText={formatText} />
      </View>

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
    </>
  );
}

export function AskDetailScreenContent() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detailQuery = useQuery({
    queryKey: mobileAskDetailQueryKey(id ?? ""),
    queryFn: () => fetchAskById(id ?? ""),
    enabled: typeof id === "string" && id.trim() !== "",
  });

  const guidance = detailQuery.data?.guidance ?? null;
  const formatNumerologyMention = createNumerologyMentionFormatter();
  const queryError = detailQuery.error instanceof Error ? detailQuery.error.message : null;

  return (
    <SafeAreaContextView edges={["top", "bottom"]} style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
      >
        <View style={styles.heroCard}>
          <View style={appUi.pageHeroKickerRow}>
            <View style={appUi.pageHeroIcon}>
              <MessageIcon size={20} />
            </View>
            <Text style={styles.pageEyebrow}>Saved answer</Text>
          </View>
          <Text style={styles.pageTitle}>Saved Guidance</Text>
          <Text style={styles.pageSubtitle}>
            A saved Guidance result from your recent Ask history.
          </Text>
        </View>

        {detailQuery.isPending ? (
          <View style={styles.card}>
            <ActivityIndicator color={brandColors.accent} />
            <Text style={styles.supportingText}>Loading saved answer...</Text>
          </View>
        ) : null}

        {guidance === null && queryError ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Unable to load saved answer</Text>
            <Text style={styles.supportingText}>{queryError}</Text>
          </View>
        ) : null}

        {guidance ? (
          <DetailSections
            guidance={guidance}
            formatText={formatNumerologyMention}
          />
        ) : null}
      </ScrollView>
    </SafeAreaContextView>
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
  card: {
    ...appUi.card,
  },
  metaText: {
    ...appUi.metaText,
  },
  sectionTitle: {
    ...appUi.sectionTitle,
  },
  sectionLabel: {
    ...appUi.sectionLabel,
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
});
