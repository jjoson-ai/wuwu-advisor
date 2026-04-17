export const DECISION_TYPES = [
  "business_product",
  "career",
  "money_investing",
  "relationships",
  "health_wellbeing",
  "personal_life",
  "unclear",
] as const;

export type DecisionType = (typeof DECISION_TYPES)[number];

const KEYWORDS: Array<{
  type: Exclude<DecisionType, "unclear">;
  patterns: RegExp[];
}> = [
  {
    type: "business_product",
    patterns: [
      /\b(product|feature|launch|rollout|pricing|customer|market|validation|mvp|experiment|beta|roadmap|startup|conversion|retention|funnel|prototype|ship)\b/i,
    ],
  },
  {
    type: "career",
    patterns: [
      /\b(job|career|manager|boss|promotion|interview|offer|resign|quit|role|team|coworker|workplace|salary negotiation|performance review)\b/i,
    ],
  },
  {
    type: "money_investing",
    patterns: [
      /\b(invest|investment|stock|crypto|money|budget|spend|spending|debt|loan|mortgage|savings|saving|portfolio|buy this|sell this|financial)\b/i,
    ],
  },
  {
    type: "relationships",
    patterns: [
      /\b(partner|relationship|dating|boyfriend|girlfriend|spouse|marriage|friend|family|parents|mother|father|sibling|romance|break up|reconcile)\b/i,
    ],
  },
  {
    type: "health_wellbeing",
    patterns: [
      /\b(health|sleep|rest|burnout|stress|anxiety|therapy|exercise|workout|wellbeing|well-being|body|fatigue|recovery|doctor|medical)\b/i,
    ],
  },
  {
    type: "personal_life",
    patterns: [
      /\b(move|relocate|home|apartment|household|boundary|commitment|trip|travel|routine|habit|study|course|creative|project at home|personal)\b/i,
    ],
  },
];

export function classifyDecisionQuestion(question: string): DecisionType {
  const normalized = question.trim();

  if (normalized === "") {
    return "unclear";
  }

  const scores = new Map<DecisionType, number>();

  for (const type of DECISION_TYPES) {
    scores.set(type, 0);
  }

  for (const entry of KEYWORDS) {
    for (const pattern of entry.patterns) {
      if (pattern.test(normalized)) {
        scores.set(entry.type, (scores.get(entry.type) ?? 0) + 1);
      }
    }
  }

  let bestType: DecisionType = "unclear";
  let bestScore = 0;

  for (const [type, score] of scores.entries()) {
    if (type === "unclear") {
      continue;
    }

    if (score > bestScore) {
      bestType = type;
      bestScore = score;
    }
  }

  return bestScore === 0 ? "unclear" : bestType;
}
