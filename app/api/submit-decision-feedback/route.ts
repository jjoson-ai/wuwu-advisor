import { NextResponse } from "next/server";

import {
  getLatestDecisionGuidanceForUser,
} from "@/domain/decision/decision.service";
import {
  upsertDecisionGuidanceFeedback,
} from "@/domain/decision/decision-feedback.service";
import {
  ACTED_ON_OPTIONS,
  type ActedOnValue,
} from "@/domain/decision/decision-feedback.types";
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
      decisionGuidanceId?: unknown;
      usefulnessScore?: unknown;
      actedOn?: unknown;
      note?: unknown;
    };

    if (
      typeof body.decisionGuidanceId !== "string" ||
      body.decisionGuidanceId.length === 0
    ) {
      return NextResponse.json(
        { error: "A valid decisionGuidanceId is required." },
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

    const latestDecision = await getLatestDecisionGuidanceForUser(
      user.id,
      accessToken,
    );

    if (latestDecision === null || latestDecision.id !== body.decisionGuidanceId) {
      return NextResponse.json(
        {
          error:
            "Feedback can only be attached to the currently displayed latest decision guidance.",
        },
        { status: 400 },
      );
    }

    const note =
      typeof body.note === "string" && body.note.trim().length > 0
        ? body.note.trim()
        : null;

    const saveResult = await upsertDecisionGuidanceFeedback(
      {
        decisionGuidanceId: body.decisionGuidanceId,
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
