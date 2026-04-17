import type { DecisionType } from "@/domain/decision/decision.classifier";

export const DECISION_HORIZONS = [
  "immediate",
  "short_term",
  "medium_term",
  "strategic",
] as const;

export type DecisionHorizon = (typeof DECISION_HORIZONS)[number];

type ContextEmphasis = {
  primary: string[];
  secondary: string[];
  guidance: string;
};

const IMMEDIATE_PATTERNS = [
  /\b(today|tonight|right now|immediately|this afternoon|this evening|tomorrow|now)\b/i,
];

const SHORT_TERM_PATTERNS = [
  /\b(this week|next few days|in a few days|soon|later this week|this weekend)\b/i,
];

const MEDIUM_TERM_PATTERNS = [
  /\b(this month|next month|current phase|this phase|coming weeks|over the next few weeks|this season)\b/i,
];

const STRATEGIC_PATTERNS = [
  /\b(strategy|strategic|direction|pivot|business model|monetization|pricing strategy|roadmap|quarter|long term|long-term|structural|bigger picture)\b/i,
];

function matchesAny(question: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(question));
}

export function classifyDecisionHorizon(
  question: string,
  decisionType: DecisionType,
): DecisionHorizon {
  const normalized = question.trim();

  if (matchesAny(normalized, IMMEDIATE_PATTERNS)) {
    return "immediate";
  }

  if (matchesAny(normalized, SHORT_TERM_PATTERNS)) {
    return "short_term";
  }

  if (matchesAny(normalized, MEDIUM_TERM_PATTERNS)) {
    return "medium_term";
  }

  if (matchesAny(normalized, STRATEGIC_PATTERNS)) {
    return "strategic";
  }

  switch (decisionType) {
    case "business_product":
      return "strategic";
    case "money_investing":
      return "medium_term";
    case "career":
      return "medium_term";
    case "relationships":
      return "short_term";
    case "health_wellbeing":
      return "short_term";
    case "personal_life":
      return "short_term";
    default:
      return "medium_term";
  }
}

export function getContextEmphasis(
  horizon: DecisionHorizon,
): ContextEmphasis {
  switch (horizon) {
    case "immediate":
      return {
        primary: [
          "latest Daily Briefing",
          "current astrology context",
          "current numerology context",
        ],
        secondary: ["latest Forecast", "latest Birth Blueprint"],
        guidance:
          "Treat today's emotional and pacing context as highly relevant because the question is near-immediate.",
      };
    case "short_term":
      return {
        primary: ["latest Daily Briefing", "latest Forecast"],
        secondary: ["latest Birth Blueprint", "stable profile context"],
        guidance:
          "Blend today's tone with the next few days or this week's pattern without letting one single day dominate completely.",
      };
    case "medium_term":
      return {
        primary: ["latest Forecast", "stable profile context"],
        secondary: ["latest Daily Briefing", "current astrology context"],
        guidance:
          "Treat the forecast and stable profile as the main frame. Use daily context only as light supporting color, not as the main driver.",
      };
    case "strategic":
      return {
        primary: [
          "latest Birth Blueprint",
          "latest Forecast",
          "stable astrology, numerology, and Chinese astrology profile context",
        ],
        secondary: ["latest Daily Briefing", "current astrology context"],
        guidance:
          "Do not let today's mood dominate. Focus on direction, reversibility, evidence, structure, and the user's broader operating pattern.",
      };
  }
}
