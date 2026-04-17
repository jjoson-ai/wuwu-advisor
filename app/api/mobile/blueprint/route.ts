import { NextResponse } from "next/server";

import { formatBlueprintForPage } from "@/domain/blueprint/blueprint.formatter";
import { getBlueprintForUser } from "@/domain/blueprint/blueprint.service";
import type { MobileBlueprintResponse } from "@/domain/mobile/mobile.types";
import { getRequestAuth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const blueprintRow = await getBlueprintForUser(user.id, accessToken);
    const response: MobileBlueprintResponse = {
      blueprint: blueprintRow === null ? null : formatBlueprintForPage(blueprintRow),
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load blueprint.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
