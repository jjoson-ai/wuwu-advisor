export type GenerationPass = "extract" | "compose" | "synthesize";
export type LlmProvider = "openai" | "anthropic";

export type RoutedModel = {
  provider: LlmProvider;
  model: string;
};

export function getModelForPass(pass: GenerationPass): RoutedModel {
  if (pass === "extract") {
    return { provider: "anthropic", model: "claude-haiku-4-5-20251001" };
  }

  if (pass === "compose") {
    return { provider: "anthropic", model: "claude-sonnet-4-6" };
  }

  return { provider: "anthropic", model: "claude-opus-4-7" };
}
