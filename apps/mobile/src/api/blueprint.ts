import { apiRequest } from "@/api/client";
import type {
  GenerateBlueprintResponse,
  MobileBlueprintResponse,
} from "@/types/api";

export function mobileBlueprintQueryKey(userId?: string | null) {
  return ["blueprint", userId ?? "guest"] as const;
}

export function fetchBlueprint() {
  return apiRequest<MobileBlueprintResponse>("/api/mobile/blueprint");
}

export function generateBlueprint() {
  return apiRequest<GenerateBlueprintResponse>("/api/generate-blueprint", {
    method: "POST",
    timeoutMs: 90_000,
  });
}
