/**
 * Crisis detection — self-harm / suicide ideation only.
 *
 * This module is deliberately NARROW. It covers one situation: someone may
 * be in imminent self-harm crisis. Other safety buckets (harm to others,
 * illegal wrongdoing) stay in domain/decision/decision.safety.ts because
 * they have different response modes.
 *
 * Design:
 * - Two deterministic regex layers (input, output).
 * - BENIGN prefilter to strip advocacy / research / journalism / third-party
 *   framings ("suicide prevention", "my friend who attempted").
 * - Returns a pattern INDEX, not the matched text — we log the index so we
 *   can measure precision without ever storing user prompts.
 * - Severity is either "critical" (explicit active intent) or "elevated"
 *   (concerning ideation / passive intent). Both trigger Care Mode; severity
 *   only affects telemetry.
 *
 * This runs BEFORE the LLM on input, and INSIDE the SSE send() wrapper on
 * output. An optional OpenAI Moderation layer (see crisis-detection.moderation.ts,
 * Phase 1b) can be chained after the regex for semantic coverage.
 *
 * Roadmap reference: 1.7.
 */

export type CrisisSeverity = "none" | "elevated" | "critical";

export type CrisisDetectionResult = {
  triggered: boolean;
  severity: CrisisSeverity;
  layer: "input" | "output";
  /**
   * Stable index into the pattern array that fired. Safe to log — does NOT
   * contain user text. `null` when no pattern matched.
   */
  patternIndex: number | null;
};

/**
 * Benign framings — advocacy, research, third-party concern, or professional
 * context. Matching any of these short-circuits to "not crisis" even if a
 * critical phrase appears later in the message. Order-sensitive: benign is
 * checked FIRST.
 *
 * We keep this list tight on purpose — over-broad benign rules would let
 * true-positive crises slip through under a thin veneer ("I'm just curious
 * about suicide statistics and also want to die tonight"). If in doubt,
 * trigger Care Mode.
 */
const BENIGN_PATTERNS: ReadonlyArray<RegExp> = [
  /\bsuicide (prevention|rates?|statistics?|awareness|hotline|helpline)\b/i,
  /\b(reporting|report|writing about|research(?:ing)?|study(?:ing)?|essay|article|paper|dissertation) (on|about) (suicide|self[- ]harm)\b/i,
  /\b(how do i )?help (my |a |someone|friend|family member|child|partner|sibling|parent)\b.{0,60}\b(suicide|suicidal|self[- ]harm|kill (?:himself|herself|themself|themselves))\b/i,
  /\b(my|his|her|their|a) (friend|sister|brother|mother|father|parent|child|son|daughter|colleague|coworker|classmate) (attempted|tried|committed|died by) (suicide|self[- ]harm)\b/i,
  /\b(i'm|i am|as) (a|an) (therapist|counselor|counsellor|nurse|doctor|paramedic|social worker|chaplain|journalist|reporter|researcher)\b/i,
  /\bsafe messaging guidelines\b/i,
  /\bWHO (guidance|guidelines) on (suicide|self[- ]harm)\b/i,
];

/**
 * Critical — explicit, active self-harm intent. First-person, present/future
 * tense, concrete action. These ALWAYS trigger Care Mode.
 */
const CRITICAL_INPUT_PATTERNS: ReadonlyArray<RegExp> = [
  /\bkill(ing)? (myself|my ?self)\b/i,
  /\bend(ing)? (my|this) life\b/i,
  /\bend(ing)? it all\b/i,
  /\btake (my|my own) life\b/i,
  /\bcommit(ting)? suicide\b/i,
  /\bi (want|wanna|need|plan|intend|am going) to (die|not exist|stop existing|disappear forever)\b/i,
  /\bi (don'?t|do not) want to (be alive|live|exist)\b/i,
  /\bhurt(ing)? myself\b/i,
  /\bharm(ing)? myself\b/i,
  /\bcut(ting)? myself\b/i,
  /\bhang(ing)? myself\b/i,
  /\bshoot(ing)? myself\b/i,
  /\bdrown(ing)? myself\b/i,
  /\bpoison(ing)? myself\b/i,
  /\boverdos(e|ing)\b.{0,30}\b(on purpose|to die|to end)\b/i,
  /\b(lethal|fatal) (dose|amount) of\b/i,
  /\bpainless (way|method) to (die|end)\b/i,
  /\bhow (many|much) .{0,40} (to die|would kill|will kill)\b/i,
  // Slang — TikTok-era suicide euphemisms
  /\bunalive (myself|my ?self)\b/i,
  /\bi (want|wanna) to unalive\b/i,
  /\b(kms|k\.m\.s\.)\b/i,
  /\bctb\b(?!\s*(?:bank|stock|ticker))/i, // catch the bus — skip financial context
  /\b(suicide|goodbye|farewell) note\b/i,
  /\bwriting (a |my )?(suicide|goodbye|farewell) note\b/i,
  /\bplan(ning)? to (kill myself|end my life|commit suicide|die (tonight|tomorrow|soon|today))\b/i,
];

/**
 * Elevated — passive ideation, hopelessness, concerning framings without
 * explicit active intent. Still triggers Care Mode; tagged differently in
 * telemetry so we can measure drift over time.
 */
const ELEVATED_INPUT_PATTERNS: ReadonlyArray<RegExp> = [
  /\bi (want|wanna) to die\b/i,
  /\bi wish i (was|were) dead\b/i,
  /\bi wish i (was|were)n'?t (alive|here|born)\b/i,
  /\bbetter off (dead|without me|if i (was|were) gone)\b/i,
  /\bno (reason|point) to (live|keep going|go on)\b/i,
  /\bnothing to live for\b/i,
  /\btired of (living|being alive|existing)\b/i,
  /\bcan'?t (take|do|handle) (this|it|life) anymore\b/i,
  /\bi'?m done (with life|living)\b/i,
  /\bwant (it|everything) to (end|be over)\b/i,
  /\beveryone (would be|is) better off without me\b/i,
  /\bi (am|'m|feel) (a )?burden\b.{0,40}\b(gone|disappear|die|end)\b/i,
  /\bself[- ]harm(ing)?\b/i,
  /\bsuicidal\b/i,
  /\bsuicide\b(?!\s*(?:prevention|awareness|rates?|statistics?|hotline|helpline|squad|note from \d))/i,
];

/**
 * Output patterns — what the LLM must NEVER emit. Reuses the critical input
 * list (the assistant should never generate first-person crisis statements
 * as a "reflection" technique) and adds a handful of explicitly dangerous
 * output shapes.
 */
const CRITICAL_OUTPUT_PATTERNS: ReadonlyArray<RegExp> = [
  ...CRITICAL_INPUT_PATTERNS,
  /\byou (should|could|might want to) (kill yourself|end your life|end it|give up|stop fighting)\b/i,
  /\b(it|that) (would be|is) (best|better|easier) if you (were gone|weren'?t here|weren'?t alive)\b/i,
  /\b(here'?s|this is) how (to|you could) (kill|end|harm|hurt) yourself\b/i,
  /\b(take|ingest|swallow) \d+ ?(mg|grams?|pills?|tablets?) of\b/i,
  /\byour chart (shows|indicates|says) (you should|it'?s time to) (die|end it|give up on life)\b/i,
];

function matchIndex(text: string, patterns: ReadonlyArray<RegExp>): number {
  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(text)) {
      return i;
    }
  }

  return -1;
}

function isBenign(text: string): boolean {
  return BENIGN_PATTERNS.some((pattern) => pattern.test(text));
}

export function detectCrisisInput(text: string): CrisisDetectionResult {
  const normalized = (text ?? "").trim();

  if (normalized === "") {
    return {
      triggered: false,
      severity: "none",
      layer: "input",
      patternIndex: null,
    };
  }

  if (isBenign(normalized)) {
    return {
      triggered: false,
      severity: "none",
      layer: "input",
      patternIndex: null,
    };
  }

  const criticalIdx = matchIndex(normalized, CRITICAL_INPUT_PATTERNS);
  if (criticalIdx >= 0) {
    return {
      triggered: true,
      severity: "critical",
      layer: "input",
      patternIndex: criticalIdx,
    };
  }

  const elevatedIdx = matchIndex(normalized, ELEVATED_INPUT_PATTERNS);
  if (elevatedIdx >= 0) {
    return {
      triggered: true,
      severity: "elevated",
      layer: "input",
      // Offset so input-pattern namespace is distinct from elevated in logs.
      patternIndex: CRITICAL_INPUT_PATTERNS.length + elevatedIdx,
    };
  }

  return {
    triggered: false,
    severity: "none",
    layer: "input",
    patternIndex: null,
  };
}

export function detectCrisisOutput(text: string): CrisisDetectionResult {
  const normalized = (text ?? "").trim();

  if (normalized === "") {
    return {
      triggered: false,
      severity: "none",
      layer: "output",
      patternIndex: null,
    };
  }

  // Benign filtering is less appropriate on model output — the model should
  // never be "journalistically describing" suicide methods in a horoscope.
  const criticalIdx = matchIndex(normalized, CRITICAL_OUTPUT_PATTERNS);
  if (criticalIdx >= 0) {
    return {
      triggered: true,
      severity: "critical",
      layer: "output",
      patternIndex: criticalIdx,
    };
  }

  return {
    triggered: false,
    severity: "none",
    layer: "output",
    patternIndex: null,
  };
}

/**
 * Test helper — exposes pattern counts so we can assert shape in unit tests
 * without importing the private arrays.
 */
export const CRISIS_PATTERN_COUNTS = {
  benign: BENIGN_PATTERNS.length,
  criticalInput: CRITICAL_INPUT_PATTERNS.length,
  elevatedInput: ELEVATED_INPUT_PATTERNS.length,
  criticalOutput: CRITICAL_OUTPUT_PATTERNS.length,
} as const;
