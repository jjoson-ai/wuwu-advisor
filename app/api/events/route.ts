import { NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth";
import { getRequestAccessState } from "@/lib/debug-access";
import {
  ClientProductEventInputSchema,
  getRequestPlatform,
} from "@/lib/product-events";
import { logProductEvent } from "@/lib/product-events.server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = ClientProductEventInputSchema.parse(body);
    const { user } = await getRequestAuth(request);
    const accessState = getRequestAccessState(user, request);

    await logProductEvent({
      event_name: input.event_name,
      timestamp: new Date().toISOString(),
      user_id: user?.id ?? null,
      tier: user === null ? null : accessState.accessLevel,
      platform: getRequestPlatform(request),
      feature: input.feature ?? null,
      plan_type: input.plan_type ?? null,
      upgrade_surface: input.upgrade_surface ?? null,
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
  } catch {
    return NextResponse.json({ error: "Invalid event payload." }, { status: 400 });
  }
}
