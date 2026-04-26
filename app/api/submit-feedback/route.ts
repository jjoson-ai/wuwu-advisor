import { NextResponse } from "next/server";

import { getLatestBriefingForUser } from "@/domain/briefing/briefing.service";
import { upsertBriefingFeedback } from "@/domain/feedback/feedback.service";
import {
  RATING_EMOJI_OPTIONS,
  RATING_THEME_OPTIONS,
  type RatingEmojiValue,
  type RatingThemeValue,
} from "@/domain/feedback/feedback.types";
import { getRequestAuth } from "@/lib/auth";
import { getRequestAccessState } from "@/lib/debug-access";
import { getRequestPlatform } from "@/lib/product-events";
import { logProductEvent } from "@/lib/product-events.server";

function parseRatingEmoji(value: unknown): RatingEmojiValue | null {
  if (
    typeof value === "string" &&
    RATING_EMOJI_OPTIONS.includes(value as RatingEmojiValue)
  ) {
    return value as RatingEmojiValue;
  }

  return null;
}

/**
 * Accept a raw list from the client, strip duplicates, drop anything that
 * isn't a known theme. Cap at six so a malicious client can't bloat a row.
 */
function parseRatingThemes(value: unknown): RatingThemeValue[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;

  const seen = new Set<RatingThemeValue>();

  for (const candidate of value) {
    if (
      typeof candidate === "string" &&
      RATING_THEME_OPTIONS.includes(candidate as RatingThemeValue)
    ) {
      seen.add(candidate as RatingThemeValue);
    }
  }

  if (seen.size > RATING_THEME_OPTIONS.length) return null;

  return Array.from(seen);
}

export async function POST(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as {
      briefingId?: unknown;
      ratingEmoji?: unknown;
      ratingThemeHit?: unknown;
      ratingThemeMiss?: unknown;
      note?: unknown;
    };

    if (typeof body.briefingId !== "string" || body.briefingId.length === 0) {
      return NextResponse.json(
        { error: "A valid briefingId is required." },
        { status: 400 },
      );
    }

    const ratingEmoji = parseRatingEmoji(body.ratingEmoji);
    if (ratingEmoji === null) {
      return NextResponse.json(
        { error: "ratingEmoji must be one of nailed_it, vague, or off." },
        { status: 400 },
      );
    }

    const ratingThemeHit = parseRatingThemes(body.ratingThemeHit);
    if (ratingThemeHit === null) {
      return NextResponse.json(
        { error: "ratingThemeHit must be an array of valid theme names." },
        { status: 400 },
      );
    }

    const ratingThemeMiss = parseRatingThemes(body.ratingThemeMiss);
    if (ratingThemeMiss === null) {
      return NextResponse.json(
        { error: "ratingThemeMiss must be an array of valid theme names." },
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
        ratingEmoji,
        ratingThemeHit,
        ratingThemeMiss,
        note,
      },
      accessToken,
    );

    if (saveResult.success === false) {
      return NextResponse.json({ error: saveResult.message }, { status: 500 });
    }

    // Fire-and-forget funnel event so we can see rating volume + opt-in rate
    // in /ops without scanning briefing_feedback directly. Rating distribution
    // + per-theme counts stay in briefing_feedback (queryable for Phase B).
    try {
      const accessState = getRequestAccessState(user, request);
      await logProductEvent({
        event_name: "briefing_rating_submitted",
        timestamp: new Date().toISOString(),
        user_id: user.id,
        tier: accessState.accessLevel,
        platform: getRequestPlatform(request),
        feature: "today",
        plan_type: accessState.accessLevel === "free" ? "free" : "pro",
        upgrade_surface: null,
        request_id: null,
        final_model_selected: null,
        generation_path: null,
        fallback_triggered: null,
        request_cost_estimate_usd: null,
        request_cost_is_estimated: null,
        is_first_use: null,
        repeat_within_24h: null,
      });
    } catch (eventError) {
      console.error("[briefing_rating_event_failed]", eventError);
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
