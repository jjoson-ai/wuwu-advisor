import { apiRequest } from "@/api/client";
import type {
  GenerateTodayResponse,
  MobileTodayResponse,
  SubmitTodayFeedbackRequest,
  SubmitTodayFeedbackResponse,
} from "@/types/api";

export function mobileTodayQueryKey(userId?: string | null) {
  return ["today", userId ?? "guest"] as const;
}

export function fetchToday() {
  return apiRequest<MobileTodayResponse>("/api/mobile/today");
}

export function generateToday() {
  return apiRequest<GenerateTodayResponse>("/api/generate-briefing", {
    method: "POST",
    timeoutMs: 90_000,
  });
}

export function submitTodayFeedback(input: SubmitTodayFeedbackRequest) {
  return apiRequest<SubmitTodayFeedbackResponse>("/api/submit-feedback", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
