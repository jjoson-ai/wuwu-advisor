const FREEASTROAPI_BASE_URL = "https://api.freeastroapi.com";
const MIN_FREEASTRO_REQUEST_INTERVAL_MS = 1100;
const DEFAULT_RETRY_AFTER_MS = 1500;

export type BaziCalculationMarker = "M" | "F";

export type FreeAstroBaziChart = {
  year_pillar: string;
  month_pillar: string;
  day_pillar: string;
  hour_pillar: string;
  day_master: string;
  five_element_balance: string | null;
  favorable_element: string | null;
};

export type ChineseCurrentPillarsSummary = {
  timestamp_utc: string;
  year_pillar: string;
  month_pillar: string;
  day_pillar: string;
  hour_pillar: string;
  day_master: string;
  elements_today: Record<string, number>;
};

export type VedicPanchangSummary = {
  tithi: string;
  nakshatra: string;
  yoga: string;
  rahu_kalam: { start: string; end: string } | null;
  abhijit_muhurta: { start: string; end: string } | null;
  sunrise: string | null;
  sunset: string | null;
};

export type FreeAstroDailyContext = {
  chinese_current_pillars: ChineseCurrentPillarsSummary | null;
  vedic_panchang: VedicPanchangSummary | null;
  notes: string[];
  limitations: FreeAstroLimitation[];
};

export type FreeAstroLimitation = {
  endpoint: string;
  status_code: number | null;
  detail: string;
  retried: boolean;
};

type FreeAstroRequestOptions = {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
};

type FreeAstroErrorPayload = {
  detail: string;
  retryAfterMs: number | null;
};

type FreeAstroPillar = {
  label?: "year" | "month" | "day" | "hour" | string;
  gan_zhi?: string;
  gan?: string;
  zhi?: string;
  element?: {
    stem?: string;
    branch?: string;
  };
};

type FreeAstroDayMaster = {
  stem?: string;
  pinyin?: string;
  name?: string;
  info?: {
    name?: string;
    element?: string;
    polarity?: string;
  };
  element?: string;
  polarity?: string;
};

type FreeAstroResponseNode = {
  timestamp?: string;
  pillars?: FreeAstroPillar[];
  year_pillar?: string | FreeAstroPillar;
  month_pillar?: string | FreeAstroPillar;
  day_pillar?: string | FreeAstroPillar;
  hour_pillar?: string | FreeAstroPillar;
  day_master?: string | FreeAstroDayMaster;
  elements_today?: Record<string, number | string>;
  elements?: {
    points?: Record<string, number | string>;
  };
  professional?: {
    yong_shen_candidates?: string[];
  };
  chart?: FreeAstroResponseNode;
  data?: FreeAstroResponseNode;
  result?: FreeAstroResponseNode;
};

type PanchangApiResponse = {
  tithi?: { name?: string; paksha?: string };
  nakshatra?: { name?: string; pada?: number };
  yoga?: { name?: string };
  rahu_kalam?: { start?: string; end?: string };
  abhijit_muhurta?: { start?: string; end?: string; available?: boolean };
  sunrise?: string;
  sunset?: string;
};

let freeAstroRequestLock: Promise<void> = Promise.resolve();
let lastFreeAstroRequestStartedAt = 0;

function getFreeAstroApiKey() {
  const value = process.env.FREEASTROAPI_API_KEY?.trim();
  return value === "" ? null : value ?? null;
}

export function hasFreeAstroApiKey() {
  return getFreeAstroApiKey() !== null;
}

function ensureFreeAstroApiKey() {
  const apiKey = getFreeAstroApiKey();

  if (apiKey === null) {
    throw new Error(
      "FREEASTROAPI_API_KEY is not configured. Add it to .env.local to enable FreeAstroAPI integrations.",
    );
  }

  return apiKey;
}

async function requestFreeAstroApi<T>(
  options: FreeAstroRequestOptions,
): Promise<T> {
  const apiKey = ensureFreeAstroApiKey();
  const firstResponse = await sendFreeAstroRequest(options, apiKey);

  if (firstResponse.ok) {
    return parseJsonResponse<T>(firstResponse, options.path);
  }

  const firstError = await parseFreeAstroError(firstResponse);

  if (firstResponse.status === 429) {
    await sleep(firstError.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS);
    const retryResponse = await sendFreeAstroRequest(options, apiKey);

    if (retryResponse.ok) {
      return parseJsonResponse<T>(retryResponse, options.path);
    }

    const retryError = await parseFreeAstroError(retryResponse);
    throw new FreeAstroRequestError({
      endpoint: options.path,
      statusCode: retryResponse.status,
      detail: retryError.detail,
      retried: true,
    });
  }

  throw new FreeAstroRequestError({
    endpoint: options.path,
    statusCode: firstResponse.status,
    detail: firstError.detail,
    retried: false,
  });
}

function summarizeElementBalance(
  points: Record<string, number> | undefined,
): string | null {
  if (points === undefined) {
    return null;
  }

  const entries = Object.entries(points).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return null;
  }

  const strongest = entries[0];
  const weakest = entries[entries.length - 1];
  const secondary = entries[1] ?? null;

  return secondary === null
    ? `${strongest[0]} is dominant.`
    : `${strongest[0]} is dominant, ${secondary[0]} is secondary, and ${weakest[0]} is the weakest element.`;
}

function buildDayMasterLabel(response: FreeAstroResponseNode) {
  if ("day_master" in response === false || response.day_master == null) {
    return "unknown";
  }

  if (typeof response.day_master === "string") {
    const normalized = response.day_master.trim();
    return normalized === "" ? "unknown" : normalized;
  }

  const dayMaster: FreeAstroDayMaster = response.day_master;
  const info = dayMaster.info;

  if (info?.name != null && info.name !== "") {
    return info.name;
  }

  if (dayMaster.name != null && dayMaster.name !== "") {
    return dayMaster.name;
  }

  const stem = dayMaster.stem ?? null;
  const element = info?.element ?? dayMaster.element ?? null;

  if (stem != null && element != null) {
    return `${stem} ${element}`;
  }

  return stem ?? "unknown";
}

class FreeAstroRequestError extends Error {
  endpoint: string;
  statusCode: number | null;
  detail: string;
  retried: boolean;

  constructor(params: {
    endpoint: string;
    statusCode: number | null;
    detail: string;
    retried: boolean;
  }) {
    super(
      `FreeAstroAPI ${params.endpoint} failed${
        params.statusCode == null ? "" : ` with ${params.statusCode}`
      }: ${params.detail}`,
    );
    this.name = "FreeAstroRequestError";
    this.endpoint = params.endpoint;
    this.statusCode = params.statusCode;
    this.detail = params.detail;
    this.retried = params.retried;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withFreeAstroThrottle<T>(action: () => Promise<T>): Promise<T> {
  const previousLock = freeAstroRequestLock;
  let releaseLock: () => void = () => {};
  freeAstroRequestLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  await previousLock.catch(() => undefined);

  const waitMs = Math.max(
    0,
    MIN_FREEASTRO_REQUEST_INTERVAL_MS - (Date.now() - lastFreeAstroRequestStartedAt),
  );

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  lastFreeAstroRequestStartedAt = Date.now();

  try {
    return await action();
  } finally {
    releaseLock();
  }
}

async function sendFreeAstroRequest(
  options: FreeAstroRequestOptions,
  apiKey: string,
) {
  return withFreeAstroThrottle(() =>
    fetch(`${FREEASTROAPI_BASE_URL}${options.path}`, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    }),
  );
}

async function parseJsonResponse<T>(
  response: Response,
  endpoint: string,
): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new FreeAstroRequestError({
      endpoint,
      statusCode: response.status,
      detail: "response could not be parsed as JSON",
      retried: false,
    });
  }
}

async function parseFreeAstroError(
  response: Response,
): Promise<FreeAstroErrorPayload> {
  const retryAfterHeader = response.headers.get("retry-after");
  const responseText = (await response.text()).trim();
  const retryAfterMsFromHeader = parseRetryAfterHeader(retryAfterHeader);

  if (responseText === "") {
    return {
      detail: "empty error response",
      retryAfterMs: retryAfterMsFromHeader,
    };
  }

  try {
    const parsed = JSON.parse(responseText) as Record<string, unknown>;
    return {
      detail:
        normalizeDetail(
          [
            pickString(parsed.detail),
            pickString(parsed.error),
            pickString(parsed.message),
          ].find((value) => value != null) ?? responseText,
        ) ?? "request failed",
      retryAfterMs:
        pickRetryAfterMs(parsed.retry_after_ms) ??
        pickRetryAfterMs(parsed.retryAfterMs) ??
        retryAfterMsFromHeader,
    };
  } catch {
    return {
      detail: normalizeDetail(responseText) ?? "request failed",
      retryAfterMs: retryAfterMsFromHeader,
    };
  }
}

function parseRetryAfterHeader(value: string | null) {
  if (value == null || value.trim() === "") {
    return null;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const retryDateMs = Date.parse(value);

  if (Number.isNaN(retryDateMs)) {
    return null;
  }

  return Math.max(0, retryDateMs - Date.now());
}

function pickString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function pickRetryAfterMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : null;
  }

  return null;
}

function normalizeDetail(value: string) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed === "" ? null : collapsed.slice(0, 180);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

function requireString(
  value: unknown,
  endpoint: string,
  label: string,
  statusCode = 200,
) {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }

  throw new FreeAstroRequestError({
    endpoint,
    statusCode,
    detail: `response parsing failed: missing ${label}`,
    retried: false,
  });
}

function requireRecord(
  value: unknown,
  endpoint: string,
  label: string,
  statusCode = 200,
) {
  if (isRecord(value)) {
    return value as Record<string, unknown>;
  }

  throw new FreeAstroRequestError({
    endpoint,
    statusCode,
    detail: `response parsing failed: missing ${label}`,
    retried: false,
  });
}

function normalizePillarLabel(label: unknown) {
  if (typeof label !== "string") {
    return null;
  }

  const normalized = label.trim().toLowerCase().replace(/[^a-z]/g, "");

  if (normalized.startsWith("year")) {
    return "year" as const;
  }

  if (normalized.startsWith("month")) {
    return "month" as const;
  }

  if (normalized.startsWith("day")) {
    return "day" as const;
  }

  if (normalized.startsWith("hour")) {
    return "hour" as const;
  }

  return null;
}

function getResponseNodes(response: FreeAstroResponseNode) {
  return [
    response,
    response.data,
    response.chart,
    response.result,
  ].filter((node): node is FreeAstroResponseNode => node != null);
}

function getPrimaryResponseNode(response: FreeAstroResponseNode) {
  const nodes = getResponseNodes(response);

  return (
    nodes.find((node) => {
      const pillars = getPillarsFromNode(node);
      return pillars != null && pillars.length > 0;
    }) ??
    nodes.find((node) => node.day_master != null || node.timestamp != null) ??
    response
  );
}

function buildPillarsFromNamedFields(
  node: FreeAstroResponseNode,
): FreeAstroPillar[] | null {
  const namedPillars = {
    year: node.year_pillar,
    month: node.month_pillar,
    day: node.day_pillar,
    hour: node.hour_pillar,
  } as const;
  const labels = ["year", "month", "day", "hour"] as const;
  const pillars = labels
    .map((label) => {
      const rawValue = namedPillars[label];

      if (rawValue == null) {
        return null;
      }

      if (typeof rawValue === "string") {
        return {
          label,
          gan_zhi: rawValue,
        } satisfies FreeAstroPillar;
      }

      return {
        ...rawValue,
        label,
      };
    })
    .filter((pillar) => pillar !== null);

  return pillars.length === 0 ? null : (pillars as FreeAstroPillar[]);
}

function getPillarsFromNode(node: FreeAstroResponseNode) {
  if (Array.isArray(node.pillars) && node.pillars.length > 0) {
    return node.pillars;
  }

  return buildPillarsFromNamedFields(node);
}

function getAvailablePillarLabels(pillars: FreeAstroPillar[] | null) {
  if (pillars == null) {
    return "none";
  }

  const labels = pillars.flatMap((pillar) => {
    const normalized = normalizePillarLabel(pillar.label);
    return normalized == null ? [] : [normalized];
  });

  return labels.length === 0 ? "none" : Array.from(new Set(labels)).join(",");
}

function buildPillarGanZhi(pillar: FreeAstroPillar) {
  if (typeof pillar.gan_zhi === "string" && pillar.gan_zhi.trim() !== "") {
    return pillar.gan_zhi.trim();
  }

  if (
    typeof pillar.gan === "string" &&
    pillar.gan.trim() !== "" &&
    typeof pillar.zhi === "string" &&
    pillar.zhi.trim() !== ""
  ) {
    return `${pillar.gan.trim()}${pillar.zhi.trim()}`;
  }

  return null;
}

function requirePillarValue(
  response: FreeAstroResponseNode,
  label: "year" | "month" | "day" | "hour",
  endpoint: string,
  statusCode = 200,
) {
  const node = getPrimaryResponseNode(response);
  const pillars = getPillarsFromNode(node);

  if (pillars == null || pillars.length === 0) {
    throw new FreeAstroRequestError({
      endpoint,
      statusCode,
      detail: "response parsing failed: missing pillars array",
      retried: false,
    });
  }

  const pillar =
    pillars.find((item) => normalizePillarLabel(item.label) === label) ?? null;
  const ganZhi = pillar === null ? null : buildPillarGanZhi(pillar);

  if (ganZhi != null) {
    return ganZhi;
  }

  throw new FreeAstroRequestError({
    endpoint,
    statusCode,
    detail: `response parsing failed: missing ${label} pillar (available labels: ${getAvailablePillarLabels(pillars)})`,
    retried: false,
  });
}

function requireDayMasterLabel(
  response: FreeAstroResponseNode,
  endpoint: string,
  statusCode = 200,
) {
  const node = getPrimaryResponseNode(response);
  const label = buildDayMasterLabel(node);

  if (label !== "unknown") {
    return label;
  }

  const pillars = getPillarsFromNode(node);
  const dayPillar =
    pillars?.find((item) => normalizePillarLabel(item.label) === "day") ?? null;

  if (dayPillar != null && typeof dayPillar.gan === "string" && dayPillar.gan !== "") {
    const stemElement =
      isRecord(dayPillar.element) && pickString(dayPillar.element.stem) != null
        ? pickString(dayPillar.element.stem)
        : null;

    return stemElement == null ? dayPillar.gan : `${dayPillar.gan} ${stemElement}`;
  }

  throw new FreeAstroRequestError({
    endpoint,
    statusCode,
    detail: "response parsing failed: missing day_master",
    retried: false,
  });
}

function normalizeNumericRecord(value: unknown) {
  if (isRecord(value) === false) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => {
        const normalizedValue =
          typeof entryValue === "number"
            ? entryValue
            : typeof entryValue === "string" && entryValue.trim() !== ""
              ? Number(entryValue)
              : Number.NaN;

        return Number.isFinite(normalizedValue) ? [key, normalizedValue] : null;
      })
      .filter((entry): entry is [string, number] => entry !== null),
  );
}

function logFreeAstroDebug(limitation: FreeAstroLimitation) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.warn(
    `[FreeAstroAPI] endpoint=${limitation.endpoint} status=${limitation.status_code ?? "none"} retried=${limitation.retried} detail=${limitation.detail}`,
  );
}

export function getFreeAstroLimitation(
  error: unknown,
  fallback: {
    endpoint: string;
    detail: string;
  },
): FreeAstroLimitation {
  if (error instanceof FreeAstroRequestError) {
    const limitation = {
      endpoint: error.endpoint,
      status_code: error.statusCode,
      detail: error.detail,
      retried: error.retried,
    };

    logFreeAstroDebug(limitation);
    return limitation;
  }

  const limitation = {
    endpoint: fallback.endpoint,
    status_code: null,
    detail:
      error instanceof Error ? normalizeDetail(error.message) ?? fallback.detail : fallback.detail,
    retried: false,
  };

  logFreeAstroDebug(limitation);
  return limitation;
}

export async function fetchFreeAstroBazi(params: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  city: string;
  lat: number;
  lng: number;
  sex: BaziCalculationMarker;
}) {
  const endpoint = "/api/v1/chinese/bazi";
  const response = await requestFreeAstroApi<FreeAstroResponseNode>({
    method: "POST",
    path: endpoint,
    body: {
      year: params.year,
      month: params.month,
      day: params.day,
      hour: params.hour,
      minute: params.minute,
      city: params.city,
      lat: params.lat,
      lng: params.lng,
      sex: params.sex,
      time_standard: "civil",
      include_professional: true,
    },
  });

  return {
    year_pillar: requirePillarValue(response, "year", endpoint),
    month_pillar: requirePillarValue(response, "month", endpoint),
    day_pillar: requirePillarValue(response, "day", endpoint),
    hour_pillar: requirePillarValue(response, "hour", endpoint),
    day_master: requireDayMasterLabel(response, endpoint),
    five_element_balance: summarizeElementBalance(
      normalizeNumericRecord(getPrimaryResponseNode(response).elements?.points),
    ),
    favorable_element:
      getPrimaryResponseNode(response).professional?.yong_shen_candidates?.[0] ?? null,
  } satisfies FreeAstroBaziChart;
}

export async function fetchFreeAstroChineseToday() {
  const endpoint = "/api/v1/chinese/today";
  const response = await requestFreeAstroApi<FreeAstroResponseNode>({
    method: "GET",
    path: endpoint,
  });
  const node = getPrimaryResponseNode(response);
  const timestamp = requireString(node.timestamp, endpoint, "timestamp");

  return {
    timestamp_utc: timestamp,
    year_pillar: requirePillarValue(response, "year", endpoint),
    month_pillar: requirePillarValue(response, "month", endpoint),
    day_pillar: requirePillarValue(response, "day", endpoint),
    hour_pillar: requirePillarValue(response, "hour", endpoint),
    day_master: requireDayMasterLabel(response, endpoint),
    elements_today: normalizeNumericRecord(node.elements_today),
  } satisfies ChineseCurrentPillarsSummary;
}

export async function fetchFreeAstroPanchang(params: {
  year: number;
  month: number;
  day: number;
  lat: number;
  lng: number;
  city?: string | null;
  tzStr?: string | null;
}) {
  const endpoint = "/api/v1/vedic/panchang";
  const response = await requestFreeAstroApi<PanchangApiResponse>({
    method: "POST",
    path: endpoint,
    body: {
      year: params.year,
      month: params.month,
      day: params.day,
      lat: params.lat,
      lng: params.lng,
      city: params.city ?? undefined,
      tz_str: params.tzStr ?? "AUTO",
    },
  });
  const tithi = requireRecord(response.tithi, endpoint, "tithi");
  const nakshatra = requireRecord(response.nakshatra, endpoint, "nakshatra");
  const yoga = requireRecord(response.yoga, endpoint, "yoga");

  return {
    tithi: [
      pickString(tithi.name),
      pickString(tithi.paksha),
    ]
      .filter(Boolean)
      .join(" "),
    nakshatra: [
      pickString(nakshatra.name),
      nakshatra.pada == null ? null : `Pada ${nakshatra.pada}`,
    ]
      .filter(Boolean)
      .join(" "),
    yoga: requireString(yoga.name, endpoint, "yoga.name"),
    rahu_kalam:
      response.rahu_kalam?.start != null && response.rahu_kalam?.end != null
        ? {
            start: response.rahu_kalam.start,
            end: response.rahu_kalam.end,
          }
        : null,
    abhijit_muhurta:
      response.abhijit_muhurta?.available === true &&
      response.abhijit_muhurta.start != null &&
      response.abhijit_muhurta.end != null
        ? {
            start: response.abhijit_muhurta.start,
            end: response.abhijit_muhurta.end,
          }
        : null,
    sunrise: response.sunrise ?? null,
    sunset: response.sunset ?? null,
  } satisfies VedicPanchangSummary;
}
