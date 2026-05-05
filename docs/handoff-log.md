# Coordinator Handoff Log

Append-only log of coordinator sessions. Newest entries at the top.

Format spec: see `docs/coordinator-handoff.md` §12.

---

### 2026-05-05 (model: claude-opus-4.7)

**Issues touched:** astrologerondemand-gkg (P2: API rate limiting middleware)
**Outcome:** shipped to live (PR #4 opened, on `feat/gkg-upstash-rate-limiting` branch — awaiting merge)

**What was done:**
- Installed `@upstash/ratelimit` + `@upstash/redis`
- Created `lib/rate-limit.ts` — Edge-compatible lazy singletons for two sliding-window limiters:
  - `checkAuthRateLimit(ip)`: 20 attempts / 15 min / IP (ops brute-force)
  - `checkGenerationRateLimit(userId)`: 30 req / hour / user-id (LLM cost cap, all SSE routes)
  - `RATE_LIMIT_DISABLED=true` bypass for local dev; both fail-open on Redis error
- Wired `checkAuthRateLimit` into `middleware.ts` on `POST /api/ops/auth` (IP from `x-forwarded-for`)
- Wired `checkGenerationRateLimit` into 5 SSE routes after auth, before pipeline:
  - `app/api/generate-briefing/route.ts`
  - `app/api/generate-blueprint/route.ts`
  - `app/api/generate-forecast/route.ts`
  - `app/api/generate-decision-guidance/route.ts`
  - `app/api/ask-follow-up/route.ts`
- Also merged PR #3 (Codex week-year boundary fix + Vercel sensitize-secrets script) to main
- Closed astrologerondemand-gkg bead — board is now empty

**Files modified:**
- `lib/rate-limit.ts` — new file
- `middleware.ts` — import + ops auth rate limit check
- `app/api/generate-briefing/route.ts:265` — generation rate limit pre-flight
- `app/api/generate-blueprint/route.ts:73` — generation rate limit pre-flight
- `app/api/generate-forecast/route.ts:98` — generation rate limit pre-flight
- `app/api/generate-decision-guidance/route.ts:135` — generation rate limit pre-flight
- `app/api/ask-follow-up/route.ts:56` — generation rate limit pre-flight
- `package.json` / `package-lock.json` — Upstash deps added

**Verification:**
- typecheck: ✓ (clean, `npm run typecheck`)
- unit tests: ✓ (137/137 passed, `npx vitest run`)
- Vercel deploy: pending merge of PR #4

**Next-session handoff notes:**
- **PR #4 needs merge** (`feat/gkg-upstash-rate-limiting`) — user should merge via GitHub
- **Post-merge smoke test**: confirm `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are present in Vercel prod environment (they were sensitized in the prior session but worth double-checking they're in the right target environments)
- **Board is clear** — next work is Gate 3 (Stripe live-mode flip, item 3.2). This is security-critical; recommend Anthropic Claude Code (Opus 4.7 / High) rather than Ollama for the Stripe keys swap.
- **Gate 1 mobile cleanup** (1.12): `DebugAccessBanner` in mobile app needs `__DEV__` guard before TestFlight public — safe Ollama task (Sonnet-equivalent / Low).
- **Upstash free tier**: 10,000 commands/day. At 30 req/hr/user cap the free tier supports roughly 333 active users/day before hitting Upstash limits. Upgrade plan when approaching that scale.

---

<!-- Append new entries above this line. Older entries below. -->
