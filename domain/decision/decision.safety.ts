export const DECISION_SAFETY_CATEGORIES = [
  "normal",
  "self_harm",
  "harm_to_others",
  "illegal_wrongdoing",
] as const;

export type DecisionSafetyCategory = (typeof DECISION_SAFETY_CATEGORIES)[number];

export const DECISION_SAFETY_MODES = [
  "crisis_support",
  "violence_prevention",
  "refusal_safe_redirect",
] as const;

export type DecisionSafetyMode = (typeof DECISION_SAFETY_MODES)[number];

export type DecisionSafetyResponse = {
  mode: DecisionSafetyMode;
  headline: string;
  message: string;
  urgent_action: string;
  resources: string[];
};

const BENIGN_PATTERNS = [
  /\breport(?:ing)? a crime\b/i,
  /\bhow do i report\b/i,
  /\bhow do i stay safe\b/i,
  /\bhow do i protect myself\b/i,
  /\bhow do i leave\b.*\babuse\b/i,
  /\bescaping abuse\b/i,
  /\bavoid(?:ing)? victimization\b/i,
  /\blegal\b/i,
  /\bcompliance\b/i,
  /\bwhat is legal\b/i,
  /\bhow do i stop\b/i,
  /\bhow do i prevent\b/i,
  /\bemergency help\b/i,
];

const SELF_HARM_PATTERNS = [
  /\bkill myself\b/i,
  /\bend my life\b/i,
  /\bsuicide\b/i,
  /\bwant to die\b/i,
  /\bhurt myself\b/i,
  /\bself[- ]harm\b/i,
  /\bshould i die\b/i,
];

const HARM_OTHERS_PATTERNS = [
  /\bkill (him|her|them|someone|my|a)\b/i,
  /\bhurt (him|her|them|someone|my|a)\b/i,
  /\bstab (him|her|them|someone|my|a)\b/i,
  /\bshoot (him|her|them|someone|my|a)\b/i,
  /\battack (him|her|them|someone|my|a)\b/i,
  /\bhow do i (hurt|kill|stab|shoot|attack)\b/i,
  /\bshould i (hurt|kill|stab|shoot|attack)\b/i,
];

const ILLEGAL_WRONGDOING_PATTERNS = [
  /\bhow do i (steal|rob|scam|hack|fraud|embezzle|shoplift)\b/i,
  /\bshould i (steal|rob|scam|hack|fraud|shoplift)\b/i,
  /\bhow can i (break into|launder money|evade taxes|forge|counterfeit)\b/i,
  /\bhelp me (steal|hack|scam|fraud|rob)\b/i,
  /\bhide (a crime|illegal money|evidence)\b/i,
  /\bget away with\b/i,
];

function matchesAny(question: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(question));
}

export function classifyDecisionSafety(
  question: string,
): DecisionSafetyCategory {
  const normalized = question.trim();

  if (normalized === "") {
    return "normal";
  }

  if (matchesAny(normalized, BENIGN_PATTERNS)) {
    return "normal";
  }

  if (matchesAny(normalized, SELF_HARM_PATTERNS)) {
    return "self_harm";
  }

  if (matchesAny(normalized, HARM_OTHERS_PATTERNS)) {
    return "harm_to_others";
  }

  if (matchesAny(normalized, ILLEGAL_WRONGDOING_PATTERNS)) {
    return "illegal_wrongdoing";
  }

  return "normal";
}

export function buildDecisionSafetyResponse(
  category: Exclude<DecisionSafetyCategory, "normal">,
): DecisionSafetyResponse {
  switch (category) {
    case "self_harm":
      return {
        mode: "crisis_support",
        headline: "Get immediate human support now",
        message:
          "I can’t help with self-harm. If you might act on this soon, contact emergency services now or go to the nearest emergency department. If you can, tell a trusted person to stay with you and remove anything you could use to hurt yourself.",
        urgent_action:
          "Contact emergency help now if the risk is immediate, or reach a crisis line and a trusted person right away.",
        resources: [
          "US and Canada: Call or text 988 for the Suicide & Crisis Lifeline.",
          "Spain: Call 024 for suicide crisis support.",
          "If you are elsewhere, contact local emergency services now.",
        ],
      };
    case "harm_to_others":
      return {
        mode: "violence_prevention",
        headline: "Step away from the situation immediately",
        message:
          "I can’t help with harming someone. Put distance between yourself and the person or situation now. If there is any weapon or means nearby, move away from it or put it out of reach. Contact emergency services or a trusted person immediately if you may act on this.",
        urgent_action:
          "Leave the situation, create distance, and contact emergency help or a trusted person right now if risk is immediate.",
        resources: [
          "Call local emergency services if someone may be in immediate danger.",
          "Contact a trusted friend, family member, or crisis line and say you need immediate support not to act.",
        ],
      };
    case "illegal_wrongdoing":
      return {
        mode: "refusal_safe_redirect",
        headline: "I can’t help with committing or hiding illegal harm",
        message:
          "I can’t help plan, optimize, time, or conceal illegal wrongdoing. Step back from the act and choose a lawful alternative. If the underlying issue is pressure, money, conflict, or fear, address that problem directly instead of taking the illegal route.",
        urgent_action:
          "Do not move forward with the illegal act. Pause and choose a lawful next step instead.",
        resources: [
          "If this involves financial pressure, focus on legal options like payment plans, negotiation, or professional advice.",
          "If this involves conflict or fear, contact a trusted person, lawyer, counselor, or appropriate emergency support.",
        ],
      };
  }
}
