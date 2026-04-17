import {
  type BaziCalculationMarker,
  fetchFreeAstroBazi,
  hasFreeAstroApiKey,
  type FreeAstroBaziChart,
} from "@/lib/freeastroapi";

type BaziInput = {
  birth_date: string | null | undefined;
  birth_time: string | null | undefined;
  birth_time_confidence: string | null | undefined;
  birth_city: string | null | undefined;
  birth_latitude?: number | null | undefined;
  birth_longitude?: number | null | undefined;
  bazi_calculation_marker?: string | null | undefined;
};

export type BaziChart = FreeAstroBaziChart;

export type BaziContextStatus =
  | "available"
  | "ready_for_calculation"
  | "missing_exact_birth_time"
  | "missing_birth_location_or_coordinates"
  | "missing_birth_datetime"
  | "missing_bazi_calculation_marker"
  | "api_unavailable";

export type BaziContext = {
  is_available: boolean;
  status: BaziContextStatus;
  chart: BaziChart | null;
  gating_message: string;
  limitations: string[];
  integration_boundary: {
    provider: "freeastroapi";
    ready: boolean;
  };
};

function parseBirthDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function parseBirthTimeParts(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return { hour, minute };
}

function buildBaseContext(
  input: BaziInput,
  override: Partial<BaziContext>,
): BaziContext {
  return {
    is_available: false,
    status: "api_unavailable",
    chart: null,
    gating_message: "",
    limitations: [],
    integration_boundary: {
      provider: "freeastroapi",
      ready: false,
    },
    ...override,
  };
}

// BaZi is not approximated from simpler Chinese zodiac heuristics.
// When available, chart data comes only from the external Four Pillars engine.
// Solar-term month logic, sexagenary pillar calculation, and Chinese two-hour
// hour-pillar logic are delegated to FreeAstroAPI rather than reproduced here.
export function getBaziGateContext(input: BaziInput): BaziContext {
  if (input.birth_date == null) {
    return buildBaseContext(input, {
      status: "missing_birth_datetime",
      gating_message: "BaZi needs birth date and birth time data for a chart.",
      limitations: ["BaZi was not attempted because birth date is missing."],
    });
  }

  if (input.birth_time_confidence !== "exact" || input.birth_time == null) {
    return buildBaseContext(input, {
      status: "missing_exact_birth_time",
      gating_message:
        "BaZi needs exact birth time for a full Four Pillars chart. Without it, the hour pillar is unavailable.",
      limitations: [
        "BaZi was not attempted because exact birth time is not available.",
        "Without exact birth time, the hour pillar and any hour-based interpretation would be unreliable.",
      ],
    });
  }

  if (
    input.birth_city == null ||
    input.birth_city.trim() === "" ||
    input.birth_latitude == null ||
    input.birth_longitude == null
  ) {
    return buildBaseContext(input, {
      status: "missing_birth_location_or_coordinates",
      gating_message:
        "BaZi needs reliable birth city and birth coordinates for a chart.",
      limitations: [
        "BaZi was not attempted because birth city or birth coordinates are missing.",
      ],
    });
  }

  if (
    input.bazi_calculation_marker !== "M" &&
    input.bazi_calculation_marker !== "F"
  ) {
    return buildBaseContext(input, {
      status: "missing_bazi_calculation_marker",
      gating_message:
        "BaZi needs an optional BaZi calculation marker because the external Four Pillars engine requires M or F for luck-cycle direction. You can leave it blank and continue using the rest of the app without BaZi.",
      limitations: [
        "BaZi was not attempted because the optional external-engine marker is unset.",
      ],
    });
  }

  if (hasFreeAstroApiKey() === false) {
    return buildBaseContext(input, {
      status: "api_unavailable",
      gating_message:
        "BaZi is not configured locally yet. Add FREEASTROAPI_API_KEY to enable the external Four Pillars engine.",
      limitations: [
        "BaZi was not attempted because FREEASTROAPI_API_KEY is not configured.",
      ],
    });
  }

  return buildBaseContext(input, {
    status: "ready_for_calculation",
    gating_message:
      "BaZi is available for this birth data when the blueprint is generated.",
    limitations: [],
    integration_boundary: {
      provider: "freeastroapi",
      ready: true,
    },
  });
}

export async function buildBaziContext(input: BaziInput): Promise<BaziContext> {
  const gate = getBaziGateContext(input);

  if (gate.status !== "ready_for_calculation") {
    return gate;
  }

  try {
    const { year, month, day } = parseBirthDateParts(input.birth_date!);
    const { hour, minute } = parseBirthTimeParts(input.birth_time!);
    const chart = await fetchFreeAstroBazi({
      year,
      month,
      day,
      hour,
      minute,
      city: input.birth_city!.trim(),
      lat: input.birth_latitude!,
      lng: input.birth_longitude!,
      sex: input.bazi_calculation_marker as BaziCalculationMarker,
    });

    return {
      is_available: true,
      status: "available",
      chart,
      gating_message: "BaZi chart calculated successfully.",
      limitations: [],
      integration_boundary: {
        provider: "freeastroapi",
        ready: true,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "FreeAstroAPI BaZi calculation failed.";

    return buildBaseContext(input, {
      status: "api_unavailable",
      gating_message:
        "BaZi could not be calculated right now. The rest of your blueprint is still available without it.",
      limitations: [message],
      integration_boundary: {
        provider: "freeastroapi",
        ready: true,
      },
    });
  }
}
