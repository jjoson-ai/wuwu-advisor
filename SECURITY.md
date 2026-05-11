# Security Policy

## Reporting a vulnerability

If you believe you've found a security issue in Wuwu Advisor, **do not open a public GitHub issue**. Email the maintainers privately at the address listed in the repo's primary contact (or open a GitHub Security Advisory if you have access).

Please include:

- A short description of the issue and its impact.
- Reproduction steps, ideally with concrete URLs/payloads.
- Whether the issue is exploitable on production (`wuwu-advisor.com`) or only locally.
- Your handle / how you'd like to be credited (optional).

We aim to acknowledge reports within **3 business days** and to issue a fix or mitigation for confirmed P0/P1 issues within **7 days**. We will coordinate disclosure with you.

## In-scope

- The deployed web app at `wuwu-advisor.com` (and Vercel preview URLs ending `.vercel.app` originating from this repo).
- The Android app published under bundle ID `com.astrologerondemand.app`.
- Any code in this repository: `app/`, `apps/mobile/`, `domain/`, `lib/`, `middleware.ts`, `instrumentation.ts`, `next.config.ts`, `sql/`, `scripts/`.

## Out of scope

- Findings that depend on a compromised user device, browser extension, or network MITM not attributable to our infrastructure.
- DoS / volumetric attacks. Our rate-limiters (`lib/rate-limit.ts`) and Vercel's platform handle this layer.
- Social-engineering attacks on the team.
- Self-XSS that requires the victim to paste attacker-supplied JS into DevTools.
- Missing headers on routes that don't render HTML (API + webhook routes).
- Reports based purely on automated-scanner output (Lighthouse, ZAP, etc.) without a demonstrated exploit.
- Findings against pre-launch / `__DEV__` debug surfaces gated by `DEBUG_ACCESS_ENABLED` (those are dev-only and not deployed default-on).

## Safety-critical surfaces

The following code paths handle auth, billing, or entitlement and warrant extra scrutiny. See `ARCHITECTURE.md §17` for the canonical list. Reports affecting these are prioritized:

- Auth + session: `lib/auth.ts`, `lib/ops-auth.ts`, `lib/access.ts`, `lib/debug-access.ts`
- Billing: `lib/billing.ts`, `lib/stripe.ts`, `app/api/checkout/route.ts`, `app/api/stripe/webhook/route.ts`
- Rate-limit / quota: `lib/rate-limit.ts`, `lib/server-usage-limits.ts`
- Email infra: `lib/email/*`, `app/api/email/webhook/route.ts`
- Edge / headers: `middleware.ts`, `next.config.ts` (CSP), `instrumentation.ts`
- Safety stack: `domain/safety/*`, `domain/decision/decision.safety.ts`, `lib/output-safety.ts`
- Mobile prod URL guard: `apps/mobile/src/api/client.ts:19`

## Known accepted risks

These are deliberate trade-offs documented for transparency, not accidental weaknesses:

1. **CSP `'unsafe-inline'` + `'unsafe-eval'` in `script-src`** — Required by Next.js App Router hydration. A nonce-based CSP is tracked as a post-launch follow-up. Mitigated by strict `connect-src` allowlist + `frame-ancestors 'none'`.
2. **Service-role Supabase admin client** — `lib/supabase/admin.ts` bypasses RLS. Used only for: webhook handlers, telemetry writes, atomic quota RPC, email log. Never imported in any code path reachable from a request body. Audit on patch.
3. **Rate-limiter fail-open** — `lib/rate-limit.ts` returns `{allowed: true}` on Upstash outage. Trade-off: an Upstash outage temporarily disables LLM cost cap, but never locks out paying users. This is intentional — see `ARCHITECTURE.md §16`.
4. **Debug-access cookie/header override** — `lib/debug-access.ts` exists for internal QA. **Default-disabled.** Activates only when `DEBUG_ACCESS_ENABLED=true`. Production envs do not set this.

## What good reports look like

A great report includes:

- A reproducible exploit (curl/HAR/Maestro flow).
- The specific file + line range in this repo (when applicable).
- Suggested mitigation, even if rough.
- An impact statement: who's affected, what data is at risk, what privilege escalation is possible.

A weak report:

- "Your site is vulnerable to XSS" with no payload.
- "Header X is missing on /api/foo" with no exploit path.
- Pasted scanner output without analysis.

Thank you for keeping Wuwu Advisor and our users safe.
