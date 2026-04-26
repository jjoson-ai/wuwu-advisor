import { NextResponse } from "next/server";

import { formatForecastForPage } from "@/domain/forecast/forecast.formatter";
import { getForecastForUser } from "@/domain/forecast/forecast.service";
import { expandFreeForecastToForecast } from "@/domain/forecast/forecast.types";
import type { MobileForecastResponse } from "@/domain/mobile/mobile.types";
import { getRequestAuth } from "@/lib/auth";
import { getRequestAccessState } from "@/lib/debug-access";

export async function GET(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const accessState = getRequestAccessState(user, request);
    const forecastRow = await getForecastForUser(user.id, accessToken);
    let forecast = forecastRow === null ? null : formatForecastForPage(forecastRow);

    if (forecast !== null && !accessState.featureAccess.canViewFullForecast) {
      // Strip Pro-only sections so they don't cross the wire for free/expired users.
      // Uses the same expand helper that web generation routes rely on — Pro fields
      // become "Locked on free tier" stubs, type stays FormattedForecast throughout.
      const { id, generation_access_level, created_at, updated_at } = forecast;
      forecast = {
        ...expandFreeForecastToForecast({
          title: forecast.title,
          summary: forecast.summary,
        }),
        id,
        generation_access_level,
        created_at,
        updated_at,
      };
    }

    const response: MobileForecastResponse = { forecast };
    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load forecast.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
