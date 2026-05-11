# Stripe live-mode flip — protocol

The single most irreversible deploy in this project. Test-mode → live-mode is one webhook signing-secret rotation away from a "we are processing real customer credit cards and either grant access correctly or we don't" state. Read this whole file before touching `STRIPE_SECRET_KEY` in production env.

Corresponds to Gates **G3.5**, **G3.6**, **G3.7** in the launch plan.

## 1. Pre-flight (G3.5: Stripe Tax)

Before flipping live, Stripe Tax must be configured **in test mode** first:

1. Stripe dashboard → Settings → Tax → enable Stripe Tax.
2. Register the jurisdictions where you have tax obligations. For US-based ops launching internationally: typically US (sales tax origin state) + EU (OSS for VAT) + UK + Australia + Canada. **Get a tax advisor's input** before this — this is not a coding decision.
3. Map products to tax categories: subscription = "Software as a service (SaaS) — General".
4. Verify in test mode that a checkout from an EU IP charges VAT correctly.
5. Verify a US in-state vs out-of-state checkout charges the right sales tax.
6. **Only after Stripe Tax test-mode is verified** do you proceed to live flip.

## 2. The flip (G3.6)

The full sequence (estimated 30 minutes of focused work):

### Step 1: Stripe live-mode webhook

In Stripe dashboard, **live mode** (toggle in upper-left):

1. Developers → Webhooks → Add endpoint.
2. URL: `https://wuwu-advisor.com/api/stripe/webhook`.
3. Events to send: minimum `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`. Add others later as routes are added. (These three are the exact set the handler in `app/api/stripe/webhook/route.ts` switches on as of writing — if you configure the wrong event names in Stripe, failed-payment access revocation silently never fires.)
4. **Copy the signing secret** (`whsec_...`). This is what goes into the env var.

### Step 2: Vercel env

In Vercel project → Settings → Environment Variables, edit the **Production** scope (NOT Preview):

- `STRIPE_SECRET_KEY` → `sk_live_...`
- `STRIPE_WEBHOOK_SECRET` → `whsec_...` from Step 1
- `STRIPE_PRO_PRICE_ID` → the live-mode price ID for monthly
- `STRIPE_PRO_ANNUAL_PRICE_ID` → the live-mode price ID for annual

**Preview env stays on test-mode keys.** Mixing scopes is how live charges accidentally happen against preview deploys, or how test charges accidentally don't grant Pro on production.

### Step 3: Trigger redeploy

Vercel won't pick up env var changes on existing builds. Push an empty commit OR redeploy from the dashboard. Wait for green.

### Step 4: Sanity check before any real charge

```bash
# Should respond 400 (missing signature) with the new webhook secret, NOT 500
curl -X POST https://wuwu-advisor.com/api/stripe/webhook -H 'Content-Type: application/json' -d '{}'

# Stripe CLI: trigger an event with the live webhook secret
stripe trigger checkout.session.completed --api-key sk_live_... # CAREFUL — this is real
```

Or, less risky: trigger via Stripe dashboard → live webhooks → "Send test event". This sends a synthetic event signed by the live secret without creating a charge. If your handler logs the event arriving and processes cleanly (no 500), the signing secret is matched.

### Step 5: The actual money-test (G3.7)

Use a **real credit card you control** (yours). Open `wuwu-advisor.com/pricing`:

1. Sign up a fresh test user (use an email alias you control).
2. Click Upgrade → choose monthly ($14.99).
3. Complete Stripe Checkout with the real card.
4. Confirm:
   - Charge appears in Stripe live dashboard within 30s.
   - Webhook handler logs `pro_activated` for the right user.
   - `auth.users` row's `app_metadata.access_level === "pro"` within 5s of webhook.
   - User can access a Pro-only feature in the app.
5. In Stripe dashboard → refund the charge (full).
6. Confirm:
   - Webhook fires `customer.subscription.deleted` or equivalent (depending on whether refund cancels subscription — for a $14.99 monthly with no trial, refund usually doesn't cancel sub on its own; you may need to also cancel the sub explicitly).
   - User's `access_level` reverts to `free` within 5s of cancellation event.

If anything in steps 4–6 fails, **stop and triage before announcing launch**. A broken webhook in live mode is the worst-feeling bug class in this codebase.

## 3. Things that go wrong (history)

- **Signing secret mismatch.** Symptom: webhook returns 400 ("Invalid signature") for real events. Fix: re-copy the signing secret from the live-mode endpoint config; ensure no whitespace.
- **Wrong env scope.** Symptom: live charge appears in Stripe but webhook handler runs against test-mode secret and 400s. Fix: confirm `STRIPE_WEBHOOK_SECRET` is set in Production scope, not Preview. Redeploy.
- **Webhook URL pointing to preview.** Symptom: live charges hit a preview URL whose env happens to have test mode. Fix: live webhook endpoint must be `https://wuwu-advisor.com/api/stripe/webhook`, not `*.vercel.app`.
- **Price ID mismatch.** Symptom: checkout succeeds but app sees wrong tier in metadata. Fix: live and test mode have DIFFERENT price IDs; use the live-mode IDs in production env.
- **Idempotency table not migrated.** Symptom: webhook double-grants Pro on retry. Fix: ensure `sql/011_stripe_webhook_events.sql` has been applied to the production Supabase project before flipping.

## 4. Post-flip ops (G6.6)

After the first 24 hours live:

- Open Stripe dashboard daily for the first week. Confirm webhook delivery success rate ≥ 99%.
- Monitor `stripe_webhook_events` table for stuck or repeated events.
- Monitor Sentry for any error tagged with `app.api.stripe.webhook`.
- Refunds: handle manually for the first month before automating any policy.
- Chargebacks: when one comes in, you have ~7 days to respond with evidence. Pull the user's `product_events` history for the disputed transaction.
- Failed payments: `invoice.payment_failed` event currently revokes access immediately. Consider adding a dunning email sequence (G3.4 templates already include this) and a grace period (e.g. 3 days of "payment failing, retry"). Default is harsh; tune after watching real failures.

## 5. The undo

Live mode has no real "undo" — you've taken real charges. If you must revert:

1. Cancel all active subscriptions via Stripe dashboard or API.
2. Refund recent charges.
3. Flip env vars back to test-mode keys.
4. Trigger redeploy.
5. Communicate with affected users via email (manual, individual) — explain what happened.

Don't try to "flip back to test mode quietly". That breaks user trust at the worst possible time.

## 6. Related

- `lib/billing.ts` — `grantProAccessToUser`, `revokeProAccessToUser`, `tryClaimStripeEvent`.
- `app/api/stripe/webhook/route.ts` — event handler.
- `app/api/checkout/route.ts` — Checkout session creation.
- `sql/011_stripe_webhook_events.sql` — idempotency table.
- `ARCHITECTURE.md §5` — billing system map.
- `docs/operations/email-invariants.md` — the SQLSTATE 23505 pattern that the webhook claim relies on.
