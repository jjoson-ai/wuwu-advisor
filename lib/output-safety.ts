type ForbiddenInternalTermMatch = {
  term: string;
  path: string;
  value: string;
};

const FORBIDDEN_INTERNAL_TERM_PATTERNS = [
  { term: "complexityScore", pattern: /\bcomplexity[\s_-]*score\b/i },
  { term: "conflictScore", pattern: /\bconflict[\s_-]*score\b/i },
  { term: "emotionalIntensity", pattern: /\bemotional[\s_-]*intensity\b/i },
  { term: "decisionAmbiguity", pattern: /\bdecision[\s_-]*ambiguity\b/i },
  { term: "synthesisBurden", pattern: /\bsynthesis[\s_-]*burden\b/i },
  { term: "phaseShiftScore", pattern: /\bphase[\s_-]*shift[\s_-]*score\b/i },
  { term: "forced_frontier_reasons", pattern: /\bforced[\s_-]*frontier[\s_-]*reasons\b/i },
  { term: "final_model_selected", pattern: /\bfinal[\s_-]*model[\s_-]*selected\b/i },
  { term: "path_taken", pattern: /\bpath[\s_-]*taken\b/i },
  { term: "fallback_triggered", pattern: /\bfallback[\s_-]*triggered\b/i },
  { term: "fallback_reason", pattern: /\bfallback[\s_-]*reason\b/i },
  { term: "recentUsageCount", pattern: /\brecent[\s_-]*usage[\s_-]*count\b/i },
  { term: "request_id", pattern: /\brequest[\s_-]*id\b/i },
  { term: "timing_decision", pattern: /\btiming_decision\b/i },
  { term: "conversation_decision", pattern: /\bconversation_decision\b/i },
  { term: "strategy_decision", pattern: /\bstrategy_decision\b/i },
  { term: "whether_decision", pattern: /\bwhether_decision\b/i },
  { term: "money_investing", pattern: /\bmoney_investing\b/i },
  { term: "business_product", pattern: /\bbusiness_product\b/i },
  { term: "feasibility_sensitive", pattern: /\bfeasibility_sensitive\b/i },
] as const;

function findForbiddenTermInString(value: string) {
  for (const entry of FORBIDDEN_INTERNAL_TERM_PATTERNS) {
    if (entry.pattern.test(value)) {
      return entry.term;
    }
  }

  return null;
}

function formatPath(path: Array<string | number>) {
  return path.length === 0 ? "(root)" : path.join(".");
}

export function findForbiddenInternalTermInUserOutput(
  value: unknown,
  path: Array<string | number> = [],
): ForbiddenInternalTermMatch | null {
  if (typeof value === "string") {
    const term = findForbiddenTermInString(value);

    if (term === null) {
      return null;
    }

    return {
      term,
      path: formatPath(path),
      value,
    };
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const match = findForbiddenInternalTermInUserOutput(item, [...path, index]);

      if (match !== null) {
        return match;
      }
    }

    return null;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      const match = findForbiddenInternalTermInUserOutput(nestedValue, [
        ...path,
        key,
      ]);

      if (match !== null) {
        return match;
      }
    }
  }

  return null;
}

export function assertNoForbiddenInternalTermsInUserOutput(
  value: unknown,
  outputLabel: string,
) {
  const match = findForbiddenInternalTermInUserOutput(value);

  if (match === null) {
    return value;
  }

  throw new Error(
    `Unsafe internal term leaked into ${outputLabel} at ${match.path}: ${match.term}.`,
  );
}

const SANITIZED_USER_OUTPUT_MESSAGE =
  "This part of the guidance needs a refresh. Regenerate to update it.";

export function sanitizeForbiddenInternalTermsInUserOutput<T>(value: T): T {
  if (typeof value === "string") {
    return (findForbiddenTermInString(value) === null
      ? value
      : SANITIZED_USER_OUTPUT_MESSAGE) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeForbiddenInternalTermsInUserOutput(item),
    ) as T;
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sanitizeForbiddenInternalTermsInUserOutput(nestedValue),
      ]),
    ) as T;
  }

  return value;
}

function runOutputSafetyAssertions() {
  const cases = [
    "complexityScore",
    "conflictScore",
    "emotionalIntensity",
    "decisionAmbiguity",
    "synthesisBurden",
  ] as const;

  for (const term of cases) {
    const directMatch = findForbiddenInternalTermInUserOutput(
      `Leaked term: ${term}`,
    );

    if (directMatch?.term !== term) {
      throw new Error(`Output safety assertion failed for ${term}.`);
    }
  }

  const nestedMatch = findForbiddenInternalTermInUserOutput({
    nested: ["clean", "conflictScore"],
  });

  if (nestedMatch?.term !== "conflictScore" || nestedMatch.path !== "nested.1") {
    throw new Error("Output safety recursive assertion failed.");
  }

  if (findForbiddenInternalTermInUserOutput("Grounded guidance only.") !== null) {
    throw new Error("Output safety clean-string assertion failed.");
  }

  const sanitized = sanitizeForbiddenInternalTermsInUserOutput({
    description: "phaseShiftScore leaked here",
  });

  if (
    sanitized.description !== SANITIZED_USER_OUTPUT_MESSAGE ||
    findForbiddenInternalTermInUserOutput(sanitized) !== null
  ) {
    throw new Error("Output safety sanitize assertion failed.");
  }
}

if (process.env.NODE_ENV !== "production") {
  runOutputSafetyAssertions();
}
