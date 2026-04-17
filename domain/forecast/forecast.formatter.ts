import {
  ForecastSchema,
  normalizeFreeForecastSummary,
  normalizePaidForecastSummary,
} from "@/domain/forecast/forecast.types";
import type {
  FormattedForecast,
  UserForecastRow,
} from "@/domain/forecast/forecast.types";
import { sanitizeForbiddenInternalTermsInUserOutput } from "@/lib/output-safety";

export function formatForecastForPage(row: UserForecastRow): FormattedForecast {
  const forecast = ForecastSchema.parse(row.forecast_json);
  const safeForecast = sanitizeForbiddenInternalTermsInUserOutput(
    row.generation_access_level === "free"
      ? {
          ...forecast,
          summary: normalizeFreeForecastSummary(forecast.summary),
        }
      : {
          ...forecast,
          summary: normalizePaidForecastSummary(forecast.summary),
        },
  );

  return {
    id: row.id,
    generation_access_level: row.generation_access_level,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...safeForecast,
  };
}
