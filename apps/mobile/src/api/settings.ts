import { apiRequest } from "@/api/client";
import type {
  MobileSettingsResponse,
  MobileSettingsWriteRequest,
} from "@/types/api";

export function mobileSettingsQueryKey(userId?: string | null) {
  return ["settings", userId ?? "guest"] as const;
}

export function fetchSettings() {
  return apiRequest<MobileSettingsResponse>("/api/mobile/settings");
}

export function saveSettings(input: MobileSettingsWriteRequest) {
  return apiRequest<MobileSettingsResponse>("/api/mobile/settings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
