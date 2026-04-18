export type ModelRoutingFeature = "today" | "ask" | "forecast";

export type RoutingMetadata = {
  complexityScore?: number;
  conflictScore?: number;
  emotionalIntensity?: number;
  decisionAmbiguity?: number;
  phaseShiftScore?: number;
};

export type ModelRoutingUserContext = {
  isFreeUser: boolean;
  // Reserved for future use. Current live routes do not populate this field.
  sessionCount?: number | null;
  hasBlueprint?: boolean | null;
  recentUsageCount?: number | null;
};

type ShouldUseFrontierModelInput = {
  feature: ModelRoutingFeature;
  signals: RoutingMetadata;
  userContext: ModelRoutingUserContext;
};

export type NormalizedRoutingMetadata = {
  complexityScore: number;
  conflictScore: number;
  emotionalIntensity: number;
  decisionAmbiguity: number;
  phaseShiftScore: number;
};

export type ModelRoutingDecision = {
  useFrontier: boolean;
  synthesisBurden: number;
  forcedFrontierReasons: string[];
  normalizedSignals: NormalizedRoutingMetadata;
};

const ASK_FORCE_FRONTIER = {
  decisionAmbiguity: 0.34,
  conflictScore: 0.36,
  emotionalIntensity: 0.5,
  complexityScore: 0.58,
  synthesisBurden: 0.42,
  ambiguityConflictCombo: 0.26,
  emotionallyLoadedSynthesis: {
    emotionalIntensity: 0.42,
    synthesisBurden: 0.4,
  },
  noBlueprintMidBurden: 0.34,
} as const;

const ASK_TIE_BREAKER = {
  recentUsageCount: 1,
  synthesisBurden: 0.26,
  decisionAmbiguity: 0.22,
  conflictScore: 0.22,
} as const;

const ASK_DEFAULT_FRONTIER = {
  synthesisBurden: 0.3,
  decisionAmbiguity: 0.24,
  conflictScore: 0.24,
} as const;

const FORECAST_FORCE_FRONTIER = {
  phaseShiftScore: 0.44,
  synthesisBurden: 0.46,
  conflictScore: 0.4,
  transitionalComplexMix: {
    phaseShiftScore: 0.32,
    complexityScore: 0.38,
  },
  noBlueprintTransition: 0.38,
} as const;

const FORECAST_TIE_BREAKER = {
  recentUsageCount: 0,
  synthesisBurden: 0.24,
  phaseShiftScore: 0.26,
} as const;

const FORECAST_DEFAULT_FRONTIER = {
  synthesisBurden: 0.32,
  phaseShiftScore: 0.28,
  complexityScore: 0.36,
} as const;

const TODAY_FORCE_FRONTIER = {
  synthesisBurden: 0.56,
  complexityScore: 0.62,
  conflictScore: 0.5,
  ambiguityConflictCombo: {
    decisionAmbiguity: 0.42,
    conflictScore: 0.34,
  },
  noBlueprintMidBurden: 0.46,
} as const;

const TODAY_TIE_BREAKER = {
  recentUsageCount: 1,
  synthesisBurden: 0.25,
  conflictScore: 0.22,
} as const;

const TODAY_DEFAULT_FRONTIER = {
  synthesisBurden: 0.36,
  complexityScore: 0.4,
  conflictScore: 0.32,
} as const;

// Tier-aware scaling for Today force/default thresholds.
// Set after the 2026-04 launch bakeoff, which showed Haiku compose holds up at
// the free tier on heavy signal days (burden ~0.6, conflict ~0.7) but reads
// visibly less premium than Sonnet/Opus at the pro tier on the same signals.
// Free: 1.10 → threshold floor is slightly higher so the cheap path survives
// more often and captures the cost win. Pro: 0.88 → escalates ~12% earlier
// so medium-intensity pro days reliably catch Opus/Sonnet synthesize.
// Kept as multipliers (not hand-tuned per-field) because we only have two
// profile anchors; this preserves the relative weighting of each gate.
const TODAY_TIER_MULTIPLIER = {
  free: 1.1,
  pro: 0.88,
} as const;

function scaleForTodayTier(value: number, isFreeUser: boolean) {
  return value * (isFreeUser ? TODAY_TIER_MULTIPLIER.free : TODAY_TIER_MULTIPLIER.pro);
}

function getScore(value: number | undefined) {
  return typeof value === "number" ? value : 0;
}

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}

function normalizeSignals(signals: RoutingMetadata): NormalizedRoutingMetadata {
  return {
    complexityScore: getScore(signals.complexityScore),
    conflictScore: getScore(signals.conflictScore),
    emotionalIntensity: getScore(signals.emotionalIntensity),
    decisionAmbiguity: getScore(signals.decisionAmbiguity),
    phaseShiftScore: getScore(signals.phaseShiftScore),
  };
}

export function computeSynthesisBurden(
  feature: ModelRoutingFeature,
  signals: RoutingMetadata,
) {
  const normalized = normalizeSignals(signals);

  if (feature === "ask") {
    // Ask carries the highest synthesis burden because ambiguity, conflict,
    // and emotion all materially affect the final stance quality.
    return roundScore(
      normalized.complexityScore * 0.2 +
        normalized.conflictScore * 0.28 +
        normalized.emotionalIntensity * 0.24 +
        normalized.decisionAmbiguity * 0.28,
    );
  }

  if (feature === "forecast") {
    // Forecast emphasizes phase shifts most heavily because transition quality
    // is where cheap summaries drift toward vague generalization.
    return roundScore(
      normalized.complexityScore * 0.28 +
        normalized.conflictScore * 0.22 +
        normalized.phaseShiftScore * 0.5,
    );
  }

  // Today stays more cost-sensitive, so burden leans hardest on complexity and
  // conflict, with emotion and ambiguity acting as secondary pressure.
  return roundScore(
    normalized.complexityScore * 0.42 +
      normalized.conflictScore * 0.26 +
      normalized.emotionalIntensity * 0.14 +
      normalized.decisionAmbiguity * 0.18,
  );
}

export function getModelRoutingDecision({
  feature,
  signals,
  userContext,
}: ShouldUseFrontierModelInput): ModelRoutingDecision {
  const normalizedSignals = normalizeSignals(signals);
  const {
    complexityScore,
    conflictScore,
    emotionalIntensity,
    decisionAmbiguity,
    phaseShiftScore,
  } = normalizedSignals;
  const recentUsageCount = userContext.recentUsageCount ?? 0;
  const synthesisBurden = computeSynthesisBurden(feature, normalizedSignals);
  const forcedFrontierReasons: string[] = [];

  if (feature === "ask") {
    // Ask force-routes to Opus first. This is the most stance-sensitive feature.
    if (decisionAmbiguity >= ASK_FORCE_FRONTIER.decisionAmbiguity) {
      forcedFrontierReasons.push("decision_ambiguity_high");
    }

    if (conflictScore >= ASK_FORCE_FRONTIER.conflictScore) {
      forcedFrontierReasons.push("conflict_high");
    }

    if (emotionalIntensity >= ASK_FORCE_FRONTIER.emotionalIntensity) {
      forcedFrontierReasons.push("emotional_intensity_high");
    }

    if (complexityScore >= ASK_FORCE_FRONTIER.complexityScore) {
      forcedFrontierReasons.push("complexity_high");
    }

    if (synthesisBurden >= ASK_FORCE_FRONTIER.synthesisBurden) {
      forcedFrontierReasons.push("synthesis_burden_high");
    }

    if (
      decisionAmbiguity >= ASK_FORCE_FRONTIER.ambiguityConflictCombo &&
      conflictScore >= ASK_FORCE_FRONTIER.ambiguityConflictCombo
    ) {
      forcedFrontierReasons.push("ambiguity_conflict_combo");
    }

    if (
      emotionalIntensity >=
        ASK_FORCE_FRONTIER.emotionallyLoadedSynthesis.emotionalIntensity &&
      synthesisBurden >=
        ASK_FORCE_FRONTIER.emotionallyLoadedSynthesis.synthesisBurden
    ) {
      forcedFrontierReasons.push("emotionally_loaded_synthesis");
    }

    if (
      userContext.hasBlueprint === false &&
      synthesisBurden >= ASK_FORCE_FRONTIER.noBlueprintMidBurden
    ) {
      forcedFrontierReasons.push("no_blueprint_mid_burden");
    }

    if (forcedFrontierReasons.length > 0) {
      return {
        useFrontier: true,
        synthesisBurden,
        forcedFrontierReasons,
        normalizedSignals,
      };
    }

    // recentUsageCount is only a cheap tie-breaker after the quality gates above fail.
    if (
      userContext.isFreeUser &&
      recentUsageCount > ASK_TIE_BREAKER.recentUsageCount &&
      synthesisBurden < ASK_TIE_BREAKER.synthesisBurden &&
      decisionAmbiguity < ASK_TIE_BREAKER.decisionAmbiguity &&
      conflictScore < ASK_TIE_BREAKER.conflictScore
    ) {
      return {
        useFrontier: false,
        synthesisBurden,
        forcedFrontierReasons,
        normalizedSignals,
      };
    }

    return {
      useFrontier:
        synthesisBurden >= ASK_DEFAULT_FRONTIER.synthesisBurden ||
        decisionAmbiguity >= ASK_DEFAULT_FRONTIER.decisionAmbiguity ||
        conflictScore >= ASK_DEFAULT_FRONTIER.conflictScore,
      synthesisBurden,
      forcedFrontierReasons,
      normalizedSignals,
    };
  }

  if (feature === "forecast") {
    // Forecast force-routes on transitional or mixed-period reads, where
    // medium-horizon synthesis quality matters more than cost.
    if (phaseShiftScore >= FORECAST_FORCE_FRONTIER.phaseShiftScore) {
      forcedFrontierReasons.push("phase_shift_high");
    }

    if (synthesisBurden >= FORECAST_FORCE_FRONTIER.synthesisBurden) {
      forcedFrontierReasons.push("synthesis_burden_high");
    }

    if (conflictScore >= FORECAST_FORCE_FRONTIER.conflictScore) {
      forcedFrontierReasons.push("conflict_high");
    }

    if (
      phaseShiftScore >=
        FORECAST_FORCE_FRONTIER.transitionalComplexMix.phaseShiftScore &&
      complexityScore >=
        FORECAST_FORCE_FRONTIER.transitionalComplexMix.complexityScore
    ) {
      forcedFrontierReasons.push("transitional_complex_mix");
    }

    if (
      userContext.hasBlueprint === false &&
      synthesisBurden >= FORECAST_FORCE_FRONTIER.noBlueprintTransition
    ) {
      forcedFrontierReasons.push("no_blueprint_transition");
    }

    if (forcedFrontierReasons.length > 0) {
      return {
        useFrontier: true,
        synthesisBurden,
        forcedFrontierReasons,
        normalizedSignals,
      };
    }

    // recentUsageCount is only a cheap tie-breaker after the quality gates above fail.
    if (
      userContext.isFreeUser &&
      recentUsageCount > FORECAST_TIE_BREAKER.recentUsageCount &&
      synthesisBurden < FORECAST_TIE_BREAKER.synthesisBurden &&
      phaseShiftScore < FORECAST_TIE_BREAKER.phaseShiftScore
    ) {
      return {
        useFrontier: false,
        synthesisBurden,
        forcedFrontierReasons,
        normalizedSignals,
      };
    }

    return {
      useFrontier:
        synthesisBurden >= FORECAST_DEFAULT_FRONTIER.synthesisBurden ||
        phaseShiftScore >= FORECAST_DEFAULT_FRONTIER.phaseShiftScore ||
        complexityScore >= FORECAST_DEFAULT_FRONTIER.complexityScore,
      synthesisBurden,
      forcedFrontierReasons,
      normalizedSignals,
    };
  }

  // Today is the cheapest route by intent, so force-Opus only on clearer
  // burden spikes or mixed signal combinations. Thresholds are tier-scaled:
  // pro escalates earlier, free holds the cheap path longer.
  const isFreeUser = userContext.isFreeUser === true;
  const forceSynthesisBurden = scaleForTodayTier(
    TODAY_FORCE_FRONTIER.synthesisBurden,
    isFreeUser,
  );
  const forceComplexityScore = scaleForTodayTier(
    TODAY_FORCE_FRONTIER.complexityScore,
    isFreeUser,
  );
  const forceConflictScore = scaleForTodayTier(
    TODAY_FORCE_FRONTIER.conflictScore,
    isFreeUser,
  );
  const forceAmbiguityConflictCombo = {
    decisionAmbiguity: scaleForTodayTier(
      TODAY_FORCE_FRONTIER.ambiguityConflictCombo.decisionAmbiguity,
      isFreeUser,
    ),
    conflictScore: scaleForTodayTier(
      TODAY_FORCE_FRONTIER.ambiguityConflictCombo.conflictScore,
      isFreeUser,
    ),
  };
  const forceNoBlueprintMidBurden = scaleForTodayTier(
    TODAY_FORCE_FRONTIER.noBlueprintMidBurden,
    isFreeUser,
  );

  if (synthesisBurden >= forceSynthesisBurden) {
    forcedFrontierReasons.push("synthesis_burden_high");
  }

  if (complexityScore >= forceComplexityScore) {
    forcedFrontierReasons.push("complexity_high");
  }

  if (conflictScore >= forceConflictScore) {
    forcedFrontierReasons.push("conflict_high");
  }

  if (
    decisionAmbiguity >= forceAmbiguityConflictCombo.decisionAmbiguity &&
    conflictScore >= forceAmbiguityConflictCombo.conflictScore
  ) {
    forcedFrontierReasons.push("ambiguity_conflict_combo");
  }

  if (
    userContext.hasBlueprint === false &&
    synthesisBurden >= forceNoBlueprintMidBurden
  ) {
    forcedFrontierReasons.push("no_blueprint_mid_burden");
  }

  if (forcedFrontierReasons.length > 0) {
    return {
      useFrontier: true,
      synthesisBurden,
      forcedFrontierReasons,
      normalizedSignals,
    };
  }

  // recentUsageCount is only a cheap tie-breaker after the quality gates above fail.
  if (
    userContext.isFreeUser &&
    recentUsageCount > TODAY_TIE_BREAKER.recentUsageCount &&
    synthesisBurden < TODAY_TIE_BREAKER.synthesisBurden &&
    conflictScore < TODAY_TIE_BREAKER.conflictScore
  ) {
    return {
      useFrontier: false,
      synthesisBurden,
      forcedFrontierReasons,
      normalizedSignals,
    };
  }

  return {
    useFrontier:
      synthesisBurden >=
        scaleForTodayTier(TODAY_DEFAULT_FRONTIER.synthesisBurden, isFreeUser) ||
      complexityScore >=
        scaleForTodayTier(TODAY_DEFAULT_FRONTIER.complexityScore, isFreeUser) ||
      conflictScore >=
        scaleForTodayTier(TODAY_DEFAULT_FRONTIER.conflictScore, isFreeUser),
    synthesisBurden,
    forcedFrontierReasons,
    normalizedSignals,
  };
}

export function shouldUseFrontierModel(input: ShouldUseFrontierModelInput) {
  return getModelRoutingDecision(input).useFrontier;
}
