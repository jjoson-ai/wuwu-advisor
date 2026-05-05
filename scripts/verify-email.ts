import { sendEmail } from "@/lib/email/send";
import {
  suppressEmail,
  unsuppressEmail,
  isEmailSuppressed,
} from "@/lib/email/suppressions";

async function main() {
  const testEmail = process.env.TEST_EMAIL;
  if (testEmail == null || testEmail === "") {
    console.error(
      "Set TEST_EMAIL env var before running this script. Live send deferred until G0.2.",
    );
    process.exit(1);
  }

  console.log("--- Email infrastructure verification (mocked) ---");
  console.log("Target:", testEmail.replace(/(.{2})(.*)@/, "$1***@"));

  const key1 = `verify-${Date.now()}-1`;
  console.log("\n1. Send happy-path email...");
  const result1 = await sendEmail({
    to: testEmail,
    template: "verify",
    subject: "[Wuwu] Email Infra Verification",
    html: "<p>If you received this, the email abstraction works.</p>",
    idempotencyKey: key1,
  });
  console.log("Result:", result1);

  console.log("\n2. Duplicate idempotency key...");
  const result2 = await sendEmail({
    to: testEmail,
    template: "verify",
    subject: "[Wuwu] Email Infra Verification",
    html: "<p>Duplicate test.</p>",
    idempotencyKey: key1,
  });
  console.log("Result:", result2);

  console.log("\n3. Suppress and send...");
  await suppressEmail(testEmail, "manual");
  const suppressed = await isEmailSuppressed(testEmail);
  console.log("Is suppressed:", suppressed);

  const result3 = await sendEmail({
    to: testEmail,
    template: "verify",
    subject: "[Wuwu] Suppressed Test",
    html: "<p>Should not arrive.</p>",
    idempotencyKey: `verify-${Date.now()}-3`,
  });
  console.log("Result:", result3);

  console.log("\n4. Unsuppress and re-send (different key)...");
  await unsuppressEmail(testEmail);
  const stillSuppressed = await isEmailSuppressed(testEmail);
  console.log("Is suppressed after unsuppress:", stillSuppressed);

  const result4 = await sendEmail({
    to: testEmail,
    template: "verify",
    subject: "[Wuwu] Re-enabled Test",
    html: "<p>Should arrive after unsuppress.</p>",
    idempotencyKey: `verify-${Date.now()}-4`,
  });
  console.log("Result:", result4);

  console.log("\n--- Verification complete ---");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});