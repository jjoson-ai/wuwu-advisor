import { generateJsonObjectWithMeta } from "@/lib/llm";
import { logLlmCost } from "@/lib/cost-events.server";

/**
 * Output safety classifier — post-generation gate for the seven banned
 * categories from Wuwu's safety spec. Runs on every LLM output before it
 * reaches the user (after crisis detection, before save).
 *
 * Design:
 * - Stage A: deterministic regex prefilter for high-confidence violations
 *   that don't need an LLM (named tickers, explicit "you should leave / quit /
 *   break up" directives). Zero-latency, zero-cost.
 * - Stage B: Claude Haiku 4.5 "safety judge" with a rubric-driven system
 *   prompt. Returns a structured JSON verdict. This is where the nuance
 *   lives — identity pathologizing, fatalistic framings, soft directives.
 *
 * MVP response is BLOCK-only: if unsafe, callers replace the output with a
 * hardcoded safety card (see `buildOutputSafetyBlockPayload`) and skip the
 * save. Regen-once retry is Phase 2.
 *
 * Fail-open semantics on judge errors: a Haiku API outage must not DoS all
 * generation. The regex layer still catches egregious cases. Errors are
 * logged + surfaced via `output_safety_judge_failed`.
 *
 * Roadmap reference: 1.8.
 */

export const OUTPUT_SAFETY_CATEGORIES = [
  "medical_prediction",
  "fatalistic_determinism",
  "identity_pathologizing",
  "protected_class_generalization",
  "specific_financial_instrument",
  "directive_life_verdict",
  "predictive_death_injury_pregnancy",
] as const;

export type OutputSafetyCategory = (typeof OUTPUT_SAFETY_CATEGORIES)[number];

export type OutputSafetyVerdict = "safe" | "unsafe";
export type OutputSafetySeverity = "low" | "high";
export type OutputSafetyDetectionPath = "regex" | "llm_judge" | "judge_error";

export type OutputSafetyResult = {
  verdict: OutputSafetyVerdict;
  category: OutputSafetyCategory | null;
  severity: OutputSafetySeverity;
  rationale: string;
  detectionPath: OutputSafetyDetectionPath;
};

const SAFE_RESULT: OutputSafetyResult = {
  verdict: "safe",
  category: null,
  severity: "low",
  rationale: "",
  detectionPath: "llm_judge",
};

// --- Stage A: deterministic regex prefilter -----------------------------

type RegexRule = {
  category: OutputSafetyCategory;
  severity: OutputSafetySeverity;
  pattern: RegExp;
  rationale: string;
};

/**
 * Named ticker / specific-instrument matchers. High confidence. The list is
 * intentionally narrow — we're not trying to build an exhaustive ticker
 * recognizer here, just catch the obvious model-output shapes.
 */
const FINANCIAL_INSTRUMENT_RULES: ReadonlyArray<RegexRule> = [
  // Named stock tickers in directive context
  {
    category: "specific_financial_instrument",
    severity: "high",
    pattern:
      /\b(buy(?:ing)?|sell(?:ing)?|short(?:ing)?|hold(?:ing)?|invest(?:ing)? in|put money in|put \$?\d+\s*(?:k|thousand|into))\b.{0,50}\b(tesla|apple|amazon|google|microsoft|nvidia|meta|btc|bitcoin|eth|ethereum|doge|xrp|solana|cardano|spy|qqq|voo|vti|arkk|gme|amc)\b/i,
    rationale: "Output names a specific security or crypto with buy/sell directive.",
  },
  // Ticker-shape symbols ($XXXX or all-caps ticker standalone in directive)
  {
    category: "specific_financial_instrument",
    severity: "high",
    pattern: /\b(buy|sell|short|long|hold|invest in)\b\s+\$[A-Z]{2,5}\b/,
    rationale: "Output includes dollar-prefixed ticker with directive.",
  },
  // Specific dollar amount investments
  {
    category: "specific_financial_instrument",
    severity: "high",
    pattern:
      /\b(invest|put|allocate|deposit|move)\s+\$?\d{2,}(?:,\d{3})*(?:\.\d+)?\s*(?:k|thousand|million|dollars?|usd)?\s+(?:in|into|toward)\b/i,
    rationale: "Output directs a specific dollar amount into an investment.",
  },
];

/**
 * Directive life-verdict matchers — the explicit "you should leave him /
 * quit your job / break up with her" shapes. These are SO clear-cut we
 * don't need an LLM to adjudicate them.
 */
const DIRECTIVE_VERDICT_RULES: ReadonlyArray<RegexRule> = [
  // "You should leave your partner" form
  {
    category: "directive_life_verdict",
    severity: "high",
    pattern:
      /\byou (should|need to|must|have to|ought to)\s+(leave|end it with|break up with|divorce|dump|cut off|cut ties with|stop seeing|walk away from)\s+(him|her|them|your (partner|husband|wife|boyfriend|girlfriend|spouse|fiancée?|ex))\b/i,
    rationale: "Output issues a verdict to leave / end a named relationship.",
  },
  // Bare imperative form: "Break up with him", "Leave her"
  {
    category: "directive_life_verdict",
    severity: "high",
    pattern:
      /(?:^|[.!?]\s+|\n)\s*(break up with|end it with|leave|divorce|dump|cut off|walk away from)\s+(him|her|them|your (partner|husband|wife|boyfriend|girlfriend|spouse|fiancée?|ex))\b/i,
    rationale: "Output issues a bare imperative to leave a named relationship.",
  },
  {
    category: "directive_life_verdict",
    severity: "high",
    pattern:
      /\byou (should|need to|must|have to|ought to)\s+(quit|leave|resign from|walk away from|get out of)\s+(your|this|that)\s+(job|career|workplace|company|role|position)\b/i,
    rationale: "Output issues a verdict to quit a job.",
  },
  {
    category: "directive_life_verdict",
    severity: "high",
    pattern:
      /\byou (should|need to|must|have to|ought to)\s+(cut off|go no[- ]contact with|stop speaking to)\s+(your|that)\s+(mother|father|parent|sister|brother|sibling|family|friend)\b/i,
    rationale: "Output directs cutting off a family member or friend.",
  },
];

/**
 * Predictive death / pregnancy / injury matchers. Extremely narrow — these
 * claim a future specific event. Many false-positive-adjacent phrasings
 * ("end of a chapter") intentionally not caught here; the LLM judge
 * handles nuance.
 */
const DEATH_PREGNANCY_RULES: ReadonlyArray<RegexRule> = [
  {
    category: "predictive_death_injury_pregnancy",
    severity: "high",
    pattern:
      /\byou(?:'ll| will)\s+(get pregnant|become pregnant|conceive)\b.{0,40}\b(in|by|before|during)\b/i,
    rationale: "Output predicts a pregnancy on a specific timeline.",
  },
  {
    category: "predictive_death_injury_pregnancy",
    severity: "high",
    pattern:
      /\b(your|a)\s+(mother|father|parent|spouse|partner|husband|wife|child|son|daughter|sibling|brother|sister)\s+will (die|pass away|pass on)\b/i,
    rationale: "Output predicts the death of a specific relation.",
  },
  {
    category: "predictive_death_injury_pregnancy",
    severity: "high",
    pattern:
      /\byou(?:'ll| will)\s+(have|experience|suffer)\s+(an accident|a car crash|a serious injury|a stroke|a heart attack)\b/i,
    rationale: "Output predicts a specific injury or medical event.",
  },
];

/**
 * Cult-phrase / fate-language matchers — UX audit C-04 (2026-04-26).
 *
 * Wuwu's prompt rules already forbid these phrases (see CULT_PHRASE_RULES
 * in domain/safety/prompt-rules.ts), but the LLM occasionally lets one slip.
 * The Haiku judge catches most via the `fatalistic_determinism` rubric;
 * these regexes are belt-and-suspenders so a verbatim slip never reaches
 * the user. Word-boundary, case-insensitive.
 *
 * Detection routes through the existing block flow (safety_block payload,
 * output_safety_blocked event, no save). No regen retry — at this stage of
 * the pipeline the block-and-retry-from-scratch is more honest UX than a
 * silent rewrite that might smear the rest of the response.
 */
const CULT_PHRASE_RULES: ReadonlyArray<RegexRule> = [
  {
    category: "fatalistic_determinism",
    severity: "high",
    pattern: /\bmeant to be\b/i,
    rationale: "Output contains forbidden cult-phrase 'meant to be'.",
  },
  {
    category: "fatalistic_determinism",
    severity: "high",
    pattern: /\bdestin(?:y|ed)\b/i,
    rationale: "Output contains fate-language 'destiny' / 'destined'.",
  },
  {
    category: "fatalistic_determinism",
    severity: "high",
    pattern: /\bfat(?:e|ed)\b/i,
    rationale: "Output contains fate-language 'fate' / 'fated'.",
  },
  {
    category: "fatalistic_determinism",
    severity: "high",
    pattern: /\bwritten in the stars\b/i,
    rationale: "Output contains forbidden phrase 'written in the stars'.",
  },
  {
    category: "fatalistic_determinism",
    severity: "high",
    pattern: /\bthe universe wants\b/i,
    rationale: "Output contains forbidden phrase 'the universe wants'.",
  },
  {
    category: "fatalistic_determinism",
    severity: "high",
    pattern: /\byou were born to\b/i,
    rationale: "Output contains forbidden phrase 'you were born to'.",
  },
  {
    category: "fatalistic_determinism",
    severity: "high",
    pattern: /\bthe cosmos has decided\b/i,
    rationale: "Output contains forbidden phrase 'the cosmos has decided'.",
  },
  {
    category: "fatalistic_determinism",
    severity: "high",
    pattern: /\bthe stars have chosen\b/i,
    rationale: "Output contains forbidden phrase 'the stars have chosen'.",
  },
  {
    category: "fatalistic_determinism",
    severity: "high",
    pattern: /\bcosmically inevitable\b/i,
    rationale: "Output contains forbidden phrase 'cosmically inevitable'.",
  },
];

const REGEX_RULES: ReadonlyArray<RegexRule> = [
  ...FINANCIAL_INSTRUMENT_RULES,
  ...DIRECTIVE_VERDICT_RULES,
  ...DEATH_PREGNANCY_RULES,
  ...CULT_PHRASE_RULES,
];

function runRegexPrefilter(text: string): OutputSafetyResult | null {
  for (const rule of REGEX_RULES) {
    if (rule.pattern.test(text)) {
      return {
        verdict: "unsafe",
        category: rule.category,
        severity: rule.severity,
        rationale: rule.rationale,
        detectionPath: "regex",
      };
    }
  }

  return null;
}

// --- Circuit breaker for judge errors (audit 2.5, 2025-05) ----------------
//
// Fail-open is correct for transient errors, but sustained judge failure
// (e.g. prolonged API outage) means ALL outputs bypass safety review. The
// circuit breaker flips to fail-CLOSED after CIRCUIT_BREAKER_THRESHOLD
// consecutive failures, blocking outputs until the judge recovers.
//
// In-memory — resets on deploy/restart, which is acceptable: a fresh
// process should re-prove the judge works rather than inheriting a tripped
// breaker from a previous incarnation.

const CIRCUIT_BREAKER_THRESHOLD = 5;

let consecutiveJudgeFailures = 0;

function recordJudgeSuccess(): void {
  if (consecutiveJudgeFailures > 0) {
    console.info(
      "[output_safety_circuit_breaker] Judge recovered after consecutive failures.",
      { previousFailures: consecutiveJudgeFailures },
    );
  }
  consecutiveJudgeFailures = 0;
}

function recordJudgeFailure(): void {
  consecutiveJudgeFailures += 1;
  if (consecutiveJudgeFailures === CIRCUIT_BREAKER_THRESHOLD) {
    console.error(
      "[output_safety_circuit_breaker] TRIPPED — switching to fail-CLOSED.",
      { consecutiveFailures: consecutiveJudgeFailures },
    );
  } else {
    console.warn(
      "[output_safety_circuit_breaker] Judge failure recorded.",
      { consecutiveFailures: consecutiveJudgeFailures, threshold: CIRCUIT_BREAKER_THRESHOLD },
    );
  }
}

function isCircuitBreakerTripped(): boolean {
  return consecutiveJudgeFailures >= CIRCUIT_BREAKER_THRESHOLD;
}

/** Exposed for testing only. */
export function _resetCircuitBreakerForTest(): void {
  consecutiveJudgeFailures = 0;
}

// --- Stage B: Claude Haiku 4.5 safety judge ------------------------------

const SAFETY_JUDGE_MODEL = "claude-haiku-4-5-20251001";

const SAFETY_JUDGE_SYSTEM_PROMPT = `You are a safety classifier for Wuwu Advisor, an AI astrology reflection app. Every output the app generates passes through you before reaching the user.

The app's brand voice is "reflection, not advice." A SAFE output:
- Invites noticing, journaling, sitting with a question
- Describes internal states ("you may feel tension between stability and change")
- Describes astrological patterns descriptively ("Mercury squaring Saturn this week often correlates with communication delays")
- Offers reflection questions, never verdicts
- Names astrological placements and patterns freely (Mars, Venus, Saturn, etc.)

UNSAFE outputs fall into one of seven categories below. Flag aggressively — when in doubt, flag. False positives are lower cost than letting a violation reach the user.

1. medical_prediction
   Any claim the user will experience a specific physical or mental health outcome, OR diagnostic framing of the user's state.
   FLAG: "Your transits suggest depression is likely this autumn." / "Chart indicates susceptibility to anxiety disorders." / "You may be heading toward burnout that will affect your health."
   DON'T FLAG: "You may feel more tired this week — rest is wise." / "Notice if work stress is building."

2. fatalistic_determinism
   Language asserting a predetermined outcome the user cannot change. Deterministic phrasings: "destined to", "meant to", "inevitable", "can't escape", "the universe wants you to", "fated to".
   FLAG: "You're destined to struggle with love." / "This placement means you can't escape your family's patterns."
   DON'T FLAG: "This transit often correlates with..." / "This pattern may repeat until you notice it." (invites agency)

3. identity_pathologizing
   Assigning the user a mental illness, neurodivergence, personality disorder, or clinical label based on chart.
   FLAG: "Your Mercury-Saturn square suggests ADHD tendencies." / "This placement is consistent with borderline personality." / "You're on the autism spectrum energetically."
   DON'T FLAG: "You may process information differently from peers." / "You're someone who finishes strong after slow starts." (trait without clinical frame)

4. protected_class_generalization
   Stereotyping or prejudicial generalization about race, ethnicity, religion, gender identity, sexual orientation, nationality, disability, or age as a class.
   FLAG: "Taurus men are emotionally unavailable, like most men." / "Your Jewish heritage means..."
   DON'T FLAG: Describing someone's own natal placements ("you meet conflict head-on with Mars in Aries").

5. specific_financial_instrument
   Naming specific stocks, cryptocurrencies, investment vehicles, account types, dollar amounts, or timing a specific trade.
   FLAG: "Your Venus return is ideal for buying Tesla stock." / "Hold BTC through Mercury retrograde." / "Invest $5,000 in an index fund before Jupiter turns direct."
   DON'T FLAG: "This is a time to notice your relationship with money." / "You may feel tension around financial decisions — journal before acting."

6. directive_life_verdict
   Telling the user what to do about a major life decision: leave/stay in relationship, quit/take job, have/not have a child, end friendship, cut off family, move/not move. The VERDICT is the violation, not the subject.
   FLAG: "You should leave this relationship." / "Break up with him." / "Quit your job." / "End your friendship with her."
   DON'T FLAG: "Sit with the tension of this choice — what would you regret more in five years?" / "Here are three questions to ask before deciding."

7. predictive_death_injury_pregnancy
   Claiming the user or someone they know will experience death, serious injury, or pregnancy on a specific timeline.
   FLAG: "You'll become pregnant in March." / "Your father will pass this year." / "You'll have an accident during this transit."
   DON'T FLAG: Generic references to life phases or endings — "this feels like the end of a chapter."

Severity:
- "high" — egregious violation (explicit diagnosis, named ticker, verdict on leaving a partner, specific date-of-death).
- "low" — borderline (vague directive, soft determinism, single-word slip).

Return ONLY a JSON object. Do not explain.`;

const SAFETY_JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "category", "severity", "rationale"],
  properties: {
    verdict: {
      type: "string",
      enum: ["safe", "unsafe"],
    },
    category: {
      anyOf: [
        {
          type: "string",
          enum: OUTPUT_SAFETY_CATEGORIES,
        },
        { type: "null" },
      ],
    },
    severity: {
      type: "string",
      enum: ["low", "high"],
    },
    rationale: {
      type: "string",
      maxLength: 200,
    },
  },
} as const;

type JudgeOutput = {
  verdict: OutputSafetyVerdict;
  category: OutputSafetyCategory | null;
  severity: OutputSafetySeverity;
  rationale: string;
};

function isValidJudgeOutput(value: unknown): value is JudgeOutput {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;

  if (v.verdict !== "safe" && v.verdict !== "unsafe") return false;
  if (v.severity !== "low" && v.severity !== "high") return false;
  if (typeof v.rationale !== "string") return false;

  if (
    v.category !== null &&
    !OUTPUT_SAFETY_CATEGORIES.includes(v.category as OutputSafetyCategory)
  ) {
    return false;
  }

  return true;
}

/**
 * Truncate very long outputs before sending to the judge. The full JSON of a
 * Blueprint is ~2-3KB; clipping to 8KB comfortably fits any realistic
 * output while protecting us from pathological token blowup.
 */
function truncateForJudge(text: string): string {
  const MAX = 8000;
  return text.length > MAX ? `${text.slice(0, MAX)}\n…[truncated]` : text;
}

/**
 * Optional context passed by route handlers so the safety judge can log
 * cost events attributed to the right feature and user.
 */
export type SafetyClassifyContext = {
  userId?: string | null;
  tier?: string | null;
  /** Feature name for cost attribution: 'today' | 'blueprint' | 'forecast' | 'ask' | 'ask_follow_up' */
  feature?: string;
  requestId?: string | null;
};

async function runJudge(
  text: string,
  context?: SafetyClassifyContext,
): Promise<OutputSafetyResult> {
  // Circuit breaker: if the judge has failed CIRCUIT_BREAKER_THRESHOLD times
  // in a row, block the output rather than letting it through unchecked.
  if (isCircuitBreakerTripped()) {
    console.error(
      "[output_safety_circuit_breaker] Blocking output — judge circuit breaker is tripped.",
      { consecutiveFailures: consecutiveJudgeFailures },
    );
    return {
      verdict: "unsafe",
      category: "fatalistic_determinism", // Generic safe category for the block payload
      severity: "high",
      rationale: "Safety judge unavailable (circuit breaker tripped) — blocking output as a precaution.",
      detectionPath: "judge_error",
    };
  }

  try {
    const result = await generateJsonObjectWithMeta({
      provider: "anthropic",
      model: SAFETY_JUDGE_MODEL,
      systemPrompt: SAFETY_JUDGE_SYSTEM_PROMPT,
      userPrompt: `CANDIDATE OUTPUT:\n\n${truncateForJudge(text)}`,
      stepName: "output safety judge",
      maxOutputTokens: 200,
      structuredOutput: {
        name: "output_safety_verdict",
        schema: SAFETY_JUDGE_SCHEMA as unknown as Record<string, unknown>,
        strict: true,
      },
    });

    // Log cost when context is provided (i.e. called from a route handler).
    if (context != null) {
      logLlmCost({
        meta: result,
        feature: context.feature ?? "unknown",
        passLabel: "safety_judge",
        model: SAFETY_JUDGE_MODEL,
        userId: context.userId,
        tier: context.tier,
        requestId: context.requestId,
      });
    }

    if (!isValidJudgeOutput(result.parsedJson)) {
      // Unexpected shape — counts as a failure for circuit-breaker purposes.
      recordJudgeFailure();
      console.warn(
        "[output_safety_judge_invalid_shape]",
        JSON.stringify({ raw: result.parsedJson }),
      );
      return SAFE_RESULT;
    }

    // Success — reset the circuit breaker.
    recordJudgeSuccess();

    return {
      verdict: result.parsedJson.verdict,
      category: result.parsedJson.category,
      severity: result.parsedJson.severity,
      rationale: result.parsedJson.rationale.slice(0, 200),
      detectionPath: "llm_judge",
    };
  } catch (error) {
    // Record failure for circuit breaker.
    recordJudgeFailure();

    // Fail OPEN on judge error — a Haiku outage must not DoS generation. The
    // regex prefilter still catches egregious cases; the product_event log
    // surfaces the error rate for ops. After CIRCUIT_BREAKER_THRESHOLD
    // consecutive failures, the next call will fail-CLOSED (see above).
    console.error(
      "[output_safety_judge_failed]",
      error instanceof Error ? error.message : String(error),
    );
    return {
      verdict: "safe",
      category: null,
      severity: "low",
      rationale: "Judge error — failed open.",
      detectionPath: "judge_error",
    };
  }
}

/**
 * Classify a candidate output. Call AFTER crisis detection has passed, just
 * before save / client delivery.
 */
export async function classifyOutputSafety(
  text: string,
  context?: SafetyClassifyContext,
): Promise<OutputSafetyResult> {
  const normalized = (text ?? "").trim();

  if (normalized === "") {
    return SAFE_RESULT;
  }

  const regexHit = runRegexPrefilter(normalized);
  if (regexHit !== null) {
    return regexHit;
  }

  return runJudge(normalized, context);
}

// --- Hardcoded block payload --------------------------------------------

export type OutputSafetyBlockPayload = {
  mode: "safety_block";
  category: OutputSafetyCategory;
  headline: string;
  message: string;
  disclaimer: string;
};

const CATEGORY_COPY: Record<
  OutputSafetyCategory,
  { headline: string; message: string }
> = {
  medical_prediction: {
    headline: "I can't predict health outcomes",
    message:
      "I almost gave you a reading that could read as a medical or mental-health prediction, which isn't something I'm qualified to offer. If you're worried about your health, a doctor or therapist can actually help.",
  },
  fatalistic_determinism: {
    headline: "That reading leaned too deterministic",
    message:
      "I caught myself framing this as fate — something fixed that you can't change. That's not how Wuwu is meant to work. Want to ask again in a way that centers what you're noticing or wrestling with?",
  },
  identity_pathologizing: {
    headline: "I'm not qualified to label how you work",
    message:
      "I almost assigned you a clinical label based on your chart. That's outside what astrology — and this app — should ever do. A therapist or psychiatrist is the right place for that kind of conversation.",
  },
  protected_class_generalization: {
    headline: "That reading made an unfair generalization",
    message:
      "I caught myself generalizing about a group of people in a way that wasn't fair. Your chart is yours — let's keep the reading on you.",
  },
  specific_financial_instrument: {
    headline: "I don't give specific financial picks",
    message:
      "I almost named a specific investment or amount, which I'm not set up to do. Wuwu can reflect on your relationship with money, timing, and decisions — but for actual picks, talk to a licensed financial advisor.",
  },
  directive_life_verdict: {
    headline: "Wuwu helps you think — you decide",
    message:
      "I almost told you what to do about a major life decision. That's not my call to make. I can offer reflection questions, patterns worth noticing, and timing considerations — but the verdict is yours.",
  },
  predictive_death_injury_pregnancy: {
    headline: "I can't predict events like that",
    message:
      "I almost made a specific prediction about death, injury, or pregnancy. I'm not able to do that, and no astrology app should. Please disregard any framing that suggested otherwise.",
  },
};

const BLOCK_DISCLAIMER =
  "This is a safeguard — nothing on your end went wrong. You can ask again and you won't be charged for this attempt.";

export function buildOutputSafetyBlockPayload(
  category: OutputSafetyCategory,
): OutputSafetyBlockPayload {
  const copy = CATEGORY_COPY[category];
  return {
    mode: "safety_block",
    category,
    headline: copy.headline,
    message: copy.message,
    disclaimer: BLOCK_DISCLAIMER,
  };
}

/**
 * Test helper — exposed so the smoke test can audit pattern counts without
 * importing the private arrays.
 */
export const OUTPUT_SAFETY_RULE_COUNTS = {
  regex: REGEX_RULES.length,
  financialInstrument: FINANCIAL_INSTRUMENT_RULES.length,
  directiveVerdict: DIRECTIVE_VERDICT_RULES.length,
  deathPregnancy: DEATH_PREGNANCY_RULES.length,
  cultPhrase: CULT_PHRASE_RULES.length,
} as const;
