import { NextResponse } from "next/server";
import { Webhook } from "svix";

import { suppressEmail } from "@/lib/email/suppressions";

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (webhookSecret == null || webhookSecret === "") {
    console.error("[Email Webhook] Missing RESEND_WEBHOOK_SECRET.");
    return NextResponse.json(
      { error: "Webhook secret not configured." },
      { status: 500 },
    );
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (
    svixId == null ||
    svixTimestamp == null ||
    svixSignature == null
  ) {
    return NextResponse.json(
      { error: "Missing Svix headers." },
      { status: 400 },
    );
  }

  const payload = await request.text();

  let evt: { type: string; data: Record<string, unknown> };

  try {
    const wh = new Webhook(webhookSecret);
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as { type: string; data: Record<string, unknown> };
  } catch {
    console.error("[Email Webhook] Invalid Svix signature.");
    return NextResponse.json(
      { error: "Invalid signature." },
      { status: 400 },
    );
  }

  const emailList = evt.data?.to;
  const rawEmail = Array.isArray(emailList)
    ? emailList[0]
    : typeof emailList === "string"
      ? emailList
      : null;

  if (typeof rawEmail !== "string" || rawEmail === "") {
    console.warn("[Email Webhook] No recipient email in event.", {
      type: evt.type,
    });
    return NextResponse.json({ received: true });
  }

  // suppressEmail throws on DB failure. We catch and return 503 so Resend
  // retries (Resend retries non-2xx with exponential backoff). Returning 200
  // when the suppression write failed would silently drop the
  // bounce/complaint and let future sends to the problem address through.
  try {
    if (evt.type === "email.bounced") {
      await suppressEmail(rawEmail, "bounce");
      console.info("[Email Webhook] Suppressed bounced address.", {
        type: evt.type,
      });
    } else if (evt.type === "email.complained") {
      await suppressEmail(rawEmail, "complaint");
      console.info("[Email Webhook] Suppressed complaint address.", {
        type: evt.type,
      });
    }
  } catch (suppressionError) {
    const reason =
      suppressionError instanceof Error
        ? suppressionError.message
        : String(suppressionError);
    console.error(
      "[Email Webhook] Suppression write failed; returning 503 so Resend will retry.",
      { type: evt.type, reason },
    );
    return NextResponse.json(
      { error: "Suppression write failed; please retry." },
      { status: 503 },
    );
  }

  return NextResponse.json({ received: true });
}