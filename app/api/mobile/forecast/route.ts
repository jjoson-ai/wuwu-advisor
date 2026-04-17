import { NextResponse } from "next/server";

import { formatForecastForPage } from "@/domain/forecast/forecast.formatter";
import { getForecastForUser } from "@/domain/forecast/forecast.service";
import type { MobileForecastResponse } from "@/domain/mobile/mobile.types";
import { getRequestAuth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const forecastRow = await getForecastForUser(user.id, accessToken);
    const response: MobileForecastResponse = {
      forecast: forecastRow === null ? null : formatForecastForPage(forecastRow),
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load forecast.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
