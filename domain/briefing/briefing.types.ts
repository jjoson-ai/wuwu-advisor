import type { AccessLevel } from "@/lib/access";
import type { AstrologyContext } from "@/domain/astrology/context";
import type { FinalSynthesisOutput } from "@/domain/astrology/schemas";
import type { NumerologyGenerationData } from "@/domain/numerology/numerology.agent";
import type { FreeAstroDailyContext } from "@/lib/freeastroapi";

export type DailyBriefingRow = {
  id: string;
  user_id: string;
  briefing_date: string;
  astrology_context_json: AstrologyContext | null;
  numerology_context_json: NumerologyGenerationData | null;
  freeastro_context_json: FreeAstroDailyContext | null;
  western_payload_json: unknown;
  timing_payload_json: unknown;
  synthesis_payload_json: FinalSynthesisOutput;
  generation_access_level: AccessLevel | null;
  created_at: string;
};

export type FormattedDailyBriefing = {
  id: string;
  date: string;
  confidence: FinalSynthesisOutput["confidence"];
  executive_summary: string;
  decision_of_day: FinalSynthesisOutput["decision_of_day"];
  cards: FinalSynthesisOutput["cards"];
  timing: FinalSynthesisOutput["timing"];
  micro_claim: FinalSynthesisOutput["micro_claim"];
  generation_access_level: AccessLevel | null;
  created_at: string;
};
