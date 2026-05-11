# Release checklist

Run before any production deploy that touches a safety-critical file (`ARCHITECTURE.md §17`), bumps the mobile version code, or flips an external integration to live mode.

## 1. Web release

```bash
# Pre-flight
git status                               # clean working tree
git pull --rebase origin main
npm run typecheck
npm run test:unit
npm run build                            # catches Edge runtime regressions

# Smokes (against dev or preview)
npm run test:smoke:auth
npm run test:smoke:checkout
```

For changes touching billing / auth / safety:

```bash
# Production smoke (--headed, requires prod test account env vars)
npm run test:smoke:prod:auth
npm run test:smoke:prod
```

Sentry checks:

- Open Sentry → confirm the preview deploy's source maps uploaded (no obfuscated stack traces).
- Trigger one intentional error in the preview (`/sentry-example-page`) and confirm it lands within 60 seconds.

Security-header check (run against the preview URL):

```bash
curl -sI https://<preview>.vercel.app/ | grep -iE 'content-security-policy|strict-transport-security|x-frame-options|x-content-type-options|referrer-policy|permissions-policy'
```

All six headers must be present. If CSP changed, also open the browser DevTools console on the preview and verify no CSP violations on landing, login, pricing, checkout, dashboard.

## 2. Mobile release (Android)

```bash
cd apps/mobile
npm run typecheck

# Preview build (APK, sideload to real device)
eas build --profile preview --platform android
```

On the device:

- All four screens (Today, Blueprint, Forecast, Ask) render and stream correctly.
- Login works for an existing free account and a Pro account.
- Debug-access banner is **not visible** (production build → `__DEV__ === false`).
- Upgrade CTA opens the **external browser** to `wuwu-advisor.com/pricing` (reader-app pattern). No in-app payment surface.
- Sentry React Native captures a manually-thrown error within 60 seconds (verifies source-map upload).

Production submission:

```bash
eas build --profile production --platform android
eas submit --platform android   # uploads .aab to Play Console
```

The `versionCode` in `app.json` auto-increments under `production` profile config — don't bump manually unless you're rolling back.

## 3. Database migration release

Any new `sql/0XX_*.sql`:

1. Pair it with the smallest possible RLS policy in the same file (per `CONTRIBUTING.md §7`).
2. Run locally against a clean Supabase dev project before merging.
3. Apply to staging Supabase project before production.
4. Apply to production via `supabase db push` (or the equivalent in your workflow) — never via the dashboard UI for a real migration (no audit trail).
5. Update `ARCHITECTURE.md §12` table if the migration adds a new tracked table.

## 4. External-integration live-mode flips

Each requires its own gate review:

- **Stripe**: see `docs/operations/billing-live-flip.md`.
- **Resend**: domain DNS verified (SPF + DKIM + DMARC) before any production send. `EMAIL_FROM` env var matches the verified domain.
- **Upstash Redis**: production project's REST URL + token set in Vercel env, not preview env.

## 5. Post-release

- Watch Sentry for 15 minutes after deploy.
- Watch Stripe dashboard for 5 minutes after a billing-related deploy.
- Open one paid-funnel test (signup → upgrade) end-to-end on the deployed URL.
- Update `docs/handoff-log.md` with the deploy date, commit SHA, and any noteworthy observations.

## 6. Rollback

- Web: Vercel → Deployments → promote the previous successful deploy. Fast (~30 seconds).
- Mobile: stop the rollout in Play Console; if already published to internal/closed/open testing, push a hotfix version with an incremented `versionCode`. **You cannot un-publish a published `versionCode`** — only supersede.
- DB: forward-only. If a migration broke prod, ship a compensating migration (`sql/0XX_revert_*.sql`); don't try to roll back a schema state.

## 7. The hard rule

Work is **not** done until `git push` succeeds AND the deploy is live AND smoke-tests are green. "Ready to push when you are" is not an acceptable closure. See `CONTRIBUTING.md §4`.
