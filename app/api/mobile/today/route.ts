import { NextResponse } from "next/server";

import { formatBriefingForDashboard } from "@/domain/briefing/briefing.formatter";
import { getLatestBriefingForUser } from "@/domain/briefing/briefing.service";
import { getFeedbackForBriefing } from "@/domain/feedback/feedback.service";
import type { MobileTodayResponse } from "@/domain/mobile/mobile.types";
import { getRequestAuth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const latestBriefing = await getLatestBriefingForUser(user.id, accessToken);
    const response: MobileTodayResponse = {
      briefing:
        latestBriefing === null ? null : formatBriefingForDashboard(latestBriefing),
      feedback:
        latestBriefing === null
          ? null
          : await getFeedbackForBriefing(user.id, latestBriefing.id, accessToken),
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load Today.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
