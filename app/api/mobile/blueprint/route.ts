import { NextResponse } from "next/server";

import { formatBlueprintForPage } from "@/domain/blueprint/blueprint.formatter";
import { getBlueprintForUser } from "@/domain/blueprint/blueprint.service";
import { expandFreeBlueprintToBlueprint } from "@/domain/blueprint/blueprint.types";
import type { MobileBlueprintResponse } from "@/domain/mobile/mobile.types";
import { getRequestAuth } from "@/lib/auth";
import { getRequestAccessState } from "@/lib/debug-access";

export async function GET(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const accessState = getRequestAccessState(user, request);
    const blueprintRow = await getBlueprintForUser(user.id, accessToken);
    let blueprint = blueprintRow === null ? null : formatBlueprintForPage(blueprintRow);

    if (blueprint !== null && !accessState.featureAccess.canViewFullBlueprint) {
      // Strip Pro-only sections so they don't cross the wire for free/expired users.
      // Uses the same expand helper that web generation routes rely on — Pro fields
      // become "Locked on free tier" stubs, type stays FormattedBlueprint throughout.
      const { id, bazi_debug, generation_access_level, created_at, updated_at } = blueprint;
      blueprint = {
        ...expandFreeBlueprintToBlueprint({
          title: blueprint.title,
          summary: blueprint.summary,
          guiding_numbers: blueprint.guiding_numbers,
          chinese_signature: blueprint.chinese_signature,
          core_pattern: blueprint.core_pattern,
          communication_and_connection: blueprint.communication_and_connection,
        }),
        id,
        bazi_debug,
        generation_access_level,
        created_at,
        updated_at,
      };
    }

    const response: MobileBlueprintResponse = { blueprint };
    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load blueprint.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
