import { NextResponse } from "next/server";

import { softDeleteFact } from "@/domain/memory/facts.store";
import { getCurrentUser } from "@/lib/auth";

/**
 * DELETE /api/privacy/facts/:id
 * Soft-deletes a single fact for the authenticated user.
 * The fact's embedding is retained for the rejection-list check so the
 * extractor doesn't re-extract it from the same source conversation.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (user === null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  if (typeof id !== "string" || id.trim() === "") {
    return NextResponse.json({ error: "Fact ID is required." }, { status: 400 });
  }

  const ok = await softDeleteFact(user.id, id);

  if (!ok) {
    return NextResponse.json(
      { error: "Unable to delete fact. It may not exist or may already be deleted." },
      { status: 404 },
    );
  }

  return NextResponse.json({ message: "Fact deleted." });
}
