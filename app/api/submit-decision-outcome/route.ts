import { NextResponse } from "next/server";
import { z } from "zod";

import { submitDecisionOutcome } from "@/domain/decision/decision-log.service";
import { DECISION_OUTCOME_OPTIONS } from "@/domain/decision/decision-log.types";
import { getRequestAuth } from "@/lib/auth";
import { getRequestAccessState } from "@/lib/debug-access";
import { getRequestPlatform } from "@/lib/product-events";
import { logProductEvent } from "@/lib/product-events.server";

const BodySchema = z.object({
  logId: z.string().uuid(),
  outcome: z.enum(DECISION_OUTCOME_OPTIONS),
  outcomeNote: z.string().trim().max(500).nullish(),
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

    await submitDecisionOutcome(
      {
        logId: parsed.data.logId,
        userId: user.id,
        outcome: parsed.data.outcome,
        outcomeNote: parsed.data.outcomeNote ?? null,
      },
      accessToken,
    );

    const access = getRequestAccessState(user, request);
    const platform = getRequestPlatform(request);

    await logProductEvent({
      event_name: "decision_outcome_submitted",
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save outcome.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
