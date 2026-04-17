export const DECISION_INTENTS = [
  "whether_decision",
  "timing_decision",
  "sizing_decision",
  "conversation_decision",
  "strategy_decision",
  "mixed",
  "unclear",
] as const;

export type DecisionIntent = (typeof DECISION_INTENTS)[number];

const INTENT_PATTERNS: Array<{
  intent: Exclude<DecisionIntent, "mixed" | "unclear">;
  patterns: RegExp[];
}> = [
  {
    intent: "timing_decision",
    patterns: [
      /\bwhen\b/i,
      /\bnow or later\b/i,
      /\btonight or later\b/i,
      /\bthis week or next\b/i,
      /\bthis month or next\b/i,
      /\bnot yet\b/i,
      /\bwhat time\b/i,
    ],
  },
  {
    intent: "sizing_decision",
    patterns: [
      /\bhow much\b/i,
      /\bhow big\b/i,
      /\bfull or partial\b/i,
      /\bpartial or full\b/i,
      /\bstage(?:d| in)?\b/i,
      /\bsize\b/i,
      /\bcap\b/i,
      /\ballocat(?:e|ion)\b/i,
      /\bfull position\b/i,
      /\bexposure\b/i,
    ],
  },
  {
    intent: "conversation_decision",
    patterns: [
      /\bbring this up\b/i,
      /\bhow should i say\b/i,
      /\bhow do i say\b/i,
      /\bhow should i talk\b/i,
      /\bshould i tell\b/i,
      /\bshould i ask\b/i,
      /\bconversation\b/i,
      /\btalk to\b/i,
      /\bdiscuss\b/i,
      /\bopen with\b/i,
    ],
  },
  {
    intent: "strategy_decision",
    patterns: [
      /\bstrategy\b/i,
      /\bapproach\b/i,
      /\bdirection\b/i,
      /\bplan\b/i,
      /\broadmap\b/i,
      /\bpositioning\b/i,
      /\bpricing model\b/i,
      /\bmonetization\b/i,
      /\bbigger picture\b/i,
    ],
  },
  {
    intent: "whether_decision",
    patterns: [
      /\bshould i\b/i,
      /\bdo i\b/i,
      /\bis it worth\b/i,
      /\bgo or not\b/i,
      /\bmove forward\b/i,
      /\bproceed\b/i,
    ],
  },
];

export function classifyDecisionIntent(question: string): DecisionIntent {
  const normalized = question.trim();

  if (normalized === "") {
    return "unclear";
  }

  const matchedIntents = new Set<Exclude<DecisionIntent, "mixed" | "unclear">>();

  for (const entry of INTENT_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      matchedIntents.add(entry.intent);
    }
  }

  if (matchedIntents.size === 0) {
    return "unclear";
  }

  if (matchedIntents.size === 1) {
    return [...matchedIntents][0];
  }

  // Conversation questions often also contain "should I". Keep the more specific intent.
  if (matchedIntents.has("conversation_decision")) {
    return "conversation_decision";
  }

  // Timing and sizing are more specific than a generic whether-decision.
  if (
    matchedIntents.size === 2 &&
    matchedIntents.has("whether_decision") &&
    matchedIntents.has("timing_decision")
  ) {
    return "timing_decision";
  }

  if (
    matchedIntents.size === 2 &&
    matchedIntents.has("whether_decision") &&
    matchedIntents.has("sizing_decision")
  ) {
    return "sizing_decision";
  }

  if (
    matchedIntents.size === 2 &&
    matchedIntents.has("whether_decision") &&
    matchedIntents.has("strategy_decision")
  ) {
    return "strategy_decision";
  }

  return "mixed";
}
