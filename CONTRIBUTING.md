# Contributing to Wuwu Advisor

This is a small private project, not an open-source library. Most contributions come from the core team and from AI coding agents (Claude Code, OpenCode). This doc is the short-form orientation.

For the deep dives:

- **`ARCHITECTURE.md`** — system map. Read this before changing any safety-critical file.
- **`AGENTS.md`** — product principles + scope rules. Read this before deciding what to build.
- **`CLAUDE.md`** — Claude-specific build commands, conventions, and the safety-critical-files list.
- **`docs/operations/`** — runbooks for release, safety stack, email, billing.
- **`SECURITY.md`** — how to report a vulnerability.

## 1. Local setup

```bash
# Web
npm install
cp .env.example .env.local   # fill in keys
npm run dev                  # http://localhost:3000

# Mobile (separate workspace)
cd apps/mobile
npm install
npm start                    # Expo dev server
```

Required env vars (web):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`
- `ANTHROPIC_API_KEY`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`
- `OPS_SECRET` (random ≥32 bytes)
- `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`

`.env.example` is the source of truth for the full list. Never commit a real `.env.local`.

## 2. The smallest-safe-patch rule

Per `AGENTS.md §7`: default to the smallest safe patch. Don't refactor adjacent code in-band with a fix. Don't propose pre-launch monetization rewrites, sweeping UI redesigns, or "while I'm here" architecture changes. Tracked separately or skipped.

If a patch touches > 2 production files OR > 120 lines, decompose it. This applies to humans and to AI agents alike (`docs/operations/offload-discipline.md`).

## 3. Quality gates (before every commit)

```bash
npm run typecheck
npm run test:unit
npm run lint
npm run build                 # catches Edge runtime regressions
```

For changes that touch any file listed in `ARCHITECTURE.md §17` (safety-critical), also run:

```bash
npm run test:smoke:auth
npm run test:smoke:checkout
```

The Playwright smokes are `--headed` by design (an operator watches them run).

## 4. Beads + git workflow

This repo uses [beads (`bd`)](https://github.com/openai/beads) for task tracking. Do **not** maintain markdown TODO lists. Workflow:

1. `bd ready` — find available work.
2. `bd update <id> --claim` — claim it before you start.
3. Work in small increments.
4. `bd close <id>` — when done.
5. `git pull --rebase && git push` — work is **not** done until pushed.

`bd remember "insight"` for persistent knowledge across sessions; do not create MEMORY.md files.

## 5. Commit + PR conventions

- One logical change per commit. Use prefixes: `feat(<scope>)`, `fix(<scope>)`, `docs(<scope>)`, `refactor(<scope>)`, `chore(<scope>)`. Examples: `feat(email): durable + idempotent send pipeline`, `fix(codex-g1): Sentry hooks + Resend semantics`.
- PRs squash-merge into `main`. Branch names: `feat/<gate-id>-<slug>`, `fix/<slug>`, `docs/<slug>`.
- PR description should reference the relevant `bd` issue and call out any files in the safety-critical list.

## 6. AI agents

Two coding agents currently work this repo:

- **Claude Code (Anthropic)** — primary; owns architecture, security, billing, and merge-gate. See `CLAUDE.md`.
- **OpenCode (Ollama)** — sub-orchestrator for bulk implementation. See `docs/coordinator-handoff.md` and `docs/operations/offload-discipline.md` for the dispatch protocol.

The line between them is in `~/.claude/CLAUDE.md` ("When to keep vs offload"). In short: auth, crypto, schema, and Stripe live-mode work stays with Claude. Bulk refactors, test scaffolding, docs, and codebase scouting offload.

Anti-fabrication rule (applies to humans and agents): **never invent identifiers** — folder IDs, OAuth tokens, API keys, Stripe price IDs, Supabase project refs, etc. Missing input → placeholder + bd blocker. Don't guess.

## 7. Code style

- TypeScript strict mode. `tsc --noEmit` must pass.
- ESLint enforced. Don't disable rules in-band without a comment explaining why.
- Prefer Web Crypto over `node:crypto` (Edge-runtime compatibility — see `ARCHITECTURE.md §11`).
- API route handlers compose `domain/` + `lib/`. Don't pull Supabase / Stripe clients directly into route bodies — wrap in `lib/`.
- RLS-first. Every new user-facing table gets `auth.uid()`-keyed RLS in the same migration that creates it.
- Tests live next to unit boundaries (`tests/unit/`) or as Playwright specs (`tests/playwright/`).
- Don't add new top-level dependencies without checking bundle impact (`npm run build` prints route sizes).

## 8. Doc updates

- Architectural changes → update `ARCHITECTURE.md` in the same PR.
- New invariants → update `ARCHITECTURE.md §16` + a runbook in `docs/operations/`.
- New env vars → update `.env.example` AND this file's §1 list.
- New safety-critical file → update `ARCHITECTURE.md §17`, `CLAUDE.md`, and `SECURITY.md`.

## 9. Things we don't accept

- Patches that disable type-checking, lint rules, or tests to "make CI green".
- New raw-email logging (we hash; see `lib/email/suppressions.ts::hashEmail`).
- New `console.log` of secrets, tokens, customer IDs, or full request bodies containing user PII.
- Direct `git push` to `main` without a PR (the GitHub branch protection enforces this; don't try to work around it).
- Architectural changes that bypass the smallest-safe-patch rule without prior agreement.
- New top-level docs files without first checking if an existing doc covers the topic.
