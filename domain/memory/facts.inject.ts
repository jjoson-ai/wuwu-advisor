import type { MatchedFact } from "@/domain/memory/facts.schema";

/**
 * Formats retrieved facts into a prompt block injected into the user prompt
 * (not system prompt — keeps the system prompt cache-stable).
 *
 * The instruction block:
 *  - Tells the model what the facts are and where they came from.
 *  - Instructs the model to use them where relevant, not cite them verbatim.
 *  - Adds a "do not invent or embellish" safeguard.
 *  - Instructs the model to ask a clarifying question if the current question
 *    contradicts a remembered fact.
 *
 * Returns an empty string when there are no facts to inject, so callers can
 * safely concatenate without extra whitespace.
 */
export function formatFactsForPrompt(facts: MatchedFact[]): string {
  if (facts.length === 0) return "";

  const lines = facts.map((f) => `- [${f.fact_category}] ${f.fact_text}`);

  return [
    "Context from previous conversations (remembered facts about this user):",
    ...lines,
    "",
    "Instructions for using remembered facts:",
    "Use these facts to personalise the response where they are genuinely relevant to the question.",
    "Do not mention, quote, or recite the facts directly unless the user refers to them.",
    "Do not invent, embellish, or extend any fact beyond what is listed.",
    "If the user's current question appears to contradict a remembered fact, acknowledge the change briefly before proceeding.",
  ].join("\n");
}
