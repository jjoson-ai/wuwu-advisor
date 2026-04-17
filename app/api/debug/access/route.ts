import { NextResponse } from "next/server";

import {
  DEBUG_ACCESS_OVERRIDE_COOKIE,
  isDebugAccessOverrideEnabled,
} from "@/lib/debug-access";

const VALID_LEVELS = new Set(["free", "pro", "internal", "auto"]);

export async function GET(request: Request) {
  if (isDebugAccessOverrideEnabled() === false) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const level = url.searchParams.get("level")?.trim().toLowerCase() ?? "auto";
  const redirectParam = url.searchParams.get("redirect") ?? "/dashboard";
  const redirectPath =
    redirectParam.startsWith("/") && redirectParam.startsWith("//") === false
      ? redirectParam
      : "/dashboard";

  if (VALID_LEVELS.has(level) === false) {
    return NextResponse.json({ error: "Invalid debug access level." }, { status: 400 });
  }

  const response = NextResponse.redirect(new URL(redirectPath, request.url));

  if (level === "auto") {
    response.cookies.delete(DEBUG_ACCESS_OVERRIDE_COOKIE);
    return response;
  }

  response.cookies.set(DEBUG_ACCESS_OVERRIDE_COOKIE, level, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return response;
}
