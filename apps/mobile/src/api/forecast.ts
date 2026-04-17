import { apiRequest } from "@/api/client";
import type {
  GenerateForecastResponse,
  MobileForecastResponse,
} from "@/types/api";

export function mobileForecastQueryKey(userId?: string | null) {
  return ["forecast", userId ?? "guest"] as const;
}

export function fetchForecast() {
  return apiRequest<MobileForecastResponse>("/api/mobile/forecast");
}

export function generateForecast() {
  return apiRequest<GenerateForecastResponse>("/api/generate-forecast", {
    method: "POST",
    timeoutMs: 90_000,
  });
}
