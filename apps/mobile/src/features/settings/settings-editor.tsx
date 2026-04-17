import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  fetchUserDataExport,
  submitDeleteDataRequest,
} from "@/api/privacy";
import { mobileSettingsQueryKey, saveSettings } from "@/api/settings";
import { SlidersIcon, SparklesIcon } from "@/components/icons";
import { ScreenPlaceholder } from "@/components/screen-placeholder";
import { useAuthGateState } from "@/hooks/use-auth-gate";
import { env } from "@/lib/env";
import {
  getTrackingPreference,
  saveTrackingPreference,
} from "@/lib/tracking-preferences";
import { useAuth } from "@/providers/auth-provider";
import { appUi } from "@/theme/app-ui";
import { brandColors, brandCopy, brandRadii, brandSpacing } from "@/theme/brand";
import type { MobileSettingsWriteRequest } from "@/types/api";

const BIRTH_TIME_CONFIDENCE_OPTIONS = [
  { value: "exact", label: "Exact" },
  { value: "approximate", label: "Approximate" },
  { value: "unknown", label: "Unknown" },
] as const;

const TONE_OPTIONS = [
  { value: "grounded", label: "Grounded" },
  { value: "warm", label: "Warm" },
  { value: "direct", label: "Direct" },
] as const;

const BAZI_MARKER_OPTIONS = [
  { value: "", label: "Not Set" },
  { value: "M", label: "M" },
  { value: "F", label: "F" },
] as const;

const QUICK_BIRTH_TIME_OPTIONS = [
  { value: "04:00", label: "04:00" },
  { value: "06:00", label: "06:00" },
  { value: "12:00", label: "12:00" },
  { value: "18:00", label: "18:00" },
] as const;

const QUICK_TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC" },
  { value: "Europe/Madrid", label: "Madrid" },
  { value: "Asia/Manila", label: "Manila" },
  { value: "America/New_York", label: "New York" },
] as const;

function getDefaultSettings(): MobileSettingsWriteRequest {
  return {
    displayName: "",
    fullBirthNameForNumerology: "",
    baziCalculationMarker: "",
    birthDate: "",
    birthTime: "",
    birthTimeConfidence: "exact",
    birthCity: "",
    birthCountry: "",
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() || "UTC",
    tonePreference: "grounded",
  };
}

type SettingsEditorProps = {
  mode: "onboarding" | "settings";
};

export function SettingsEditor({ mode }: SettingsEditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const gate = useAuthGateState();
  const [form, setForm] = useState<MobileSettingsWriteRequest>(getDefaultSettings);
  const [status, setStatus] = useState<string | null>(null);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [privacyStatus, setPrivacyStatus] = useState<string | null>(null);
  const [privacyAction, setPrivacyAction] = useState<"export" | "delete" | null>(
    null,
  );

  useEffect(() => {
    if (gate.settings) {
      setForm(gate.settings);
    }
  }, [gate.settings]);

  useEffect(() => {
    let isMounted = true;

    void getTrackingPreference().then((savedPreference) => {
      if (isMounted && savedPreference !== null) {
        setTrackingEnabled(savedPreference.trackingEnabled);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const saveMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: mobileSettingsQueryKey(session?.user.id),
      });
      setStatus("Settings saved.");

      if (mode === "onboarding" && response.onboardingComplete) {
        router.replace("/(tabs)/today");
      }
    },
    onError: (error) => {
      setStatus(error instanceof Error ? error.message : "Unable to save settings.");
    },
  });

  const pageCopy = useMemo(() => {
    if (mode === "onboarding") {
      return {
        title: "Complete your settings",
        description:
          `Save a few core details so ${brandCopy.productName} can personalize your Briefing, Signals, Timing, and Guidance.`,
        buttonLabel: "Save and continue",
      };
    }

    return {
      title: "Settings",
      description:
        `${brandCopy.productName} uses these details to personalize Today, Forecast, and Ask.`,
      buttonLabel: "Save settings",
    };
  }, [mode]);

  if (gate.isLoading) {
    return (
      <ScreenPlaceholder
        title={pageCopy.title}
        description="Loading your settings..."
      />
    );
  }

  if (gate.session === null) {
    return <Redirect href="/sign-in" />;
  }

  if (mode === "onboarding" && gate.onboardingComplete) {
    return <Redirect href="/(tabs)/today" />;
  }

  if (gate.settingsError) {
    return (
      <ScreenPlaceholder title={pageCopy.title} description={gate.settingsError}>
        <Pressable
          onPress={() => {
            void gate.refetchSettings();
          }}
        >
          <Text style={styles.linkText}>Retry</Text>
        </Pressable>
      </ScreenPlaceholder>
    );
  }

  function updateField<Key extends keyof MobileSettingsWriteRequest>(
    key: Key,
    value: MobileSettingsWriteRequest[Key],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSave() {
    setStatus(null);

    try {
      await saveMutation.mutateAsync(form);
    } catch {
      // Mutation state already carries the user-facing error.
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      queryClient.removeQueries({ queryKey: ["settings"] });
      queryClient.removeQueries({ queryKey: ["today"] });
      router.replace("/sign-in");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to sign out.");
    }
  }

  async function handleTrackingPreferenceChange(nextValue: boolean) {
    setTrackingEnabled(nextValue);
    await saveTrackingPreference(nextValue);
    setPrivacyStatus("Tracking preference saved on this device.");
  }

  async function handleExportData() {
    setPrivacyAction("export");
    setPrivacyStatus(null);

    try {
      const payload = await fetchUserDataExport();
      await Share.share({
        title: "Wuwu Advisor data export",
        message: JSON.stringify(payload, null, 2),
      });
      setPrivacyStatus(
        "Data export prepared. Use your device share options to save or send it.",
      );
    } catch (error) {
      setPrivacyStatus(
        error instanceof Error ? error.message : "Unable to prepare data export.",
      );
    } finally {
      setPrivacyAction(null);
    }
  }

  async function handleDeleteData() {
    setPrivacyAction("delete");
    setPrivacyStatus(null);

    try {
      const response = await submitDeleteDataRequest();
      setPrivacyStatus(response.message);
    } catch (error) {
      setPrivacyStatus(
        error instanceof Error ? error.message : "Unable to submit deletion request.",
      );
    } finally {
      setPrivacyAction(null);
    }
  }

  async function openLegalPage(path: "/privacy" | "/terms") {
    await Linking.openURL(`${env.apiBaseUrl}${path}`);
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
                {mode === "onboarding" ? (
                  <SparklesIcon size={20} />
                ) : (
                  <SlidersIcon size={20} />
                )}
              </View>
              <Text style={styles.pageEyebrow}>
                {mode === "onboarding" ? "Personalization" : "Account"}
              </Text>
            </View>
            <Text style={styles.title}>{pageCopy.title}</Text>
            <Text style={styles.subtitle}>{pageCopy.description}</Text>
          </View>

          <View style={styles.card}>
            <FormField
              label="Display name"
              onChangeText={(value) => updateField("displayName", value)}
              value={form.displayName}
            />
            <FormField
              label="Full birth name for numerology"
              onChangeText={(value) =>
                updateField("fullBirthNameForNumerology", value)
              }
              value={form.fullBirthNameForNumerology}
            />
            <FormField
              label="Birth date"
              onChangeText={(value) => updateField("birthDate", value)}
              placeholder="1986-02-19"
              value={form.birthDate}
            />
            <FormField
              helperText="Use HH:MM, or tap a quick option below."
              label="Birth time"
              onChangeText={(value) => updateField("birthTime", value)}
              placeholder="04:00"
              value={form.birthTime}
            />
            <OptionGroup
              onSelect={(value) => updateField("birthTime", value)}
              options={QUICK_BIRTH_TIME_OPTIONS}
              value={form.birthTime}
            />
            <OptionGroup
              label="Birth time confidence"
              onSelect={(value) => updateField("birthTimeConfidence", value)}
              options={BIRTH_TIME_CONFIDENCE_OPTIONS}
              value={form.birthTimeConfidence}
            />
            <FormField
              label="Birth city"
              onChangeText={(value) => updateField("birthCity", value)}
              value={form.birthCity}
            />
            <FormField
              label="Birth country"
              onChangeText={(value) => updateField("birthCountry", value)}
              value={form.birthCountry}
            />
            <FormField
              helperText="Tap a common option, or type an IANA timezone like Europe/Madrid."
              label="Current timezone"
              onChangeText={(value) => updateField("timezone", value)}
              placeholder="Europe/Madrid"
              value={form.timezone}
            />
            <OptionGroup
              onSelect={(value) => updateField("timezone", value)}
              options={QUICK_TIMEZONE_OPTIONS}
              value={form.timezone}
            />
            <OptionGroup
              label="How should the app sound?"
              onSelect={(value) => updateField("tonePreference", value)}
              options={TONE_OPTIONS}
              value={form.tonePreference}
            />
            <OptionGroup
              label="BaZi marker"
              onSelect={(value) => updateField("baziCalculationMarker", value)}
              options={BAZI_MARKER_OPTIONS}
              value={form.baziCalculationMarker}
            />

            <Pressable
              disabled={saveMutation.isPending}
              onPress={() => {
                void handleSave();
              }}
              style={[
                styles.primaryButton,
                saveMutation.isPending && styles.primaryButtonDisabled,
              ]}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>{pageCopy.buttonLabel}</Text>
              )}
            </Pressable>

            {mode === "settings" ? (
              <Pressable onPress={() => void handleSignOut()} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Sign out</Text>
              </Pressable>
            ) : null}

            <Text style={styles.statusText}>{status ?? " "}</Text>
          </View>

          {mode === "settings" ? (
            <View style={styles.card}>
              <View style={styles.headerBlock}>
                <Text style={styles.sectionTitle}>Privacy &amp; data</Text>
                <Text style={styles.sectionDescription}>
                  Manage legal references, data-rights entry points, and the
                  device-level tracking preference for this account.
                </Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Legal pages</Text>
                <View style={styles.optionRow}>
                  <Pressable
                    onPress={() => {
                      void openLegalPage("/privacy");
                    }}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>Privacy Policy</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void openLegalPage("/terms");
                    }}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>Terms</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Privacy-safe analytics preference</Text>
                <Text style={styles.helperText}>
                  Stored on this device only. No third-party analytics SDK is active
                  in the current mobile build.
                </Text>
                <View style={styles.optionRow}>
                  <Pressable
                    onPress={() => {
                      void handleTrackingPreferenceChange(false);
                    }}
                    style={[
                      styles.optionButton,
                      trackingEnabled === false && styles.optionButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        trackingEnabled === false && styles.optionButtonTextActive,
                      ]}
                    >
                      Off
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void handleTrackingPreferenceChange(true);
                    }}
                    style={[
                      styles.optionButton,
                      trackingEnabled === true && styles.optionButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        trackingEnabled === true && styles.optionButtonTextActive,
                      ]}
                    >
                      Allow later
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Data rights</Text>
                <Text style={styles.helperText}>
                  Export covers first-party app data. Processor-side export and
                  deletion still require manual follow-up.
                </Text>
                <View style={styles.actionRow}>
                  <Pressable
                    disabled={privacyAction !== null}
                    onPress={() => {
                      void handleExportData();
                    }}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>Download my data</Text>
                  </Pressable>
                  <Pressable
                    disabled={privacyAction !== null}
                    onPress={() => {
                      void handleDeleteData();
                    }}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>Delete my data</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.statusText}>
                {privacyAction === "export"
                  ? "Preparing data export..."
                  : privacyAction === "delete"
                    ? "Submitting deletion request..."
                    : (privacyStatus ?? " ")}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  helperText?: string;
};

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  helperText,
}: FormFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
      <TextInput
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={brandColors.textSubtle}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

type OptionGroupProps = {
  label?: string;
  value: string;
  onSelect: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
};

function OptionGroup({ label, value, onSelect, options }: OptionGroupProps) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.optionRow}>
        {options.map((option) => (
          <Pressable
            key={option.value || "blank"}
            onPress={() => onSelect(option.value)}
            style={[
              styles.optionButton,
              value === option.value && styles.optionButtonActive,
            ]}
          >
            <Text
              style={[
                styles.optionButtonText,
                value === option.value && styles.optionButtonTextActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
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
  pageEyebrow: {
    ...appUi.pageEyebrow,
  },
  headerBlock: {
    gap: 8,
  },
  title: {
    ...appUi.pageTitle,
  },
  subtitle: {
    ...appUi.pageSubtitle,
  },
  card: {
    ...appUi.card,
    gap: 14,
  },
  sectionTitle: {
    ...appUi.sectionTitle,
  },
  sectionDescription: {
    ...appUi.supportingText,
  },
  field: {
    gap: 8,
  },
  label: {
    color: brandColors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  helperText: {
    ...appUi.supportingLabel,
    color: brandColors.textSubtle,
  },
  input: {
    ...appUi.textInput,
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: brandRadii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionButtonActive: {
    borderColor: brandColors.accent,
    backgroundColor: brandColors.accentSoft,
  },
  optionButtonText: {
    color: brandColors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  optionButtonTextActive: {
    color: brandColors.accent,
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
    borderColor: brandColors.border,
  },
  secondaryButtonText: {
    ...appUi.secondaryButtonText,
    color: brandColors.text,
  },
  statusText: {
    ...appUi.metaText,
    minHeight: 20,
  },
  linkText: {
    color: brandColors.accent,
    fontSize: 16,
    fontWeight: "600",
  },
});
