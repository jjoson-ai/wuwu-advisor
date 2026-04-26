import { NextResponse } from "next/server";
import { z } from "zod";

import { upsertDecisionLog } from "@/domain/decision/decision-log.service";
import { getRequestAuth } from "@/lib/auth";
import { getRequestAccessState } from "@/lib/debug-access";
import { getRequestPlatform } from "@/lib/product-events";
import { logProductEvent } from "@/lib/product-events.server";

const BodySchema = z.object({
  decisionGuidanceId: z.string().uuid(),
  committedAction: z.string().trim().min(1).max(500),
  // "YYYY-MM-DD" in the user's local date — validated with a loose date regex.
  revisitAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "revisitAt must be YYYY-MM-DD"),
});

export async function POST(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);
    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as unknown;
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

    const log = await upsertDecisionLog(
      {
        userId: user.id,
        decisionGuidanceId: parsed.data.decisionGuidanceId,
        committedAction: parsed.data.committedAction,
        revisitAt: parsed.data.revisitAt,
      },
      accessToken,
    );

    const access = getRequestAccessState(user, request);
    const platform = getRequestPlatform(request);

    await logProductEvent({
      event_name: "decision_logged",
      timestamp: new Date().toISOString(),
      user_id: user.id,
      tier: access.accessLevel,
      platform,
      feature: "ask",
      plan_type: access.accessLevel === "free" ? "free" : "pro",
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

    return NextResponse.json({ log });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save decision log.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
