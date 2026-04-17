import { apiRequest } from "@/api/client";
import type {
  GenerateAskRequest,
  GenerateAskResponse,
  MobileAskDetailResponse,
  MobileAskResponse,
  SubmitDecisionFeedbackRequest,
  SubmitDecisionFeedbackResponse,
} from "@/types/api";

export function mobileAskQueryKey(userId?: string | null) {
  return ["ask", "latest", userId ?? "guest"] as const;
}

export function mobileAskDetailQueryKey(id: string) {
  return ["ask", "detail", id] as const;
}

export function fetchAskHome() {
  return apiRequest<MobileAskResponse>("/api/mobile/ask");
}

export function fetchAskById(id: string) {
  return apiRequest<MobileAskDetailResponse>(`/api/mobile/ask/${id}`);
}

export function generateAsk(input: GenerateAskRequest) {
  return apiRequest<GenerateAskResponse>("/api/generate-decision-guidance", {
    method: "POST",
    body: JSON.stringify(input),
    timeoutMs: 90_000,
  });
}

export function submitAskFeedback(input: SubmitDecisionFeedbackRequest) {
  return apiRequest<SubmitDecisionFeedbackResponse>(
    "/api/submit-decision-feedback",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}
