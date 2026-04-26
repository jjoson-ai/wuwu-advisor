/**
 * Shared prompt safety rules injected into every LLM system prompt.
 *
 * Three independent rule groups:
 *
 * 1. FINANCIAL_SAFETY_RULES — hard-forbid specific financial instruments,
 *    transaction timing, and dollar amounts. Money guidance is mood / timing /
 *    mindset framing only. Apply to ALL generation surfaces.
 *
 * 2. LIFE_DECISION_COACH_RULES — mandatory Decision Coach template for
 *    irreversible life-decision framings ("leave partner", "quit job", "break up",
 *    "divorce", major move). Reflective, not directive. Apply to Ask + Ask follow-up.
 *
 * 3. CULT_PHRASE_RULES — deny-list for fate/destiny/cosmic-inevitability
 *    language ("destined to", "meant to be", "the universe wants you to", etc.).
 *    Applies to ALL generation surfaces. See roadmap 3.0.2 / parking-lot
 *    escalation for rationale — cult-adjacent phrasing erodes user agency and
 *    conflicts with the brand promise "Wuwu helps you think. You decide."
 *
 * Brand promise: Wuwu helps you think. You decide.
 *
 * See roadmap 1.9 for rationale — lawsuit-wave hedge against Character.AI /
 * Replika / Adam-Raine case pattern. Prescriptive framing ("actually tells you
 * what to do") raises the bar; these rules bring the voice back to reflection
 * on the genuinely high-stakes surfaces.
 */

export const FINANCIAL_SAFETY_RULES: ReadonlyArray<string> = [
  "Never recommend specific investments, securities, crypto, stocks, funds, ETFs, bonds, options, or financial products by name or ticker.",
  "Never name specific dollar amounts, percentages of net worth, position sizes in currency, or transaction timing such as buy Tuesday, sell before Friday, enter at this price, or exit at this level.",
  "Never recommend specific account types, brokerages, banks, lenders, or financial institutions.",
  "Money guidance is mood, timing posture, and mindset framing only — never investment advice.",
  "Prefer reflection verbs over action verbs. Use notice, consider, observe, sit with, journal, revisit, clarify, name the tradeoff instead of buy, invest, move money, transfer, liquidate, enter, exit.",
  "If the user asks for a specific asset, ticker, allocation, or entry point, redirect to how their chart frames risk tolerance, timing, and clarity — and recommend speaking to a licensed financial advisor for the specific decision.",
  "Do not make predictions about market direction, asset performance, or specific financial outcomes.",
];

export const LIFE_DECISION_COACH_RULES: ReadonlyArray<string> = [
  "If the question contains irreversible life-decision framing — leaving or ending a relationship, divorce, quitting a job without a plan, breaking up, cutting off family, selling a home, relocating across the country, having a child, ending a pregnancy, or disclosing something life-changing — enter Decision Coach mode.",
  "In Decision Coach mode: do NOT render a directive verdict. Do not tell the user to leave, stay, quit, end it, cut them off, go through with it, or not.",
  "Instead: first, reflect the tension the user stated back to them in one sentence so they feel heard.",
  "Second, surface two or three chart-based considerations that speak to the shape of the tension — not the verdict. Describe pattern, timing, or pacing, not what to do.",
  "Third, explicitly say: I won't decide this for you. Here are three questions to sit with. Then pose three concrete, specific questions grounded in their situation that help them surface their own answer.",
  "Fourth, recommend the appropriate human professional for the domain — therapist, couples counselor, lawyer, career coach, financial advisor, doctor — depending on what the life decision touches.",
  "Never use language that implies fate, destiny, or cosmic inevitability for these decisions. The user is the decider, not the chart.",
  "The brand promise is: Wuwu helps you think. You decide. Honor that promise explicitly in Decision Coach mode.",
];

/**
 * Deny-list for fate/destiny/cosmic-inevitability language.
 * Applies to ALL generation surfaces (Today, Forecast, Blueprint, Ask, Decision).
 *
 * Rationale: phrases like "destined to", "the universe wants you to", or
 * "written in the stars" imply the user's outcome is predetermined — eroding
 * agency and pushing toward the prescriptive framing that raises liability risk.
 * The chart describes patterns and tendencies, not fate.
 */
export const CULT_PHRASE_RULES: ReadonlyArray<string> = [
  "Never use language implying the user's outcome is fated, destined, or cosmically predetermined. Forbidden phrases include: 'destined to', 'meant to be', 'written in the stars', 'fated to', 'the universe wants you to', 'the cosmos has decided', 'the stars have chosen', 'your destiny is', 'it was always going to be this way', 'cosmically inevitable'. If a draft sentence contains any of these, rewrite it.",
  "The chart describes patterns, tendencies, and timing — not fixed fate. Frame chart observations as lenses on energy or pattern (e.g. 'your chart suggests…', 'this transit often correlates with…') rather than decrees. Never write 'the stars say you should' or 'the planets are telling you to'.",
];

/**
 * Voice discipline rules — UX audit F-11 + F-12 (2026-04-26).
 *
 * F-11 — Hedge cap. Stacked hedges read as the model not believing itself
 *   and corrode the trust the rest of the voice builds. One hedge max per
 *   response; if the answer genuinely depends on uncertainty, say it once
 *   and commit to the rest.
 *
 * F-12 — Jargon pairing. Astrology terms (transit, square, trine,
 *   retrograde, house, etc.) must be paired with a plain-English gloss
 *   on first use in any response. After first use the term may stand alone.
 */
export const VOICE_DISCIPLINE_RULES: ReadonlyArray<string> = [
  "Use at most ONE hedge per response. Hedges include: might, could, perhaps, maybe, possibly, it's possible that, there's a chance, it depends, roughly, around, sort of, kind of. If the answer genuinely depends on a hedged judgment, say it once and then commit to the rest of the answer with confidence. Stacked hedges (two or more in the same response) read as the model not believing itself.",
  "When you use astrology jargon — transit, progression, aspect, square, trine, conjunction, retrograde, house, cusp, ingress, stellium — pair it with a plain-English gloss on first use in the response. For example: 'Mercury squaring Saturn — a friction angle that often correlates with communication delays' or 'a Saturn-Pluto square (a 90° tension that asks for restructuring)'. After the first paired use, the term may stand alone. End-of-response jargon without a gloss is especially confusing — never finish on un-glossed jargon.",
];

/**
 * Hedge list (F-11). Used by countHedges() and the verifier.
 * Lowercase, word-boundary regex matching.
 */
const HEDGE_TERMS: ReadonlyArray<string> = [
  "might",
  "could",
  "perhaps",
  "maybe",
  "possibly",
  "it's possible that",
  "there's a chance",
  "it depends",
  "roughly",
  "around",
  "sort of",
  "kind of",
];

/**
 * Astrology-jargon list (F-12). Terms that should be paired with a
 * plain-English gloss on first use in any response.
 */
const JARGON_TERMS: ReadonlyArray<string> = [
  "transit",
  "progression",
  "aspect",
  "square",
  "trine",
  "conjunction",
  "retrograde",
  "house",
  "cusp",
  "ingress",
  "stellium",
];

/**
 * Word-boundary regex for a list of phrases. Phrases with internal
 * whitespace are matched verbatim against the phrase boundaries.
 */
function buildBoundaryRegex(terms: ReadonlyArray<string>): RegExp {
  const escaped = terms.map((term) =>
    term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return new RegExp(`\\b(?:${escaped.join("|")})\\b`, "gi");
}

const HEDGE_REGEX = buildBoundaryRegex(HEDGE_TERMS);
const JARGON_REGEX = buildBoundaryRegex(JARGON_TERMS);

/**
 * Count hedges in `text`. Lowercase, word-boundary, multi-word phrases
 * supported. F-11: warn at 2, treat 3+ as a strong signal of voice drift.
 */
export function countHedges(text: string): number {
  if (typeof text !== "string" || text.trim() === "") return 0;
  const matches = text.toLowerCase().match(HEDGE_REGEX);
  return matches === null ? 0 : matches.length;
}

/**
 * Find astrology-jargon occurrences whose first use is NOT paired with a
 * plain-English gloss. Heuristic: a "gloss" is detected when, within ±60
 * characters of the jargon's first use, any of the following appears:
 *   - an em-dash followed by lowercase prose ("— a friction angle…")
 *   - a parenthetical ("(a 90° tension…)")
 *   - the words "meaning", "i.e.", "that is", "which is", or "(the"
 *
 * Returns the list of jargon terms whose first use looked un-glossed.
 * F-12 spec: log only, do not block — this is a heuristic and will have
 * false positives. Use the log to refine.
 */
export function findUnglossedJargon(text: string): ReadonlyArray<string> {
  if (typeof text !== "string" || text.trim() === "") return [];
  const lower = text.toLowerCase();

  const glossSignals = [
    /—\s+(?:a |the |an )?[a-z]/, // em-dash followed by lowercase
    /\([^)]*\b(?:angle|tension|alignment|relationship|placement|window|cycle|degree|orb|crossing|moment|period|configuration|pattern)\b[^)]*\)/,
    /\b(?:meaning|i\.e\.|that is|which is|in plain terms|put plainly)\b/,
  ];

  const seen = new Set<string>();
  const unglossed: string[] = [];

  // Find first occurrence of each jargon term (case-insensitive).
  for (const term of JARGON_TERMS) {
    const termRegex = new RegExp(`\\b${term}\\b`, "i");
    const match = termRegex.exec(text);
    if (match === null) continue;
    if (seen.has(term)) continue;
    seen.add(term);

    const idx = match.index;
    const windowStart = Math.max(0, idx - 60);
    const windowEnd = Math.min(text.length, idx + match[0].length + 60);
    const window = lower.slice(windowStart, windowEnd);

    const hasGloss = glossSignals.some((signal) => signal.test(window));
    if (!hasGloss) {
      unglossed.push(term);
    }
  }

  return unglossed;
}

/**
 * Lightweight regex classifier for irreversible life-decision framings.
 * Used for telemetry + potential deterministic reinforcement. The prompt
 * rules above also instruct the LLM to detect this from question text
 * directly, so this classifier is a belt-and-suspenders signal, not a
 * hard gate.
 */
const LIFE_STAKES_PATTERNS: ReadonlyArray<RegExp> = [
  // Leaving a partner: either "leave my husband/partner/..." (relationship
  // noun) or bare "leave him/her/them" (partner-coded pronoun). The bare
  // pronoun form can occasionally over-fire on non-partner contexts ("should
  // I leave him at the park"); that's acceptable — over-applying Decision
  // Coach voice is a safer failure mode than under-detecting a partner-exit
  // question.
  /\bleav(?:e|ing) (?:my|his|her|their|the|this|a)\s+(?:husband|wife|partner|boyfriend|girlfriend|spouse|fiance|fiancee|marriage|relationship)\b/i,
  /\bleav(?:e|ing)\s+(?:him|her|them)\b/i,
  /\b(?:break ?up|broke up|breaking up) with\b/i,
  /\bdivorce\b/i,
  /\bend (?:my|this|the|our) (?:marriage|relationship|engagement)\b/i,
  /\bshould i (?:quit|resign|leave) my job\b/i,
  /\bquit(?:ting)? (?:my|this|the) (?:job|career)\b/i,
  // Family/friend cutoff: "cut off my mother", "cutting off my father", or
  // bare "cut them off".
  /\bcut(?:ting)?\s+(?:off|out)\s+(?:my|his|her|their|him|her|them)\b/i,
  /\bmove (?:to|across|out|away|back|abroad)\b/i,
  /\brelocat(?:e|ing)\b/i,
  /\bsell(?:ing)? (?:my|the|our) (?:house|home|apartment)\b/i,
  /\bhave (?:a|another) (?:baby|child|kid)\b/i,
  /\bget pregnant\b/i,
  /\bend(?:ing)? (?:my|this|the) pregnancy\b/i,
  /\babortion\b/i,
  /\bcome out (?:to|as)\b/i,
  /\btell (?:my|his|her|their)\b.{0,40}\b(?:affair|cheating|debt|diagnosis|addiction)\b/i,
];

export function isLifeStakesQuestion(question: string): boolean {
  const normalized = question.trim();
  if (normalized === "") return false;
  return LIFE_STAKES_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Join rules into the same format used by existing system prompts
 * (double-newline separated, matching buildSharedSystemRules et al).
 */
export function joinSafetyRules(rules: ReadonlyArray<string>): string {
  return rules.join("\n\n");
}
