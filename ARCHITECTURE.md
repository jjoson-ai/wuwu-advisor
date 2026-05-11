# Architecture — Wuwu Advisor

Last revised: 2026-05-12 (post G1.1–G1.5 + G2.1–G2.2 + G3.1)
Owner: this doc is the canonical system map; update on architectural change, not on every patch.

## 1. Product surface

Wuwu Advisor is a premium AI astrology + decision-support product. Four user-facing surfaces:

| Surface       | Job                                            | Path                              |
|---------------|------------------------------------------------|-----------------------------------|
| **Today**     | 24-hour operating brief                        | `app/dashboard`, `apps/mobile/src/features/today` |
| **Blueprint** | Stable identity + decision-style reference     | `app/blueprint`, `apps/mobile/src/features/blueprint` |
| **Forecast**  | Medium-horizon planning layer                  | `app/forecast`, `apps/mobile/src/features/forecast` |
| **Ask**       | Direct decision/timing guidance for live Qs    | `app/decision`, `apps/mobile/src/features/ask` |

Two billing tiers: **free** (rate-limited daily quotas) and **pro** ($14.99/mo or annual w/ 7-day trial). Internal users get a third tier (`internal`) for unmetered access. Mobile is Android-first; iOS support is deferred. Mobile uses the **reader-app pattern** — no in-app billing; upgrade flows external-link to the web Stripe checkout.

## 2. Stack

- **Web frontend + API**: Next.js 15 (App Router, React 19, TypeScript). Vercel-hosted.
- **Mobile**: Expo SDK 54, React Native 0.81, `expo-router` v6, EAS Build for Android (`apps/mobile/eas.json`).
- **Auth + DB**: Supabase (Auth + Postgres + RLS + Realtime). Service-role admin client at `lib/supabase/admin.ts`; SSR client at `lib/supabase/server.ts`; browser client at `lib/supabase/browser.ts`.
- **Billing**: Stripe Checkout (subscription mode) + webhooks. Live-mode flip is gated (see `docs/operations/billing-live-flip.md`).
- **LLM**: Anthropic Claude (Haiku 4.5 for extract/cheap-compose, Sonnet 4.6 for compose-default, Opus 4.7 for synthesize/frontier). Routing in `lib/model-decision.ts` + `lib/model-routing.ts`. Direct API only; no proxy.
- **Rate limiting**: Upstash Redis (sliding-window, fetch-based; Edge-compatible) for IP-keyed auth abuse + per-user generation cost cap. Postgres atomic RPC (`try_increment_usage_counter`) for free-tier daily/weekly feature quotas.
- **Observability**: Sentry (web + mobile) via `@sentry/nextjs` and `@sentry/react-native`. Tunnel route `/monitoring` to bypass ad blockers (configured in `next.config.ts`).
- **Email**: Resend + Svix-verified webhooks. Suppression list, idempotent send log. See §6 and `docs/operations/email-invariants.md`.

## 3. Repo layout

```
app/                  Next.js App Router pages (UI) + app/api/ (route handlers)
apps/mobile/          Expo React Native client
components/           Shared web React components
docs/                 Product/strategy/compliance/operations docs
docs/audits/          Findings from external/internal audits
docs/operations/      In-repo operational runbooks (this doc's siblings)
domain/               Domain layer: 21 subdomains (safety, decision, briefing, memory, ...)
lib/                  Infrastructure libs (auth, billing, email, telemetry, LLM, paid-media)
playwright/           E2E test harness (headed by design)
scripts/              tsx-runnable scripts (verify-alpha, bakeoff, ad-spend ingest, ...)
sql/                  Numbered Supabase migrations (001 → 014)
tests/                Vitest unit suites + Playwright specs
instrumentation.ts    Next.js 15 Sentry register() hook
middleware.ts         Edge runtime: ops gate + attribution capture + auth rate-limit
next.config.ts        Security headers (CSP, HSTS, etc.) + Sentry tunnel route
sentry.*.config.ts    Per-runtime Sentry SDK init (client/server/edge)
```

The `domain/` boundary is real: domain modules export pure business logic and types; `lib/` exports infra. `app/api/` route handlers compose `domain/` + `lib/` and own request/response. Mobile mirrors this split (`apps/mobile/src/features/*` per surface; `apps/mobile/src/lib/*` for cross-cutting concerns).

## 4. Auth + access

Three identity systems coexist:

### 4.1 End-user auth (`lib/auth.ts`)

Supabase Auth, accessed via:
- `getCurrentUser()` — React-cached; reads cookie session in Server Components.
- `getRequestAuth(request)` — accepts Bearer token (mobile) **or** session cookie (web). Returns `{user, accessToken}`. The single entry point for API routes.
- `getRequestUser(request)` — convenience wrapper, returns `user` only.
- `isAgeVerified(user)` — checks `app_metadata.age_verified_dob === true`. Legacy `age_verified` self-attestation is intentionally ignored (SB 243 + COPPA hardening).

### 4.2 Access-level resolution (`lib/access.ts`)

Derives tier from `app_metadata` / `user_metadata` plus `TEST_FULL_ACCESS_EMAILS` env list. Public surface:

- `getUserAccessLevel(user) → "free" | "pro" | "internal"`
- `getFeatureAccess(level)` — booleans for `canViewFullBlueprint`, `canGenerateUnlimitedToday`, `canAskUnlimited`, `canViewFullForecast`
- `getDailyUsageLimits(level)` — free: `{askPerDay: 3, bigDecisionPerWeek: 1, todayRefreshesPerDay: 3}`; pro/internal: nulls
- `compareAccessLevels(a, b)` — rank-based: free=0, pro=1, internal=2
- `isArtifactStaleForCurrentAccess(currentLevel, artifactGenLevel)` — true if user upgraded since artifact was generated (used to flag re-generation prompts)

Tier resolution is **fail-closed** — unknown / missing metadata defaults to `free`.

### 4.3 Debug-access override (`lib/debug-access.ts`)

**Default-disabled.** Activates only when `DEBUG_ACCESS_ENABLED=true`. Lets internal testers spoof tier via cookie (`wuwu_debug_access_level`) or header (`x-wuwu-debug-access-level`). Includes a "checkout bridge" temporary-pro cookie that bridges Stripe redirect latency. Never enable in production env.

### 4.4 Ops dashboard auth (`lib/ops-auth.ts`)

Separate password-only gate for `/ops/*` admin surface. Edge-compatible (Web Crypto only — no `node:crypto`). Session cookie stores `HMAC-SHA256(OPS_SECRET, "wuwu_ops_session_v1")` — never the raw secret. 30-day session. Constant-time HMAC compare. Brute-force protected at the middleware layer (20 attempts / 15-min IP-keyed sliding window).

## 5. Billing (Stripe)

### 5.1 Lifecycle entry points (`lib/billing.ts`)

- `grantProAccessToUser({userId, stripeCustomerId?, stripeSubscriptionId?}) → {user, activatedNow}` — writes `app_metadata.{access_level, tier, plan, billing_source, billing_status, stripe_customer_id, stripe_subscription_id}` atomically.
- `revokeProAccessToUser({userId, billingStatus: "canceled" | "payment_failed", ...})` — flips back to free, records reason.
- `findUserByStripeBillingIdentity({userId?, stripeCustomerId?, stripeSubscriptionId?})` — scans `auth.users` (max 2000 paginated) by Stripe IDs stored in `app_metadata`.
- `tryClaimStripeEvent(eventId, eventType) → boolean` — inserts into `stripe_webhook_events`; returns `true` on success, `false` if SQLSTATE **23505** (duplicate delivery). Throws on any other DB error. This is the **idempotency primitive** — see `docs/operations/email-invariants.md` for the broader SQLSTATE 23505 pattern.
- `releaseStripeEventClaim(eventId)` — best-effort delete if handler fails after claim; never throws.

### 5.2 Routes

- `app/api/checkout/route.ts` (POST): authenticated free-tier user with verified email → creates Stripe Checkout session (annual default, 7-day trial for annual). Metadata payload: `{user_id, upgrade_surface, platform, plan_type}`. Returns sanitized `{checkoutUrl}` — internals never leak in 500s.
- `app/api/stripe/webhook/route.ts` (POST): verifies signature via `stripe.webhooks.constructEvent`. Claims event idempotently. Dispatches:
  - `checkout.session.completed` (mode=subscription, status=complete) → `grantProAccessToUser` + `pro_activated` event + paid-media conversion fanout.
  - `customer.subscription.deleted` → `revokeProAccessToUser("canceled")`.
  - `invoice.payment_failed` → `revokeProAccessToUser("payment_failed")`.
  - If handler throws after claim, calls `releaseStripeEventClaim` and returns 500 → Stripe retries.

### 5.3 Reader-app billing (mobile)

Per Path A (decided in the Android launch plan): the mobile app has no in-app billing integration. All upgrade CTAs (audit: `docs/audits/2026-05-mobile-upgrade-ctas.md`) external-link via `Linking.openURL` to the web pricing/checkout. Customer-portal links work the same way. Two-line policy: **no in-app "Buy" or "Subscribe" verbs**; copy is "Continue on web" / "Manage subscription". Reduces Play Store review risk.

## 6. Email (Resend) — durable + idempotent

Shipped in Gate 1.5 (2026-05-08). Two-layer:

### 6.1 `lib/email/send.ts` — `sendEmail(input) → SendEmailResult`

```ts
type SendEmailResult =
  | { ok: true; messageId: string; status: "sent" }
  | { ok: true; messageId: null; status: "duplicate" | "suppressed" }
  | { ok: false; status: "failed"; reason: string };
```

Flow (in order):
1. Hash + extract-domain the recipient (`hashEmail`, `extractDomain` in `lib/email/suppressions.ts`). Raw email is **never logged or stored** — only the SHA-256 hex digest and the bare domain.
2. Check `email_suppressions` table via `isEmailSuppressed`. If suppressed: log a `suppressed` row, return `{ok: true, status: "suppressed"}` — **no send**.
3. Insert into `email_send_log` with the caller-supplied `idempotency_key` (table has a unique constraint on the key).
   - SQLSTATE **23505** on insert → `{ok: true, status: "duplicate"}` (no send, no error).
   - Any other DB error → `{ok: false, status: "failed"}`.
4. Call Resend `emails.send`. On API error: update log row to `failed` + return `{ok: false}`. On success: update log row with `messageId`.
5. Outer catch: best-effort `failed` log insert, return `{ok: false}`.

### 6.2 `lib/email/suppressions.ts`

`suppressEmail(email, reason: "bounce" | "complaint" | "manual" | "rate_limited")` — **throws on DB failure**. This is contractual: the webhook handler relies on the throw to return 503 → Resend retries. Silently swallowing would let bounce/complaint addresses receive future sends forever. Same contract for `unsuppressEmail`.

### 6.3 `app/api/email/webhook/route.ts`

Resend webhook ingress. Verifies Svix signature (`svix-id`, `svix-timestamp`, `svix-signature` headers). On `email.bounced` / `email.complained`, calls `suppressEmail`. If `suppressEmail` throws → return **503**. Otherwise 200.

See `docs/operations/email-invariants.md` for the full invariant set.

## 7. Safety stack

Five layers run on **every** generation, in this order. Each is documented in `domain/safety/` or `domain/decision/`.

### Order of execution (route handler responsibility):

1. **Crisis detection (input)** — `domain/safety/crisis-detection.ts::detectCrisisInput`. Deterministic regex: ~18 critical patterns ("kill myself", "end my life", etc.) + ~15 elevated ("want to die", "no reason to live"). On hit → return Care Mode immediately, no LLM call.
2. **Decision safety classifier** — `domain/decision/decision.safety.ts::classifyDecisionSafety` (Ask only). Regex into `{normal, self_harm, harm_to_others, illegal_wrongdoing}`. On non-normal → fixed safety response, no generation.
3. **Generation pipeline** — see §8.
4. **Crisis detection (output)** — same module, post-generation pass. Mid-stream interception is supported for `ask-follow-up`.
5. **Output safety classifier** — `domain/safety/output-safety.ts::classifyOutputSafety`. Two-stage:
   - Stage A: 28 regex rules across 4 categories (financial instrument, directive life verdict, death/pregnancy, cult phrases).
   - Stage B: Haiku 4.5 LLM judge with structured JSON output. Circuit breaker flips to **fail-closed** after 5 consecutive judge failures.
6. **Internal-term sanitization** — `lib/output-safety.ts`. Recursively scans final JSON payload for leaked internal terms (`complexityScore`, `forced_frontier_reasons`, `path_taken`, etc.). Replaces with regenerate prompt.

### Fail-open vs fail-closed (critical)

- **Input crisis detection**: fail-closed in practice (regex; can't error). On error → block.
- **Decision safety**: regex; fail-closed.
- **Output safety LLM judge**: fail-OPEN per request (avoid DoS-via-Anthropic-outage), but fail-CLOSED after circuit-breaker trip (5 consecutive errors). On trip → block all outputs until reset.
- **Prompt rules** (`domain/safety/prompt-rules.ts`): injected into every system prompt. Cult-phrase deny-list, financial-safety rules, life-decision-coach mode, voice discipline (max 1 hedge, jargon glossed on first use).

## 8. Generation flow (canonical pattern)

Five SSE routes follow the same skeleton:

- `app/api/generate-briefing/route.ts` (Today)
- `app/api/generate-blueprint/route.ts`
- `app/api/generate-forecast/route.ts`
- `app/api/generate-decision-guidance/route.ts` (Ask)
- `app/api/ask-follow-up/route.ts`

### Skeleton (in order):

1. `getRequestAuth(request)` → 401 if no user.
2. `checkGenerationRateLimit(user.id)` (Upstash, 30/hr/user; fail-open on Redis outage).
3. Request validation (zod schemas in `lib/validations.ts` or inline). Reject empty / malformed.
4. Onboarding-complete check; 400 if not.
5. **Crisis-input** (where applicable).
6. **Decision safety** (Ask only).
7. Free-tier quota check via `tryIncrementUsageCount` (atomic Postgres RPC). On exceed → 429.
   ⚠️ Backlog item B1 (Roadmap §VIII): generation rate-limit currently runs **before** validation early-returns, so 400s burn quota. Fix is filed.
8. Parallel context fetch: profile/birth_data, prior artifacts, memory facts (`domain/memory/*`).
9. **Two-pass routing** (`lib/model-decision.ts`):
   - Pass 1: extract signals via Haiku (`generateAskSignals` / equivalent).
   - Routing decision: `getModelRoutingDecision(feature, signals, userContext)` returns `{useFrontier, synthesisBurden, forcedFrontierReasons, normalizedSignals}`. Thresholds are feature-specific and tier-scaled for Today.
   - Pass 2: cheap (Sonnet/Haiku) or frontier (Opus) per `useFrontier`.
   - On signal-extract failure → single-pass Opus fallback (logged as `full_fallback`).
10. **Crisis-output** check.
11. **Output safety** classifier.
12. **Save** to relevant table (`daily_briefings`, `decision_guidance`, `ask_turns`, etc.).
13. **Memory extraction** (fire-and-forget): `domain/memory/extraction-pipeline.ts`.
14. **Telemetry** (fire-and-forget):
    - `logRoutingEvent(event)` — model choice trace (`final_model_selected`, `path_taken`, `forced_frontier_reasons`).
    - `logProductEvent(event)` — funnel/conversion events; resolves attribution + dispatches paid-media (§10).
    - `logCostEvent(event)` — per-pass token + cost.

All telemetry writes are `void`-returning and never throw — observability never blocks user flow.

## 9. Rate limiting + usage caps

Two distinct systems:

| System                                 | Layer    | Storage         | Purpose                                  | Fail mode    |
|----------------------------------------|----------|-----------------|------------------------------------------|--------------|
| `lib/rate-limit.ts::checkAuthRateLimit` | Edge     | Upstash Redis   | Ops login brute-force                    | fail-open    |
| `lib/rate-limit.ts::checkGenerationRateLimit` | Server | Upstash Redis | LLM cost cap (30/hr/user, all features)  | fail-open    |
| `lib/server-usage-limits.ts::tryIncrementUsageCount` | Server | Postgres RPC | Free-tier daily/weekly feature quotas    | fail-open    |
| `lib/client-usage-limits.ts`           | Client   | localStorage    | UI display only (non-authoritative)      | n/a          |

Atomic increment: `try_increment_usage_counter` PL/pgSQL RPC (migration `012`) takes a row lock and prevents TOCTOU races on quota.

## 10. Attribution + paid-media

First-touch UTM/click-id capture (`middleware.ts`) writes signed cookie `wuwu_attr_ft`. Three logical pieces:

- **Capture** (`middleware.ts`): parses `gclid`, `gbraid`, `wbraid`, `fbclid`, `utm_*` from query string. First-touch semantics — fields never overwrite once set.
- **Channel derivation** (`lib/paid-media.ts::deriveAttributionChannel`): pure function. 9-tier waterfall: `google_paid` > `meta_paid` > `other_paid` > `organic_search` > `referral` > `direct`.
- **Conversion fanout** (`lib/paid-media.server.ts::dispatchPaidMediaConversion`): on `signup_completed` / `pro_activated`:
  - Queues a Google Ads conversion via `wuwu_google_queue` httpOnly cookie (client flushes via `gtag`).
  - Queues a Meta pixel event via `wuwu_meta_queue` cookie (client flushes via `fbq`).
  - Server-side Meta Conversions API call with hashed email + external_id (dedup'd by shared `event_id` with client pixel).
- **Persistence**: `lib/paid-media.server.ts::upsertUserAttributionFirstTouch` writes immutable first-touch fields to the `user_attribution` table on `signup_completed`.

## 11. Edge runtime constraints

`middleware.ts` and any module it transitively imports must use **Web Crypto only** (`crypto.subtle.*`) — no `node:crypto`. Async middleware is supported. Edge runtime is enforced by Vercel; violations surface only at runtime, not build time, so be deliberate.

Files known to be Edge-bound (and verified Web-Crypto-only):
- `lib/ops-auth.ts` (HMAC for ops session)
- `lib/paid-media.ts` (HMAC for attribution cookie)
- `lib/rate-limit.ts` (Upstash via `fetch`, not their Node SDK)
- `lib/email/suppressions.ts::hashEmail` (SHA-256 via `crypto.subtle.digest`)
- Anything imported by `middleware.ts`.

Sentry tunnel route `/monitoring` is **excluded** from the middleware matcher (`next.config.ts` configures it; `middleware.ts` matcher negative-lookahead excludes it). Passing tunnel payloads through attribution/ops-redirect logic would corrupt them.

## 12. Database (Supabase) — RLS-first

14 numbered migrations in `sql/`. **Every user-facing table** has `auth.uid()`-keyed RLS. The service-role admin client (`getSupabaseAdminClient`) is the only path that bypasses RLS — used for: webhook handlers, telemetry writes, quota RPC, email log.

Key tables:

| Table                  | Migration | RLS                                    | Notes                                          |
|------------------------|-----------|----------------------------------------|------------------------------------------------|
| `profiles`             | 001       | `auth.uid() = user_id`                 | User profile + tone preference                 |
| `birth_data`           | 001       | `auth.uid() = user_id`                 | Birth chart inputs                             |
| `daily_briefings`      | 001       | own-row                                | Today artifacts (cached per date)              |
| `ask_conversations`    | 003       | own-row                                | Ask sessions                                   |
| `ask_turns`            | 003       | own-row                                | Per-turn message + response                    |
| `user_facts`           | 004       | own-row SELECT/UPDATE; service INSERT  | Memory facts + pgvector embeddings (HNSW idx)  |
| `usage_counters`       | 010       | own-row SELECT only                    | Service-role-only writes (anti-bypass)         |
| `stripe_webhook_events`| 011       | none (ops only)                        | Idempotency: PK on `event_id`                  |
| `email_send_log`       | 013       | own-row SELECT                         | `idempotency_key` unique; hashed email only    |
| `email_suppressions`   | 013       | none                                   | Hashed email; bounce/complaint sink            |
| `cost_events`          | 005       | none                                   | Per-pass LLM cost                              |
| `routing_events`       | (inline)  | none                                   | Model-decision trace                           |
| `product_events`       | (inline)  | none                                   | Funnel + conversion events                     |
| `user_attribution`     | 009       | own-row SELECT                         | First-touch attribution, immutable             |

Soft-delete: `user_facts` uses `user_deleted_at` + `superseded_by` rather than physical delete (memory pipeline needs lineage).

## 13. Mobile (Expo + RN)

`apps/mobile/` is a standalone Expo project, not part of the web TS project. Key files:

- `app.json` — Expo config. Bundle ID `com.astrologerondemand.app` (locked at first publish). Permissions explicitly minimal (`INTERNET`, `ACCESS_NETWORK_STATE`); explicitly blocked: location, camera, audio, contacts, phone state, storage, calendar. `softwareKeyboardLayoutMode: "pan"`, `edgeToEdgeEnabled: true`. **Adaptive icon + splash refs are intentionally absent until G2.3 ships assets.**
- `eas.json` — Build pipeline (development/preview/production profiles). Production builds an Android App Bundle (`.aab`); preview is APK for sideload.
- `src/api/client.ts` — HTTP client. **Line 19: `__DEV__ === false` guard** prevents production builds from hitting localhost.
- `src/components/debug-access-banner.tsx` — `if (!__DEV__) return null` at every call site. Dev-only tier-toggle UI.
- `src/components/locked-feature-card.tsx` — Paywall upgrade CTA. Calls `startProCheckout()` → external browser → web Stripe Checkout (reader-app pattern).
- `src/features/{today, blueprint, forecast, ask, settings}/` — Per-surface screens.
- `src/lib/pro-checkout.ts` — Reader-app deep-link helper.

Sentry React Native is wired (G1.4) but source-map upload via EAS still pending verification (G2.6 blocked on G2.1, now unblocked post-PR-9-merge).

## 14. Observability

- **Sentry web** (`@sentry/nextjs` 10.x): Edge + Node + browser. Configured in `sentry.{client,server,edge}.config.ts`. Tunnel via `/monitoring` (ad-blocker bypass). Per-runtime init via `instrumentation.ts::register()` — flat top-level `Sentry.init` is **wrong** for Next.js 15 and silently drops server captures.
- **`onRequestError = Sentry.captureRequestError`** in `instrumentation.ts` — required for Server Component + route-handler + middleware errors.
- **Sentry mobile** (`@sentry/react-native` 7.x): `sentry.properties` + `sentry.properties.production` for source map upload during EAS build.
- **Product events** (`product_events` table): canonical funnel.
- **Cost events** (`cost_events` table): per-pass economics.
- **Routing events** (`routing_events` table): model-decision trace for bake-off and tuning.

## 15. Security headers (`next.config.ts`)

Applied to `/:path*`. Six headers:

- **CSP** — restrictive. `script-src` allows `'unsafe-inline'` + `'unsafe-eval'` (required by Next.js hydration; nonce-based CSP is a follow-up). Explicit allowlist for `googletagmanager.com`, `connect.facebook.net`. `connect-src` permits Supabase REST + WSS, analytics pixels, Sentry. `form-action` permits Stripe Checkout redirect. `frame-ancestors 'none'` + `X-Frame-Options: DENY` (defense in depth).
- **HSTS** — 2 years + `includeSubDomains; preload`. Submit `wuwu-advisor.com` to `hstspreload.org` after live-mode flip.
- **X-Frame-Options: DENY**
- **X-Content-Type-Options: nosniff**
- **Referrer-Policy: strict-origin-when-cross-origin**
- **Permissions-Policy** — disables camera, microphone, geolocation, USB, magnetometer, accelerometer, gyroscope. Permits `payment=(self)` (Stripe).

Webhook + API routes don't render in a browser; headers are inert but harmless there.

## 16. Critical invariants (read before changing safety-critical files)

1. **SQLSTATE 23505 is idempotency, not failure.** Stripe webhook claim, email send log, and any other unique-constraint pattern in this codebase distinguishes "duplicate retry" from "real DB error" via this code. Don't widen the catch.
2. **`suppressEmail` throws on DB failure.** The webhook handler returns 503 → Resend retries. Don't silently swallow.
3. **Fail-open for cost-cap rate-limiters; fail-closed for auth + entitlement gates.** Outages must not block legitimate users on rate-limiters; outages must never grant access on auth.
4. **`tryIncrementUsageCount` fail-opens to `wasIncremented: true`.** One extra free request through is acceptable; lock-out is not.
5. **Attribution first-touch fields are immutable.** Don't add code paths that overwrite once set.
6. **`age_verified_dob` is the only honored age flag.** Legacy `age_verified` is intentionally rejected.
7. **Ops session cookie stores HMAC, never the raw secret.**
8. **Mobile builds must not hit localhost.** `src/api/client.ts:19` guard.
9. **No client-side Stripe.js.** Server-redirect checkout only; CSP doesn't whitelist `js.stripe.com`.
10. **Sentry tunnel `/monitoring` is excluded from middleware.**

## 17. Safety-critical files (extra review bar)

Auth, billing, rate-limiting primitives. Patches here require a second pair of eyes and explicit smoke-test evidence (see `docs/operations/release-checklist.md`).

- `lib/ops-auth.ts`
- `lib/auth.ts`
- `lib/billing.ts`
- `lib/access.ts`
- `lib/debug-access.ts`
- `lib/server-usage-limits.ts`
- `lib/rate-limit.ts`
- `lib/email/send.ts`
- `lib/email/suppressions.ts`
- `middleware.ts`
- `instrumentation.ts`
- `next.config.ts` (security headers + CSP)
- `app/api/stripe/webhook/route.ts`
- `app/api/checkout/route.ts`
- `app/api/email/webhook/route.ts`
- `app/api/ops/auth/route.ts`
- `domain/safety/*`
- `domain/decision/decision.safety.ts`
- `apps/mobile/src/api/client.ts` (production URL guard)

## 18. Verification recipe

```bash
# Web
npm run typecheck && npm run test:unit && npm run build

# Mobile
cd apps/mobile && npm run typecheck && cd -

# Smoke (against dev or preview)
npm run test:smoke:auth && npm run test:smoke:checkout

# Mobile preview build (Android, sideload)
cd apps/mobile && eas build --profile preview --platform android
```

## 19. Out-of-scope (deliberate non-architecture)

- **iOS / TestFlight** — Android-first launch; iOS deferred until post-Phase-1.
- **In-app billing** — explicitly chose Path A (reader-app). No Google Play Billing integration.
- **Memory dashboard / accuracy loop / Swiss Ephemeris** — post-launch growth (Phase 5 in the launch plan).
- **Nonce-based CSP** — `'unsafe-inline'` is tolerated for App Router hydration; nonce refactor is a tracked follow-up.
- **iOS push, web push, SMS** — not in scope for launch.

## 20. Related docs

- `AGENTS.md` — Agent operating rules (scope discipline, product principles).
- `CLAUDE.md` — Claude-specific in-repo instructions (build commands, conventions).
- `CONTRIBUTING.md` — Human-facing dev workflow.
- `SECURITY.md` — Vulnerability reporting.
- `docs/operations/` — In-repo runbooks (release, safety, email, billing).
- `docs/strategic-brief.md`, `docs/commercialization-roadmap.md`, `docs/pricing-model.md` — Product strategy.
- `docs/brand-pack.md` — Voice + visual.
- `docs/audits/` — External + internal audit findings.
- `~/.claude/plans/reactive-foraging-engelbart.md` — Live launch plan (Gates G0–G9). Not in-repo by design; lives in agent state.
