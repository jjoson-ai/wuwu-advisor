export const DECISION_FEASIBILITY_STATES = [
  "normal",
  "feasibility_sensitive",
] as const;

export type DecisionFeasibility = (typeof DECISION_FEASIBILITY_STATES)[number];

const FEASIBILITY_PATTERNS = [
  /\brun for\b/i,
  /\bcandid(?:acy|ate)\b/i,
  /\belection\b/i,
  /\boffice\b/i,
  /\bsenator\b/i,
  /\bmayor\b/i,
  /\bgovernor\b/i,
  /\bpresident\b/i,
  /\blicen(?:se|sed|sing)\b/i,
  /\bcertif(?:ication|ied|y)\b/i,
  /\bpermit\b/i,
  /\bvisa\b/i,
  /\bimmigration\b/i,
  /\bgreen card\b/i,
  /\bcitizen(?:ship)?\b/i,
  /\brelocat(?:e|ion)\b/i,
  /\blegal status\b/i,
  /\beligible\b/i,
  /\beligibility\b/i,
  /\bqualif(?:y|ication|ied)\b/i,
  /\bapproval\b/i,
  /\bcompliance\b/i,
  /\bregulat(?:ed|ion|ory)\b/i,
  /\bfunding\b/i,
  /\braise money\b/i,
  /\bhire\b/i,
  /\bpublic office\b/i,
];

export function classifyDecisionFeasibility(
  question: string,
): DecisionFeasibility {
  const normalized = question.trim();

  if (normalized === "") {
    return "normal";
  }

  return FEASIBILITY_PATTERNS.some((pattern) => pattern.test(normalized))
    ? "feasibility_sensitive"
    : "normal";
}
