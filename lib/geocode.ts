type GeocodeResult = {
  latitude: number | null;
  longitude: number | null;
  birthTimezone: string | null;
  limitation: string | null;
};

type OpenCageResponse = {
  results?: Array<{
    geometry?: {
      lat?: number;
      lng?: number;
    };
    annotations?: {
      timezone?: {
        name?: string;
      };
    };
  }>;
  status?: {
    message?: string;
  };
};

function getGeocodeProvider() {
  return process.env.GEOCODE_PROVIDER?.trim().toLowerCase() || "opencage";
}

function getOpenCageApiKey() {
  return process.env.OPENCAGE_API_KEY?.trim() || null;
}

export async function geocodeBirthplace(input: {
  birthCity: string;
  birthCountry: string;
}): Promise<GeocodeResult> {
  const provider = getGeocodeProvider();

  if (provider !== "opencage") {
    return {
      latitude: null,
      longitude: null,
      birthTimezone: null,
      limitation: `Unsupported geocoding provider "${provider}".`,
    };
  }

  const apiKey = getOpenCageApiKey();

  if (apiKey === null) {
    return {
      latitude: null,
      longitude: null,
      birthTimezone: null,
      limitation:
        "Missing OPENCAGE_API_KEY, so birthplace coordinates and birth timezone were not resolved.",
    };
  }

  const query = `${input.birthCity}, ${input.birthCountry}`;
  const url = new URL("https://api.opencagedata.com/geocode/v1/json");
  url.searchParams.set("q", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("limit", "1");
  url.searchParams.set("no_annotations", "0");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const data = (await response.json()) as OpenCageResponse;

    if (!response.ok) {
      return {
        latitude: null,
        longitude: null,
        birthTimezone: null,
        limitation:
          data.status?.message ||
          "Birthplace geocoding request failed for the configured provider.",
      };
    }

    const firstResult = data.results?.[0];
    const latitude = firstResult?.geometry?.lat ?? null;
    const longitude = firstResult?.geometry?.lng ?? null;
    const birthTimezone = firstResult?.annotations?.timezone?.name ?? null;

    if (latitude === null || longitude === null) {
      return {
        latitude: null,
        longitude: null,
        birthTimezone: null,
        limitation:
          "Birthplace geocoding returned no coordinates for the provided city and country.",
      };
    }

    return {
      latitude,
      longitude,
      birthTimezone,
      limitation:
        birthTimezone === null
          ? "Birthplace geocoding returned coordinates but no timezone annotation."
          : null,
    };
  } catch {
    return {
      latitude: null,
      longitude: null,
      birthTimezone: null,
      limitation:
        "Birthplace geocoding could not reach the configured provider.",
    };
  }
}
