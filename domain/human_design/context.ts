type HumanDesignInput = {
  birth_date: string | null | undefined;
  birth_time: string | null | undefined;
  birth_time_confidence: string | null | undefined;
  birth_latitude?: number | null | undefined;
  birth_longitude?: number | null | undefined;
  birth_timezone?: string | null | undefined;
};

export type HumanDesignChart = {
  type: string;
  authority: string;
  profile: string;
  definition: string | null;
  strategy: string | null;
  not_self_theme: string | null;
  signature: string | null;
};

export type HumanDesignContextStatus =
  | "available"
  | "needs_exact_birth_time"
  | "missing_birth_datetime"
  | "missing_birth_location"
  | "integration_unavailable";

export type HumanDesignContext = {
  is_available: boolean;
  status: HumanDesignContextStatus;
  chart: HumanDesignChart | null;
  gating_message: string;
  limitations: string[];
  integration_boundary: {
    provider: "not_implemented";
    reason: string;
  };
};

// Human Design is intentionally not approximated here.
// This project does not currently include a trustworthy local Human Design engine,
// and we do not infer chart fields from astrology, numerology, or heuristics.
// The exact-time and location gates are enforced now so the future integration
// boundary is explicit and safe.
export function buildHumanDesignContext(
  input: HumanDesignInput,
): HumanDesignContext {
  if (input.birth_time_confidence !== "exact") {
    return {
      is_available: false,
      status: "needs_exact_birth_time",
      chart: null,
      gating_message: "Human Design needs exact birth time for a reliable chart.",
      limitations: [
        "Human Design was not attempted because birth_time_confidence is not exact.",
      ],
      integration_boundary: {
        provider: "not_implemented",
        reason:
          "No deterministic Human Design chart engine is configured in this local MVP.",
      },
    };
  }

  if (input.birth_date == null || input.birth_time == null) {
    return {
      is_available: false,
      status: "missing_birth_datetime",
      chart: null,
      gating_message:
        "Human Design needs exact birth date and birth time to calculate a chart.",
      limitations: [
        "Human Design was not attempted because exact birth date/time is incomplete.",
      ],
      integration_boundary: {
        provider: "not_implemented",
        reason:
          "No deterministic Human Design chart engine is configured in this local MVP.",
      },
    };
  }

  if (
    input.birth_timezone == null ||
    input.birth_latitude == null ||
    input.birth_longitude == null
  ) {
    return {
      is_available: false,
      status: "missing_birth_location",
      chart: null,
      gating_message:
        "Human Design needs reliable birth location and birth timezone data for a chart.",
      limitations: [
        "Human Design was not attempted because birth coordinates or birth timezone are missing.",
      ],
      integration_boundary: {
        provider: "not_implemented",
        reason:
          "No deterministic Human Design chart engine is configured in this local MVP.",
      },
    };
  }

  return {
    is_available: false,
    status: "integration_unavailable",
    chart: null,
    gating_message:
      "Exact birth data is present, but Human Design chart calculation is not implemented in this local MVP yet.",
    limitations: [
      "Human Design was not calculated because no trustworthy deterministic Human Design library or local integration is configured in this project yet.",
    ],
    integration_boundary: {
      provider: "not_implemented",
      reason:
        "No deterministic Human Design chart engine is configured in this local MVP.",
    },
  };
}
