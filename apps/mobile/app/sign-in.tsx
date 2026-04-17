import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect } from "expo-router";

import { getApiBaseUrl } from "@/api/client";
import { useAuthGateState } from "@/hooks/use-auth-gate";
import { trackProductEvent } from "@/lib/product-events";
import { useAuth } from "@/providers/auth-provider";
import { brandColors, brandCopy, brandRadii, brandSpacing } from "@/theme/brand";

export default function SignInScreen() {
  const {
    session,
    isLoading,
    authMessage,
    signInWithPassword,
    signUpWithPassword,
    signInWithTestAccount,
    isTestAccountEnabled,
    clearAuthMessage,
  } = useAuth();
  const gate = useAuthGateState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading || (session !== null && gate.isSettingsLoading)) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator color={brandColors.accent} />
          <Text style={styles.loadingText}>Loading your session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (session !== null && gate.onboardingComplete === false) {
    return <Redirect href="/onboarding" />;
  }

  if (session !== null && gate.settingsError) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.statusText}>{gate.settingsError}</Text>
          {__DEV__ ? (
            <View style={styles.debugCard}>
              <Text style={styles.debugLabel}>Dev diagnostics</Text>
              <Text style={styles.debugText}>Session: present</Text>
              <Text style={styles.debugText}>
                API: {getApiBaseUrl()}
              </Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  if (session !== null && gate.onboardingComplete) {
    return <Redirect href="/(tabs)/today" />;
  }

  async function handleSubmit() {
    if (email.trim() === "") {
      setStatus("Email is required.");
      return;
    }

    if (password.trim() === "") {
      setStatus("Password is required.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    clearAuthMessage();
    setIsSubmitting(true);
    setStatus(mode === "login" ? "Signing in..." : "Creating your account...");

    try {
      if (mode === "signup") {
        void trackProductEvent(
          {
            event_name: "signup_started",
            feature: null,
            plan_type: null,
            upgrade_surface: null,
          },
          { onceKey: "signup_started:mobile" },
        );
      }

      const result =
        mode === "login"
          ? await signInWithPassword({
              email: email.trim(),
              password,
            })
          : await signUpWithPassword({
              email: email.trim(),
              password,
            });

      if (mode === "signup" && result.success) {
        void trackProductEvent({
          event_name: "signup_completed",
          feature: null,
          plan_type: null,
          upgrade_surface: null,
        });
      }

      setStatus(result.message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTestAccountSignIn() {
    clearAuthMessage();
    setIsSubmitting(true);
    setStatus("Signing in with the local test account...");

    try {
      const result = await signInWithTestAccount();
      setStatus(result.message);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Unable to sign in with test account.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.eyebrow}>{brandCopy.productName}</Text>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>
              {brandCopy.tagline} Use your email and password to access your
              Briefing, Signals, Timing, and Guidance.
            </Text>
          </View>

          <View style={styles.modeRow}>
            <Pressable
              onPress={() => setMode("login")}
              style={[styles.modeButton, mode === "login" && styles.modeButtonActive]}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  mode === "login" && styles.modeButtonTextActive,
                ]}
              >
                Login
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("signup")}
              style={[styles.modeButton, mode === "signup" && styles.modeButtonActive]}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  mode === "signup" && styles.modeButtonTextActive,
                ]}
              >
                Sign up
              </Text>
            </Pressable>
          </View>

          {isTestAccountEnabled ? (
            <Pressable
              disabled={isSubmitting}
              onPress={() => {
                void handleTestAccountSignIn();
              }}
              style={[
                styles.secondaryButton,
                isSubmitting && styles.primaryButtonDisabled,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Use test account</Text>
            </Pressable>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={brandColors.textSubtle}
              style={styles.input}
              value={email}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor={brandColors.textSubtle}
              secureTextEntry
              style={styles.input}
              value={password}
            />

            {mode === "signup" ? (
              <>
                <Text style={styles.label}>Confirm password</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="new-password"
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter your password"
                  placeholderTextColor={brandColors.textSubtle}
                  secureTextEntry
                  style={styles.input}
                  value={confirmPassword}
                />
              </>
            ) : null}

            <Pressable
              disabled={isSubmitting}
              onPress={() => {
                void handleSubmit();
              }}
              style={[
                styles.primaryButton,
                isSubmitting && styles.primaryButtonDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === "login" ? "Sign in" : "Create account"}
                </Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.statusText}>
            {authMessage ?? status ?? " "}
          </Text>
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
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  loadingText: {
    color: brandColors.textMuted,
    fontSize: 16,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: brandSpacing.section,
    justifyContent: "center",
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: brandColors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  title: {
    color: brandColors.text,
    fontSize: 32,
    fontWeight: "700",
  },
  subtitle: {
    color: brandColors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  modeRow: {
    flexDirection: "row",
    backgroundColor: brandColors.surfaceMuted,
    borderRadius: brandRadii.control,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 10,
  },
  modeButtonActive: {
    backgroundColor: brandColors.surface,
  },
  modeButtonText: {
    color: brandColors.textMuted,
    fontSize: 15,
    fontWeight: "600",
  },
  modeButtonTextActive: {
    color: brandColors.text,
  },
  card: {
    gap: 12,
    borderRadius: brandRadii.card,
    backgroundColor: brandColors.surface,
    padding: 20,
  },
  label: {
    color: brandColors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: brandRadii.control,
    backgroundColor: brandColors.surface,
    color: brandColors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: brandRadii.control,
    backgroundColor: brandColors.accent,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: brandRadii.control,
    backgroundColor: brandColors.surface,
    borderColor: brandColors.border,
    borderWidth: 1,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: brandColors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  statusText: {
    color: brandColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 40,
  },
  debugCard: {
    width: "100%",
    gap: 6,
    borderRadius: brandRadii.card,
    backgroundColor: brandColors.surface,
    borderColor: brandColors.border,
    borderWidth: 1,
    padding: 16,
  },
  debugLabel: {
    color: brandColors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  debugText: {
    color: brandColors.textMuted,
    fontSize: 12,
  },
});
