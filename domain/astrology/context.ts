import {
  Body,
  Ecliptic,
  EclipticGeoMoon,
  GeoVector,
} from "astronomy-engine";

import type { DailyBriefingInput } from "@/domain/astrology/schemas";

const SIGN_NAMES = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
] as const;

const CUSP_THRESHOLD_DEGREES = 3;

type SignName = (typeof SIGN_NAMES)[number];

export type AstrologyContext = {
  natal_context: {
    sun_sign: SignName;
    sun_longitude_degrees: number;
    near_sign_boundary: boolean;
    adjacent_sign: SignName | null;
    cusp_proximity_degrees: number | null;
    moon_sign: SignName | null;
    mercury_sign: SignName | null;
    venus_sign: SignName | null;
    mars_sign: SignName | null;
    rising_sign: SignName | null;
    birth_time_confidence: "exact" | "approximate" | "unknown";
  };
  daily_context: {
    current_sun_sign: SignName;
    current_sun_longitude_degrees: number;
    current_moon_sign: SignName;
    current_moon_longitude_degrees: number;
    day_signals: string[];
    timing_precision: "low" | "medium" | "high";
    limitations: string[];
  };
};

export type AstrologyContextInput = Pick<
  DailyBriefingInput,
  | "birth_date"
  | "birth_time"
  | "birth_time_confidence"
  | "birth_city"
  | "birth_country"
  | "timezone"
  | "date"
  | "weekday"
> & {
  birth_latitude?: number | null;
  birth_longitude?: number | null;
  birth_timezone?: string | null;
};

function normalizeLongitude(longitude: number) {
  const result = longitude % 360;
  return result < 0 ? result + 360 : result;
}

function roundDegrees(value: number) {
  return Math.round(value * 100) / 100;
}

function getSignFromLongitude(longitude: number): SignName {
  const normalized = normalizeLongitude(longitude);
  const signIndex = Math.floor(normalized / 30) % 12;
  return SIGN_NAMES[signIndex];
}

function getAdjacentSign(longitude: number): SignName | null {
  const normalized = normalizeLongitude(longitude);
  const signIndex = Math.floor(normalized / 30) % 12;
  const degreesIntoSign = normalized % 30;
  const distanceToStart = degreesIntoSign;
  const distanceToEnd = 30 - degreesIntoSign;

  if (distanceToStart <= CUSP_THRESHOLD_DEGREES) {
    return SIGN_NAMES[(signIndex + 11) % 12];
  }

  if (distanceToEnd <= CUSP_THRESHOLD_DEGREES) {
    return SIGN_NAMES[(signIndex + 1) % 12];
  }

  return null;
}

function getCuspProximityDegrees(longitude: number) {
  const normalized = normalizeLongitude(longitude);
  const degreesIntoSign = normalized % 30;
  const proximity = Math.min(degreesIntoSign, 30 - degreesIntoSign);

  return proximity <= CUSP_THRESHOLD_DEGREES ? roundDegrees(proximity) : null;
}

function getTimeZoneOffsetMilliseconds(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  const asUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );

  return asUtc - date.getTime();
}

function zonedLocalDateTimeToUtc(
  date: string,
  time: string,
  timezone: string,
): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstOffset = getTimeZoneOffsetMilliseconds(new Date(utcGuess), timezone);
  let corrected = utcGuess - firstOffset;
  const secondOffset = getTimeZoneOffsetMilliseconds(
    new Date(corrected),
    timezone,
  );

  if (secondOffset !== firstOffset) {
    corrected = utcGuess - secondOffset;
  }

  return new Date(corrected);
}

function buildBirthInstant(
  input: Pick<AstrologyContextInput, "birth_date" | "birth_time" | "timezone">,
) {
  const localTime = input.birth_time ?? "12:00";
  return zonedLocalDateTimeToUtc(input.birth_date, localTime, input.timezone);
}

function buildDailyInstant(
  input: Pick<AstrologyContextInput, "date" | "timezone">,
) {
  return zonedLocalDateTimeToUtc(input.date, "12:00", input.timezone);
}

function getSunLongitudeDegrees(date: Date) {
  const ecliptic = Ecliptic(GeoVector(Body.Sun, date, true));
  return normalizeLongitude(ecliptic.elon);
}

function getMoonLongitudeDegrees(date: Date) {
  return normalizeLongitude(EclipticGeoMoon(date).lon);
}

function getPlanetLongitudeDegrees(body: Body, date: Date) {
  const ecliptic = Ecliptic(GeoVector(body, date, true));
  return normalizeLongitude(ecliptic.elon);
}

function getTimingPrecision(
  birthTimeConfidence: AstrologyContextInput["birth_time_confidence"],
) {
  return birthTimeConfidence === "exact" ? "medium" : "low";
}

function getAngularDistanceDegrees(a: number, b: number) {
  const diff = Math.abs(normalizeLongitude(a) - normalizeLongitude(b));
  return diff > 180 ? 360 - diff : diff;
}

function buildDailySignals(params: {
  currentSunSign: SignName;
  currentSunLongitudeDegrees: number;
  currentMoonSign: SignName;
  currentMoonLongitudeDegrees: number;
  natalSunSign: SignName;
  natalSunLongitudeDegrees: number;
  natalMoonSign: SignName | null;
  natalMoonLongitudeDegrees: number;
  natalMercurySign: SignName | null;
  natalMercuryLongitudeDegrees: number | null;
  natalVenusSign: SignName | null;
  natalVenusLongitudeDegrees: number | null;
  natalMarsSign: SignName | null;
  natalMarsLongitudeDegrees: number | null;
  weekday: string;
}) {
  const signals: string[] = [
    `Today's Moon is in ${params.currentMoonSign} at ${params.currentMoonLongitudeDegrees} degrees, setting the emotional and relational tone of the day.`,
    `Today's Sun is in ${params.currentSunSign} at ${params.currentSunLongitudeDegrees} degrees, shaping the broader focus of the day.`,
  ];

  const moonToNatalSun = getAngularDistanceDegrees(
    params.currentMoonLongitudeDegrees,
    params.natalSunLongitudeDegrees,
  );

  if (moonToNatalSun <= 8) {
    signals.push(
      `The current Moon is close to your natal Sun in ${params.natalSunSign}, so today's events may feel more personal, visible, or identity-charged than usual.`,
    );
  } else if (Math.abs(moonToNatalSun - 180) <= 8) {
    signals.push(
      "The current Moon is opposing your natal Sun, which can make outside demands pull against your natural pace today.",
    );
  }

  const moonToNatalMoon = getAngularDistanceDegrees(
    params.currentMoonLongitudeDegrees,
    params.natalMoonLongitudeDegrees,
  );

  if (params.natalMoonSign !== null && moonToNatalMoon <= 8) {
    signals.push(
      `The current Moon is close to your natal Moon in ${params.natalMoonSign}, which can heighten familiar emotional habits and relationship sensitivity today.`,
    );
  }

  if (params.natalMercuryLongitudeDegrees !== null) {
    const moonToMercury = getAngularDistanceDegrees(
      params.currentMoonLongitudeDegrees,
      params.natalMercuryLongitudeDegrees,
    );

    if (moonToMercury <= 8 && params.natalMercurySign !== null) {
      signals.push(
        `The current Moon is close to your natal Mercury in ${params.natalMercurySign}, making conversations, texts, and mental loops more charged than usual.`,
      );
    }
  }

  if (params.natalVenusLongitudeDegrees !== null) {
    const moonToVenus = getAngularDistanceDegrees(
      params.currentMoonLongitudeDegrees,
      params.natalVenusLongitudeDegrees,
    );

    if (moonToVenus <= 8 && params.natalVenusSign !== null) {
      signals.push(
        `The current Moon is close to your natal Venus in ${params.natalVenusSign}, which can make closeness, softness, or reassurance stand out more today.`,
      );
    }
  }

  if (params.natalMarsLongitudeDegrees !== null) {
    const moonToMars = getAngularDistanceDegrees(
      params.currentMoonLongitudeDegrees,
      params.natalMarsLongitudeDegrees,
    );

    if (moonToMars <= 8 && params.natalMarsSign !== null) {
      signals.push(
        `The current Moon is close to your natal Mars in ${params.natalMarsSign}, which can raise impatience, courage, or friction quickly today.`,
      );
    } else if (Math.abs(moonToMars - 180) <= 8 && params.natalMarsSign !== null) {
      signals.push(
        `The current Moon is opposing your natal Mars in ${params.natalMarsSign}, so pushback, irritability, or split priorities may surface more easily today.`,
      );
    }
  }

  if (signals.length < 3) {
    signals.push(
      `Weekday context is minor support only, but ${params.weekday} may slightly influence pacing and social rhythm.`,
    );
  }

  return signals.slice(0, 4);
}

export function buildAstrologyContext(
  input: AstrologyContextInput,
): AstrologyContext {
  const birthTimezone = input.birth_timezone ?? input.timezone;
  const birthInstant = buildBirthInstant({
    birth_date: input.birth_date,
    birth_time: input.birth_time,
    timezone: birthTimezone,
  });
  const dailyInstant = buildDailyInstant(input);

  // Deterministic astronomy signals:
  // - natal Sun longitude/sign are calculated from a real astronomical library
  // - natal Moon sign is calculated from a real astronomical library
  // - natal Mercury, Venus, and Mars signs are calculated from the same library
  // Approximate / intentionally not implemented:
  // - rising_sign stays null because we do not yet have trustworthy birth coordinates
  //   or full chart-angle calculation in this MVP
  const sunLongitudeDegrees = roundDegrees(getSunLongitudeDegrees(birthInstant));
  const moonLongitudeDegrees = roundDegrees(getMoonLongitudeDegrees(birthInstant));
  const currentSunLongitudeDegrees = roundDegrees(getSunLongitudeDegrees(dailyInstant));
  const currentMoonLongitudeDegrees = roundDegrees(getMoonLongitudeDegrees(dailyInstant));
  let mercurySign: SignName | null = null;
  let venusSign: SignName | null = null;
  let marsSign: SignName | null = null;
  let mercuryLongitudeDegrees: number | null = null;
  let venusLongitudeDegrees: number | null = null;
  let marsLongitudeDegrees: number | null = null;

  const sunSign = getSignFromLongitude(sunLongitudeDegrees);
  const moonSign = getSignFromLongitude(moonLongitudeDegrees);
  const currentSunSign = getSignFromLongitude(currentSunLongitudeDegrees);
  const currentMoonSign = getSignFromLongitude(currentMoonLongitudeDegrees);
  const cuspProximityDegrees = getCuspProximityDegrees(sunLongitudeDegrees);
  const adjacentSign = getAdjacentSign(sunLongitudeDegrees);

  const limitations = [
    "Sun sign and Sun longitude are calculated deterministically from astronomy-engine using the stored birth date, birth time, and best available birth timezone.",
    "Moon sign is calculated deterministically from astronomy-engine using the same birth instant.",
    "Mercury, Venus, and Mars signs are calculated deterministically from astronomy-engine using the same birth instant when planetary positions are available.",
    "Current Sun and Moon positions are calculated deterministically for the target date and form the main daily layer.",
    "Daily signal strings are derived interpretation hints built from those real current positions and a small set of simple current-Moon-to-natal angular relationships.",
    "Rising sign is intentionally null because this MVP does not yet compute chart angles or houses.",
  ];

  try {
    mercuryLongitudeDegrees = roundDegrees(
      getPlanetLongitudeDegrees(Body.Mercury, birthInstant),
    );
    venusLongitudeDegrees = roundDegrees(
      getPlanetLongitudeDegrees(Body.Venus, birthInstant),
    );
    marsLongitudeDegrees = roundDegrees(
      getPlanetLongitudeDegrees(Body.Mars, birthInstant),
    );
    mercurySign = getSignFromLongitude(mercuryLongitudeDegrees);
    venusSign = getSignFromLongitude(venusLongitudeDegrees);
    marsSign = getSignFromLongitude(marsLongitudeDegrees);
  } catch {
    limitations.push(
      "Mercury, Venus, and Mars signs could not be computed from the current astronomical calculation, so those natal signals are left null.",
    );
  }

  if (input.birth_timezone === null) {
    limitations.push(
      "Birth timezone is missing, so the current saved timezone is being used as a fallback birth timezone.",
    );
  }

  if (input.birth_latitude === null || input.birth_longitude === null) {
    limitations.push(
      "Birth coordinates are missing, so coordinate-based chart angles and location-sensitive chart features are not available.",
    );
  }

  if (input.birth_time === null) {
    limitations.push(
      "Exact birth time is unavailable, so the birth instant uses 12:00 local time as a deterministic fallback for Sun and Moon calculations.",
    );
  } else if (input.birth_time_confidence !== "exact") {
    limitations.push(
      "Birth time is approximate, so Moon position and cusp proximity should be treated with added caution.",
    );
  }

  return {
    natal_context: {
      sun_sign: sunSign,
      sun_longitude_degrees: sunLongitudeDegrees,
      near_sign_boundary: cuspProximityDegrees !== null,
      adjacent_sign: adjacentSign,
      cusp_proximity_degrees: cuspProximityDegrees,
      moon_sign: moonSign,
      mercury_sign: mercurySign,
      venus_sign: venusSign,
      mars_sign: marsSign,
      rising_sign: null,
      birth_time_confidence: input.birth_time_confidence,
    },
    daily_context: {
      current_sun_sign: currentSunSign,
      current_sun_longitude_degrees: currentSunLongitudeDegrees,
      current_moon_sign: currentMoonSign,
      current_moon_longitude_degrees: currentMoonLongitudeDegrees,
      day_signals: buildDailySignals({
        currentSunSign,
        currentSunLongitudeDegrees,
        currentMoonSign,
        currentMoonLongitudeDegrees,
        natalSunSign: sunSign,
        natalSunLongitudeDegrees: sunLongitudeDegrees,
        natalMoonSign: moonSign,
        natalMoonLongitudeDegrees: moonLongitudeDegrees,
        natalMercurySign: mercurySign,
        natalMercuryLongitudeDegrees: mercuryLongitudeDegrees,
        natalVenusSign: venusSign,
        natalVenusLongitudeDegrees: venusLongitudeDegrees,
        natalMarsSign: marsSign,
        natalMarsLongitudeDegrees: marsLongitudeDegrees,
        weekday: input.weekday,
      }),
      timing_precision: getTimingPrecision(input.birth_time_confidence),
      limitations,
    },
  };
}
