# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


## Build & Test

```bash
npm install              # install deps
npm run dev              # dev server on http://localhost:3000
npm run typecheck        # tsc --noEmit (always run after code changes)
npm run build            # production build (Next.js App Router)
npm run lint             # ESLint
npm run test:smoke:auth      # Playwright auth setup (--headed, requires dev server — webServer auto-starts)
npm run test:smoke:checkout  # Playwright checkout flow (--headed, depends on auth setup having run)
npm run test:smoke:prod      # Playwright against prod (--headed); see test:smoke:prod:auth first
npm run verify:alpha     # one-shot alpha-readiness verification script
```

The Playwright smoke tests are `--headed` by design — the operator watches them run. Don't expect them to be CI-headless without modification.

## Architecture Overview

Stack: **Next.js App Router (TypeScript) + Supabase (auth, DB, RLS) + Stripe (subscriptions) + Anthropic API (LLM generations) + Expo (mobile)**.

### Auth
- End-user auth: Supabase Auth. `lib/auth.ts` exposes `getRequestAuth(request)` for API routes — accepts Bearer token (mobile) or session cookie (web), returns `{user, accessToken}`.
- Access level resolution: `lib/access.ts` — derives `free | pro | internal` from `app_metadata`/`user_metadata` plus `TEST_FULL_ACCESS_EMAILS` env var. Returns `{accessLevel, featureAccess, dailyUsageLimits}`.
- Debug overrides: `lib/debug-access.ts` — gated behind `DEBUG_ACCESS_ENABLED=true` env var (default-disabled). Cookie/header-based access-level override for staging/test only. Never default-on outside explicit dev.
- Ops dashboard: separate password-only gate (`lib/ops-auth.ts`). Cookie stores HMAC-SHA256(OPS_SECRET, ...) — never the raw secret. Constant-time compare via Web Crypto (Edge-compatible). Three exported functions: `isOpsPasswordCorrect`, `getOpsSessionCookieValue`, `isOpsSessionValid`.

### Billing
- `lib/billing.ts` — Stripe customer / subscription lifecycle. `grantProAccessToUser` / `revokeProAccessFromUser` write `app_metadata.access_level` on the Supabase user.
- `app/api/stripe/webhook/route.ts` — Stripe event handler (`checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`).
- `app/api/checkout/route.ts` — creates Stripe Checkout sessions. Returns sanitized 500 errors (no internals leaked).

### Safety stack (in order of execution)
1. **Crisis detection** — `domain/safety/crisis-detection.ts`. Two-tier regex (benign prefilter + critical/elevated). Runs on input AND output. On hit, fires Care Mode and stops generation.
2. **Decision safety classifier** — `domain/decision/decision.safety.ts`. Catches harm-to-others, illegal-wrongdoing, etc. Returns a fixed safety response.
3. **Output safety classifier** — `domain/safety/output-safety.ts`. Three-layer: regex prefilter (zero-latency cult-phrase + financial-promise rules), LLM judge (nuance), fail-open with logging on judge error.
4. **Care mode** — `domain/safety/care-mode.ts`. Deterministic, non-LLM response. Never hallucinates during a crisis.
5. **Prompt rules** — `domain/safety/prompt-rules.ts`. Voice discipline + cult-phrase deny-list, injected into every system prompt.

### Generation flow
- All generations are SSE streams from `app/api/generate-*/route.ts`.
- Two-pass routing: `lib/model-routing.ts` (per-pass model assignment: extract→Haiku, compose→Haiku/Sonnet, synthesize→Opus) and `lib/model-decision.ts` (signal-based `useFrontier` decision).
- Cost telemetry: `lib/cost-events.server.ts` writes per-pass cost rows to `cost_events`.
- Product telemetry: `lib/product-events.server.ts` writes structured events to `product_events`.

### Rate limiting (server-side)
- Free-tier daily caps enforced in `lib/server-usage-limits.ts` (table: `usage_counters`, RLS read-own + service-role writes).
- `app/api/generate-briefing` and `app/api/generate-decision-guidance` do a pre-flight 429 check before SSE start, fire-and-forget increment after successful save.
- `app/api/ask-follow-up` has a separate per-conversation `FREE_FOLLOW_UP_LIMIT` constant.

### Attribution
- First-touch UTM/click-id capture in `middleware.ts` writes `wuwu_attr_ft` cookie.
- `lib/paid-media.ts` parses + serializes; `sql/009_attribution.sql` denormalizes onto `product_events` and persists `user_attribution`.

## Conventions & Patterns

- **Edge runtime compatibility**: `middleware.ts` and any code it imports must use Web Crypto only (no `node:crypto`). Async middleware is fine.
- **RLS-first**: every user-facing table has `auth.uid()`-keyed RLS. The service-role admin client (`lib/supabase/admin.ts`) is only for server-side writes that need to bypass RLS.
- **Fail-open vs fail-closed**: safety classifiers fail-open with logging (avoid DoS-via-API-outage). Auth and access checks fail-closed.
- **Don't expand scope**: per AGENTS.md, default to the smallest safe patch. Don't refactor adjacent code in-band with a fix.
- **No mock DB in tests**: integration tests hit a real Supabase instance.

## Safety-Critical Files (extra care when modifying)

These files require a tighter review bar — auth, billing, rate-limiting primitives:

- `lib/ops-auth.ts` — ops dashboard auth (HMAC + Edge crypto)
- `lib/auth.ts` — end-user request auth
- `lib/billing.ts` — Stripe customer/subscription lifecycle, access-level writes
- `lib/access.ts` — access-level resolution
- `lib/debug-access.ts` — debug override gates
- `lib/server-usage-limits.ts` — server-side rate-limit counters
- `middleware.ts` — runs on every request
- `app/api/stripe/webhook/route.ts` — Stripe event ingestion
- `app/api/checkout/route.ts` — Stripe Checkout creation
- `app/api/ops/auth/route.ts` — ops login
- `domain/safety/*` — crisis + output safety + care mode + prompt rules
