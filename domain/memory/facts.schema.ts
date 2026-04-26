import { z } from "zod";

export const FACT_CATEGORIES = [
  "relational",
  "situational",
  "identity",
  "ongoing_decision",
  "preference",
] as const;

export type FactCategory = (typeof FACT_CATEGORIES)[number];

export const ExtractedFactSchema = z.object({
  fact_text: z.string().min(1).max(200),
  category: z.enum(FACT_CATEGORIES),
  evidence_quote: z.string().min(1).max(400),
  confidence: z.number().min(0.7).max(1.0),
});

export type ExtractedFact = z.infer<typeof ExtractedFactSchema>;

export const ExtractionOutputSchema = z.object({
  facts: z.array(ExtractedFactSchema),
});

export type FactRow = {
  id: string;
  user_id: string;
  source_conversation_id: string | null;
  fact_text: string;
  fact_category: FactCategory;
  evidence_quote: string;
  confidence: number;
  extracted_at: string;
  last_referenced_at: string | null;
  superseded_by: string | null;
  user_deleted_at: string | null;
};

export type MatchedFact = {
  id: string;
  fact_text: string;
  fact_category: string;
  evidence_quote: string;
  confidence: number;
  extracted_at: string;
  similarity: number;
};
