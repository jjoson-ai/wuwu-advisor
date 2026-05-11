# Email infrastructure — invariants

`lib/email/send.ts`, `lib/email/suppressions.ts`, `app/api/email/webhook/route.ts`. Shipped in Gate 1.5 (2026-05-08), hardened in PR #11 (2026-05-12) after Codex review caught silent-failure paths.

This file is the **contract**. If you patch any of these files, your patch must preserve every invariant listed here, or update both the code AND this doc together.

## 1. Hashed-only logging

**No raw email addresses are ever stored in our DB.** `lib/email/suppressions.ts::hashEmail` computes a SHA-256 hex digest of the trimmed + lowercased address. The send log stores `to_email_hash` + `to_email_domain` (bare domain) — not the full address. The suppression table is keyed by hash.

Tests in `tests/unit/email-send.test.ts` assert that `JSON.stringify(loggedData)` does not contain the raw test address. Don't loosen that.

Why: bounce/complaint storage is unbounded in time. PII minimization > convenience.

## 2. SQLSTATE 23505 = idempotency, NOT failure

The `email_send_log` table has a unique constraint on `idempotency_key`. When a duplicate send is attempted, Postgres returns SQLSTATE `23505` (`unique_violation`), surfaced by PostgREST as `error.code === "23505"`.

`sendEmail()` distinguishes **only** this code from a real DB failure:

```ts
if (insertError != null) {
  if (insertError.code === "23505") {
    return { ok: true, messageId: null, status: "duplicate" };
  }
  // Anything else (RLS rejection, FK violation, network) → failed
  return { ok: false, status: "failed", reason: insertError.message };
}
```

**Do not widen the catch.** Treating non-23505 errors as "duplicate" silently drops emails. The previous bug here was: `if (insertError) return duplicate` — that's wrong; any RLS misconfiguration would have caused users to never get their verification emails, and we'd never know.

The same pattern applies to `stripe_webhook_events` (`lib/billing.ts::tryClaimStripeEvent`). If you see a unique-constraint table elsewhere in the codebase, the rule generalizes: **23505 is the only code that means "retry, not failure".**

## 3. `suppressEmail` throws on DB failure

`suppressEmail(email, reason)` and `unsuppressEmail(email)` both **throw on DB error**. This is contractual.

The webhook handler relies on the throw:

```ts
try {
  await suppressEmail(rawEmail, "bounce");
} catch {
  return NextResponse.json({ error: "..." }, { status: 503 });
}
```

Resend retries non-2xx with exponential backoff. Returning 200 after a suppression write failure would silently drop the bounce/complaint event, and we'd continue sending to a problem address forever (which is how Resend reputation gets killed).

If you change `suppressEmail` to "swallow and log", the webhook handler **must** be changed in the same PR to detect failure via another channel (return value), or you've broken the contract.

`isEmailSuppressed` is the opposite — it fail-opens (returns `false` on DB error). This is intentional: an outage of the suppression read should not block sends. The cost is one extra send to a suppressed address during the outage; the benefit is that the broader email system stays up.

## 4. Suppression check before log insert

`sendEmail()` checks suppression **before** inserting the log row. If suppressed, it logs a `suppressed` row (for the operator to see in `email_send_log`) but **does not** call Resend.

Don't reorder. The previous bug here would have been: insert log → check suppression → never send. Then the log row says `status: sent` but nothing actually went out. The current order is correct.

## 5. Resend errors update the log row

If Resend returns an `error` in the API response, `sendEmail()` updates the existing log row (located by `idempotency_key`) with `status: failed` + `error_message`. It does NOT insert a new row (that would 23505).

If Resend **throws** (network timeout, DNS failure), the outer `try/catch` does the same update path. The outer-outer catch (if even the update fails) does a best-effort insert as a defensive log; we tolerate the duplicate-key error there silently.

## 6. The webhook is Svix-signed

`app/api/email/webhook/route.ts` verifies the Svix signature (`svix-id`, `svix-timestamp`, `svix-signature` headers) using `RESEND_WEBHOOK_SECRET`. Unsigned requests return 400.

If you spin up a local Resend webhook test, use the Svix CLI or paste a real signed payload from the Resend dashboard — don't disable verification in dev. The bug there would be: dev mode bypasses, you ship the bypass to prod, attacker forges suppression events.

## 7. Idempotency keys

Every caller of `sendEmail()` must supply an `idempotencyKey`. The recommended shape: `<template>:<userId>:<contextId>` (e.g. `password-reset:user-abc:request-2025-05-12T14:00`). The key should be deterministic from the action being emailed — that's what makes retry safe.

Don't pass `Math.random()` or `Date.now()` as the key. Don't pass the user's email as the key (hashed already; redundant; lossy).

## 8. `EMAIL_FROM` env var

The `from` address comes from `EMAIL_FROM` (default `Wuwu <noreply@wuwu.ai>`). This MUST match the domain whose DKIM is verified in Resend. If the domain doesn't match, sends will go out but DKIM-FAIL and gmail/outlook will deliver to spam.

In env per environment:

- `development` / `preview`: `Wuwu Dev <dev@wuwu.ai>` (separate verified subdomain, if desired)
- `production`: `Wuwu <noreply@wuwu.ai>`

## 9. Tests are the spec

`tests/unit/email-send.test.ts` is the executable spec for these invariants. 9 tests:

1. Happy path — returns `{ok: true, status: "sent"}`.
2. Duplicate (23505) — returns `{ok: true, status: "duplicate"}`, Resend NOT called.
3. Non-23505 insert error — returns `{ok: false, status: "failed"}`, Resend NOT called.
4. Suppressed — returns `{ok: true, status: "suppressed"}`, Resend NOT called.
5. Resend API error — returns `{ok: false, status: "failed"}`, does NOT throw.
6. Resend throws exception — returns `{ok: false, status: "failed"}`, never re-throws.
7. Hashed-email assertion — log row contains no raw email.
8. `EMAIL_FROM` env honored.
9. Hash determinism + uniqueness.

If you change `sendEmail` and one of these fails, the failing test is the source of truth — don't "fix" the test to make CI green. The whole point of these tests is to catch regression of these invariants.

## 10. What's next (not yet done)

- Bounce reporting dashboard in `/ops`. Currently we just write to `email_suppressions`; no UX to see complaint rate.
- Per-template rate limits (e.g. password-reset capped at 5/hour/user beyond the global quota).
- Reinstate flow for false-positive suppression (`unsuppressEmail` exists but no admin UI yet).

These are tracked in `bd` as P3 follow-ups.
