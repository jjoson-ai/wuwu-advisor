import { z } from "zod";

import type { Blueprint } from "@/domain/blueprint/blueprint.types";
import type { FinalSynthesisOutput } from "@/domain/astrology/schemas";
import type { EvalUsage } from "@/lib/eval-providers";

export const ComparisonReportTypeSchema = z.enum(["daily", "blueprint"]);
export type ComparisonReportType = z.infer<typeof ComparisonReportTypeSchema>;

export const ComparisonProviderSchema = z.enum([
  "openai",
  "gemini",
  "anthropic",
  "deepseek",
]);
export type ComparisonProvider = z.infer<typeof ComparisonProviderSchema>;

export const CandidateModelSchema = z.enum([
  "gpt-5.4",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
]);
export type CandidateModel = z.infer<typeof CandidateModelSchema>;

export const ScorerModelSchema = z.enum([
  "gpt-5.4",
  "gemini-3.1-pro-preview",
]);
export type ScorerModel = z.infer<typeof ScorerModelSchema>;

export type ComparisonModelConfig = {
  provider: ComparisonProvider;
  model: CandidateModel;
  enabled: boolean;
};

export type ScorerModelConfig = {
  provider: ComparisonProvider;
  model: ScorerModel;
  enabled: boolean;
};

export type ComparisonStageResult = {
  stage: "western" | "timing" | "synthesis" | "blueprint";
  schemaName: string;
  systemPrompt: string;
  userPrompt: string;
  rawText: string | null;
  parsedJson: unknown | null;
  validatedOutput: unknown | null;
  validationError: string | null;
  latencyMs: number | null;
  usage: EvalUsage | null;
  estimatedCostUsd: number | null;
  error: string | null;
};

export type ComparisonCandidateResult = {
  provider: ComparisonProvider;
  model: CandidateModel;
  status: "success" | "partial" | "error";
  totalLatencyMs: number | null;
  totalUsage: EvalUsage | null;
  totalEstimatedCostUsd: number | null;
  renderedPreview: string | null;
  finalOutput: FinalSynthesisOutput | Blueprint | null;
  stages: ComparisonStageResult[];
  error: string | null;
};

const ScoreValueSchema = z.number().int().min(1).max(5);

export const DailyRubricScoresSchema = z.object({
  personalization: ScoreValueSchema,
  specificity: ScoreValueSchema,
  readability: ScoreValueSchema,
  timing_usefulness: ScoreValueSchema,
  emotional_tone: ScoreValueSchema,
  premium_feel: ScoreValueSchema,
});

export const BlueprintRubricScoresSchema = z.object({
  personalization: ScoreValueSchema,
  coherence_across_modalities: ScoreValueSchema,
  distinctiveness: ScoreValueSchema,
  clarity_for_english_speakers: ScoreValueSchema,
  practical_usefulness: ScoreValueSchema,
  premium_feel: ScoreValueSchema,
});

const DailyScoredCandidateSchema = z.object({
  model: CandidateModelSchema,
  scores: DailyRubricScoresSchema,
  summary: z.string(),
});

const BlueprintScoredCandidateSchema = z.object({
  model: CandidateModelSchema,
  scores: BlueprintRubricScoresSchema,
  summary: z.string(),
});

export const DailyJudgeOutputSchema = z.object({
  overview: z.string(),
  strongest_model: CandidateModelSchema,
  notes_for_human_review: z.array(z.string()),
  candidates: z.array(DailyScoredCandidateSchema),
});

export const BlueprintJudgeOutputSchema = z.object({
  overview: z.string(),
  strongest_model: CandidateModelSchema,
  notes_for_human_review: z.array(z.string()),
  candidates: z.array(BlueprintScoredCandidateSchema),
});

export type DailyJudgeOutput = z.infer<typeof DailyJudgeOutputSchema>;
export type BlueprintJudgeOutput = z.infer<typeof BlueprintJudgeOutputSchema>;

export type ComparisonScorerResult = {
  provider: ComparisonProvider;
  model: ScorerModel;
  status: "success" | "error";
  rawText: string | null;
  parsedJson: unknown | null;
  validatedOutput: DailyJudgeOutput | BlueprintJudgeOutput | null;
  latencyMs: number | null;
  usage: EvalUsage | null;
  estimatedCostUsd: number | null;
  error: string | null;
};

export type ComparisonDocumentData = {
  reportType: ComparisonReportType;
  generatedAt: string;
  comparedModels: ComparisonModelConfig[];
  scorersEnabled: boolean;
  enabledScorers: ScorerModelConfig[];
  normalizedInputPacket: Record<string, unknown>;
  gatingNotes: string[];
  sharedPromptContext: Array<{
    label: string;
    systemPrompt: string;
    userPrompt: string | null;
    note?: string;
  }>;
  candidateResults: ComparisonCandidateResult[];
  rubricLines: string[];
  scorerResults: ComparisonScorerResult[];
};
