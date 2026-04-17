import { Redirect } from "expo-router";

import { ScreenPlaceholder } from "@/components/screen-placeholder";
import { useAuthGateState } from "@/hooks/use-auth-gate";

export default function IndexScreen() {
  const gate = useAuthGateState();

  if (gate.isLoading) {
    return (
      <ScreenPlaceholder
        title="Astrologer On Demand"
        description="Loading your session..."
      />
    );
  }

  if (gate.session === null) {
    return <Redirect href="/sign-in" />;
  }

  if (gate.settingsError) {
    return (
      <ScreenPlaceholder
        title="Astrologer On Demand"
        description={gate.settingsError}
      />
    );
  }

  if (gate.onboardingComplete === false) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)/today" />;
}
