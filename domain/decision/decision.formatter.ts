import {
  DecisionGuidanceSchema,
  normalizeDecisionGuidanceOutput,
} from "@/domain/decision/decision.types";
import type {
  DecisionGuidanceRow,
  FormattedDecisionGuidance,
} from "@/domain/decision/decision.types";
import { sanitizeForbiddenInternalTermsInUserOutput } from "@/lib/output-safety";

const STANCE_LABELS: Record<string, string> = {
  go: "Go",
  wait: "Wait",
  go_small: "Go small",
  avoid: "Avoid",
  unclear: "Unclear",
};

export function formatStanceLabel(stance: string): string {
  return STANCE_LABELS[stance] ?? stance;
}

export function formatDecisionGuidanceForPage(
  row: DecisionGuidanceRow,
): FormattedDecisionGuidance {
  const guidance = DecisionGuidanceSchema.parse(
    normalizeDecisionGuidanceOutput(row.guidance_json),
  );
  const safeGuidance = sanitizeForbiddenInternalTermsInUserOutput(guidance);

  return {
    id: row.id,
    generation_access_level: row.generation_access_level,
    conversation_id: row.conversation_id ?? null,
    created_at: row.created_at,
    ...safeGuidance,
  };
}
