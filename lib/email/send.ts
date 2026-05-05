import { Resend } from "resend";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashEmail, extractDomain, isEmailSuppressed } from "./suppressions";

export type SendEmailInput = {
  to: string;
  template: string;
  subject: string;
  html: string;
  text?: string;
  idempotencyKey: string;
  userId?: string | null;
};

export type SendEmailResult =
  | { ok: true; messageId: string; status: "sent" }
  | { ok: true; messageId: null; status: "duplicate" | "suppressed" }
  | { ok: false; status: "failed"; reason: string };

let resendInstance: Resend | null = null;

function getResendClient(): Resend {
  if (resendInstance == null) {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey == null || apiKey === "") {
      throw new Error("Missing RESEND_API_KEY.");
    }
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
}

function _resetResendClient(): void {
  resendInstance = null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    const emailHash = await hashEmail(input.to);
    const emailDomain = extractDomain(input.to);

    const suppressed = await isEmailSuppressed(input.to);
    if (suppressed) {
      const admin = getSupabaseAdminClient();
      await admin.from("email_send_log").insert({
        idempotency_key: input.idempotencyKey,
        to_email_hash: emailHash,
        to_email_domain: emailDomain,
        template: input.template,
        user_id: input.userId ?? null,
        status: "suppressed",
        resend_message_id: null,
        error_message: null,
      });

      return { ok: true, messageId: null, status: "suppressed" };
    }

    const admin = getSupabaseAdminClient();

    const { data: insertedRow } = await admin
      .from("email_send_log")
      .insert({
        idempotency_key: input.idempotencyKey,
        to_email_hash: emailHash,
        to_email_domain: emailDomain,
        template: input.template,
        user_id: input.userId ?? null,
        status: "sent",
        resend_message_id: null,
        error_message: null,
      })
      .select("id")
      .single();

    if (insertedRow == null) {
      return { ok: true, messageId: null, status: "duplicate" };
    }

    try {
      const resend = getResendClient();
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM ?? "Wuwu <noreply@wuwu.ai>",
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text ?? undefined,
      });

      if (error != null) {
        const errorMsg = String(error.message ?? error).slice(0, 500);
        await admin
          .from("email_send_log")
          .update({ status: "failed", error_message: errorMsg })
          .eq("idempotency_key", input.idempotencyKey);

        return { ok: false, status: "failed", reason: errorMsg };
      }

      const messageId = data?.id ?? null;
      if (messageId != null) {
        await admin
          .from("email_send_log")
          .update({ resend_message_id: messageId })
          .eq("idempotency_key", input.idempotencyKey);
      }

      return { ok: true, messageId: messageId ?? "", status: "sent" };
    } catch (resendError: unknown) {
      const errorMsg = resendError instanceof Error
        ? resendError.message
        : String(resendError);
      const truncated = errorMsg.slice(0, 500);

      await admin
        .from("email_send_log")
        .update({ status: "failed", error_message: truncated })
        .eq("idempotency_key", input.idempotencyKey);

      return { ok: false, status: "failed", reason: truncated };
    }
  } catch (outerError: unknown) {
    const reason =
      outerError instanceof Error ? outerError.message : String(outerError);

    try {
      const admin = getSupabaseAdminClient();
      const emailHash = await hashEmail(input.to);
      await admin.from("email_send_log").insert({
        idempotency_key: input.idempotencyKey,
        to_email_hash: emailHash,
        to_email_domain: extractDomain(input.to),
        template: input.template,
        user_id: input.userId ?? null,
        status: "failed",
        resend_message_id: null,
        error_message: reason.slice(0, 500),
      });
    } catch {
      // Best-effort log; swallow.
    }

    return { ok: false, status: "failed", reason: reason.slice(0, 500) };
  }
}

export { _resetResendClient };