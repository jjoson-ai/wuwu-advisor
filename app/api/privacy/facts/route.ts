import { NextResponse } from "next/server";

import {
  listFactsForUser,
  softDeleteAllFactsForUser,
} from "@/domain/memory/facts.store";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/privacy/facts
 * Returns all live (non-deleted) facts for the authenticated user.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (user === null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const facts = await listFactsForUser(user.id);

  return NextResponse.json({ facts });
}

/**
 * DELETE /api/privacy/facts
 * Soft-deletes all facts for the authenticated user ("forget everything").
 */
export async function DELETE() {
  const user = await getCurrentUser();

  if (user === null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const ok = await softDeleteAllFactsForUser(user.id);

  if (!ok) {
    return NextResponse.json(
      { error: "Unable to delete facts. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ message: "All remembered facts deleted." });
}
