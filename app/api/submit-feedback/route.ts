import { NextResponse } from "next/server";

import { getLatestBriefingForUser } from "@/domain/briefing/briefing.service";
import { upsertBriefingFeedback } from "@/domain/feedback/feedback.service";
import {
  ACTED_ON_OPTIONS,
  type ActedOnValue,
} from "@/domain/feedback/feedback.types";
import { getRequestAuth } from "@/lib/auth";

function parseUsefulnessScore(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 5) {
    return numeric;
  }

  return null;
}

function parseActedOn(value: unknown) {
  if (
    typeof value === "string" &&
    ACTED_ON_OPTIONS.includes(value as ActedOnValue)
  ) {
    return value as ActedOnValue;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as {
      briefingId?: unknown;
      usefulnessScore?: unknown;
      actedOn?: unknown;
      note?: unknown;
    };

    if (typeof body.briefingId !== "string" || body.briefingId.length === 0) {
      return NextResponse.json(
        { error: "A valid briefingId is required." },
        { status: 400 },
      );
    }

    const usefulnessScore = parseUsefulnessScore(body.usefulnessScore);
    if (usefulnessScore === null) {
      return NextResponse.json(
        { error: "usefulnessScore must be an integer between 1 and 5." },
        { status: 400 },
      );
    }

    const actedOn = parseActedOn(body.actedOn);
    if (actedOn === null) {
      return NextResponse.json(
        { error: "actedOn must be one of yes, partial, or no." },
        { status: 400 },
      );
    }

    const latestBriefing = await getLatestBriefingForUser(user.id, accessToken);

    if (latestBriefing === null || latestBriefing.id !== body.briefingId) {
      return NextResponse.json(
        { error: "Feedback can only be attached to the currently displayed latest briefing." },
        { status: 400 },
      );
    }

    const note =
      typeof body.note === "string" && body.note.trim().length > 0
        ? body.note.trim()
        : null;

    const saveResult = await upsertBriefingFeedback(
      {
        briefingId: body.briefingId,
        userId: user.id,
        usefulnessScore,
        actedOn,
        note,
      },
      accessToken,
    );

    if (saveResult.success === false) {
      return NextResponse.json({ error: saveResult.message }, { status: 500 });
    }

    return NextResponse.json({
      feedback: saveResult.feedback,
      message: "Feedback saved.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to submit feedback.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
