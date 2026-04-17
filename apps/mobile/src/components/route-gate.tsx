import { PropsWithChildren } from "react";
import { Pressable, Text } from "react-native";
import { Redirect } from "expo-router";

import { ScreenPlaceholder } from "@/components/screen-placeholder";
import { useAuthGateState } from "@/hooks/use-auth-gate";
import { brandColors } from "@/theme/brand";

type RouteGateProps = PropsWithChildren<{
  title: string;
  requireOnboardingComplete?: boolean;
}>;

export function RouteGate({
  title,
  requireOnboardingComplete = true,
  children,
}: RouteGateProps) {
  const gate = useAuthGateState();

  if (gate.isLoading) {
    return (
      <ScreenPlaceholder
        title={title}
        description="Loading your session and profile..."
      />
    );
  }

  if (gate.session === null) {
    return <Redirect href="/sign-in" />;
  }

  if (requireOnboardingComplete && gate.onboardingComplete === false) {
    return <Redirect href="/onboarding" />;
  }

  if (gate.settingsError) {
    return (
      <ScreenPlaceholder
        title={title}
        description={gate.settingsError}
      >
        <Pressable
          onPress={() => {
            void gate.refetchSettings();
          }}
        >
          <Text style={{ color: brandColors.accent, fontSize: 16, fontWeight: "600" }}>
            Retry
          </Text>
        </Pressable>
      </ScreenPlaceholder>
    );
  }

  return <>{children}</>;
}
