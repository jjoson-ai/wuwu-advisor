import { useQuery } from "@tanstack/react-query";

import { fetchSettings, mobileSettingsQueryKey } from "@/api/settings";
import { useAuth } from "@/providers/auth-provider";

export function useAuthGateState() {
  const { session, user, isLoading: isAuthLoading } = useAuth();
  const settingsQuery = useQuery({
    queryKey: mobileSettingsQueryKey(user?.id),
    queryFn: fetchSettings,
    enabled: session !== null,
    staleTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });

  const settingsError =
    settingsQuery.error instanceof Error ? settingsQuery.error.message : null;

  return {
    session,
    user,
    isAuthLoading,
    isSettingsLoading: session !== null && settingsQuery.isPending,
    isLoading: isAuthLoading || (session !== null && settingsQuery.isPending),
    settings: settingsQuery.data?.settings ?? null,
    onboardingComplete:
      session === null ? null : (settingsQuery.data?.onboardingComplete ?? null),
    accessLevel: settingsQuery.data?.accessLevel ?? "free",
    featureAccess:
      settingsQuery.data?.featureAccess ?? {
        canViewFullBlueprint: false,
        canGenerateUnlimitedToday: false,
        canAskUnlimited: false,
        canViewFullForecast: false,
      },
    dailyUsageLimits:
      settingsQuery.data?.dailyUsageLimits ?? {
        askQuestionsPerDay: 3,
        todayRefreshesPerDay: null,
      },
    settingsError,
    refetchSettings: settingsQuery.refetch,
  };
}
