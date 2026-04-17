import { NextResponse } from "next/server";

import { getFeedbackForDecisionGuidance } from "@/domain/decision/decision-feedback.service";
import { formatDecisionGuidanceForPage } from "@/domain/decision/decision.formatter";
import { getDecisionGuidanceByIdForUser } from "@/domain/decision/decision.service";
import type { MobileAskDetailResponse } from "@/domain/mobile/mobile.types";
import { getRequestAuth } from "@/lib/auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    const row = await getDecisionGuidanceByIdForUser(user.id, id, accessToken);

    if (row === null) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const response: MobileAskDetailResponse = {
      guidance: formatDecisionGuidanceForPage(row),
      feedback: await getFeedbackForDecisionGuidance(user.id, row.id, accessToken),
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load Ask detail.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
