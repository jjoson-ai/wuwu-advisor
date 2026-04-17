import type {
  ChineseAstrologyContext,
  ChineseAstrologySignal,
} from "@/domain/chinese_astrology/context";
import type {
  FormattedBlueprint,
} from "@/domain/blueprint/blueprint.types";
import type {
  FormattedForecast,
  ForecastHorizon,
} from "@/domain/forecast/forecast.types";
import type { FeatureAccess } from "@/lib/access";
import type { FreeAstroDailyContext } from "@/lib/freeastroapi";

type TodayGenerationContextInput = {
  featureAccess: FeatureAccess;
  freeAstroDailyContext: FreeAstroDailyContext;
  latestBlueprint: FormattedBlueprint | null;
};

type ForecastGenerationContextInput = {
  featureAccess: FeatureAccess;
  chineseAstrologyContext: ChineseAstrologyContext;
  chineseAstrologySignal: ChineseAstrologySignal;
  horizon: ForecastHorizon;
  latestBlueprint: FormattedBlueprint | null;
};

type AskGenerationContextInput = {
  featureAccess: FeatureAccess;
  latestBriefing: unknown | null;
  latestForecast: FormattedForecast | null;
  latestBlueprint: FormattedBlueprint | null;
};

export function buildTodayGenerationContext(
  input: TodayGenerationContextInput,
) {
  const blueprintContext = input.featureAccess.canViewFullBlueprint
    ? input.latestBlueprint
    : buildFreeBlueprintContext(input.latestBlueprint);

  if (input.featureAccess.canGenerateUnlimitedToday) {
    return {
      freeAstroDailyContext: input.freeAstroDailyContext,
      blueprintContext,
    };
  }

  return {
    freeAstroDailyContext: {
      chinese_current_pillars: null,
      vedic_panchang: null,
      notes: [],
      limitations: [],
    } satisfies FreeAstroDailyContext,
    blueprintContext,
  };
}

export function buildForecastGenerationContext(
  input: ForecastGenerationContextInput,
) {
  const blueprintContext = input.featureAccess.canViewFullBlueprint
    ? input.latestBlueprint
    : buildFreeBlueprintContext(input.latestBlueprint);

  if (input.featureAccess.canViewFullForecast) {
    return {
      chineseAstrologyContext: input.chineseAstrologyContext,
      chineseAstrologySignal: input.chineseAstrologySignal,
      horizon: input.horizon,
      blueprintContext,
    };
  }

  return {
    chineseAstrologyContext: null,
    chineseAstrologySignal: null,
    horizon: input.horizon,
    blueprintContext,
  };
}

export function buildAskGenerationContext(input: AskGenerationContextInput) {
  if (
    input.featureAccess.canViewFullBlueprint &&
    input.featureAccess.canViewFullForecast
  ) {
    return {
      latestBriefing: input.latestBriefing,
      latestForecast: input.latestForecast,
      latestBlueprint: input.latestBlueprint,
    };
  }

  return {
    latestBriefing: input.latestBriefing,
    latestForecast:
      input.featureAccess.canViewFullForecast === false
        ? buildFreeForecastContext(input.latestForecast)
        : input.latestForecast,
    latestBlueprint:
      input.featureAccess.canViewFullBlueprint === false
        ? buildFreeBlueprintContext(input.latestBlueprint)
        : input.latestBlueprint,
  };
}

function buildFreeForecastContext(forecast: FormattedForecast | null) {
  if (forecast === null) {
    return null;
  }

  return {
    title: forecast.title,
    summary: forecast.summary,
  };
}

function buildFreeBlueprintContext(blueprint: FormattedBlueprint | null) {
  if (blueprint === null) {
    return null;
  }

  return {
    title: blueprint.title,
    summary: blueprint.summary,
    guiding_numbers: blueprint.guiding_numbers,
    chinese_signature: blueprint.chinese_signature,
    core_pattern: blueprint.core_pattern,
    communication_and_connection: blueprint.communication_and_connection,
  };
}
