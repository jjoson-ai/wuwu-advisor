import { NextResponse } from "next/server";

import { upsertAccuracyShare } from "@/domain/accuracy/share.service";
import { getRequestAuth } from "@/lib/auth";

/**
 * POST /api/create-accuracy-share
 *
 * Creates (or returns the existing) share token for the authenticated user's
 * accuracy report. Idempotent — calling it multiple times returns the same
 * stable token so the user can always copy the same link.
 *
 * Response: { token: string }
 * The caller builds the full URL: /accuracy/share/[token]
 */
export async function POST(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const token = await upsertAccuracyShare(user.id, accessToken);

    return NextResponse.json({ token });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create share link.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
