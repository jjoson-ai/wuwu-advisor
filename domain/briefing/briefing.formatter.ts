import {
  FinalSynthesisOutputSchema,
  type FinalSynthesisOutput,
} from "@/domain/astrology/schemas";
import type {
  DailyBriefingRow,
  FormattedDailyBriefing,
} from "@/domain/briefing/briefing.types";
import { sanitizeForbiddenInternalTermsInUserOutput } from "@/lib/output-safety";

function parseSynthesisPayload(payload: unknown): FinalSynthesisOutput {
  const output = FinalSynthesisOutputSchema.parse(payload);
  return sanitizeForbiddenInternalTermsInUserOutput(output);
}

export function formatBriefingForDashboard(
  briefing: DailyBriefingRow,
): FormattedDailyBriefing {
  const synthesis = parseSynthesisPayload(briefing.synthesis_payload_json);

  return {
    id: briefing.id,
    date: synthesis.date,
    confidence: synthesis.confidence,
    executive_summary: synthesis.executive_summary,
    decision_of_day: synthesis.decision_of_day,
    cards: synthesis.cards,
    timing: synthesis.timing,
    micro_claim: synthesis.micro_claim,
    generation_access_level: briefing.generation_access_level,
    created_at: briefing.created_at,
  };
}
