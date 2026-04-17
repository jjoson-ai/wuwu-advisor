import { NextResponse } from "next/server";

import { getFeedbackForDecisionGuidance } from "@/domain/decision/decision-feedback.service";
import { formatDecisionGuidanceForPage } from "@/domain/decision/decision.formatter";
import { classifyDecisionSafety } from "@/domain/decision/decision.safety";
import {
  getLatestDecisionGuidanceForUser,
  listRecentDecisionGuidanceForUser,
} from "@/domain/decision/decision.service";
import type { MobileAskResponse } from "@/domain/mobile/mobile.types";
import { getRequestAuth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const [latestRow, recentRows] = await Promise.all([
      getLatestDecisionGuidanceForUser(user.id, accessToken),
      listRecentDecisionGuidanceForUser(user.id, 10, accessToken),
    ]);

    const response: MobileAskResponse = {
      latest: latestRow === null ? null : formatDecisionGuidanceForPage(latestRow),
      latestFeedback:
        latestRow === null
          ? null
          : await getFeedbackForDecisionGuidance(user.id, latestRow.id, accessToken),
      recent: recentRows
        .filter((row) => classifyDecisionSafety(row.question_text) === "normal")
        .map(formatDecisionGuidanceForPage),
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load Ask data.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
