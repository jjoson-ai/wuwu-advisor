import { NextResponse } from "next/server";

import {
  getOpsSessionCookieValue,
  isOpsPasswordCorrect,
  OPS_AUTH_COOKIE,
  OPS_AUTH_COOKIE_MAX_AGE,
} from "@/lib/ops-auth";

/** POST /api/ops/auth — validate password, set session cookie */
export async function POST(request: Request) {
  const formData = await request.formData();
  const password = formData.get("password");

  if (typeof password === "string" && isOpsPasswordCorrect(password)) {
    const cookieValue = await getOpsSessionCookieValue();
    const response = NextResponse.redirect(new URL("/ops", request.url), {
      status: 303,
    });
    response.cookies.set(OPS_AUTH_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: OPS_AUTH_COOKIE_MAX_AGE,
      path: "/",
    });
    return response;
  }

  const loginUrl = new URL("/ops/login", request.url);
  loginUrl.searchParams.set("error", "1");
  return NextResponse.redirect(loginUrl, { status: 303 });
}

/** GET /api/ops/auth/logout — clear session cookie */
export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/ops/login", request.url), {
    status: 303,
  });
  response.cookies.set(OPS_AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
  return response;
}
