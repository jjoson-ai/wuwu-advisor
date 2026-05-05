# Wuwu Advisor — Coordinator Handoff

Operating manual for Ollama Cloud coordinator sessions. Read this in full before touching any code.

---

## 1. Recommended Coordinator Model

**Primary: `minimax-m2.7:cloud`** — Opus-tier SWE judgment, strong agentic tool-use, handles Next.js/TypeScript/Supabase ambiguity well. Best default.

| Model | When to use |
|---|---|
| `minimax-m2.7:cloud` | **Default coordinator.** Architecture decisions, cross-file refactors, ambiguity handling |
| `kimi-k2.6:cloud` | Very long sessions, sustained multi-step tool-use chains |
| `deepseek-v4-pro:cloud` | Big-context research, reading all 50+ files at once (1M ctx) |
| `glm-5.1:cloud` | **Co-executioner only.** Multi-file refactors with a tight spec |
| `qwen3-coder-next:cloud` | **Co-executioner only.** Fast agentic loops: write → run → fix |
| `deepseek-v4-flash:cloud` | Mechanical one-liners, copy tweaks, trivial renames |

Keep architecture, security-critical paths, and the merge gate for the primary coordinator.

---

## 2. Project Context

| Field | Value |
|---|---|
| **App** | Wuwu Advisor — AI astrology advisor, personalized to birth chart |
| **Repo** | `git@github.com:jjoson-ai/wuwu-advisor.git` |
| **Deploy** | Vercel (auto-deploy on push to `main`) |
| **Stack** | Next.js App Router (TypeScript) + Supabase (auth, DB, RLS) + Stripe (subscriptions) + Anthropic API + Expo (mobile) |
| **Mobile** | Expo app in `apps/mobile/` — not yet on TestFlight public |
| **Live URL** | `wuwu-advisor.vercel.app` |
| **Stripe mode** | **Test mode** — Stripe live-mode flip is Gate 3 |
| **Issue tracker** | `bd` (beads) — see §6 |
| **Primary KPIs** | MRR, Pro activation rate, LLM cost/user, output safety block rate |
| **Safety-critical files** | `lib/ops-auth.ts`, `lib/auth.ts`, `lib/billing.ts`, `lib/access.ts`, `domain/safety/*`, `middleware.ts`, `app/api/stripe/webhook/route.ts` |

### Guiding thesis

The moat is **memory + accuracy feedback**, not features. Wuwu wins by remembering the user and keeping score. Safety controls are ship-blockers (AI advisor legal landscape), not nice-to-haves.

---

## 3. Cadence

- Sessions can be any length; aim to ship one coherent issue per session.
- Always append to `docs/handoff-log.md` **before ending the session** — this is the seam between coordinators.
- Verify Vercel deploy after every push: check the dashboard or `vercel logs` for build errors.
- Post-deploy: run `npm run typecheck` and confirm unit tests pass (`npx vitest run`).

---

## 4. Workflow Per Issue

```
bd ready                         # pick the top ready issue
│
bd update <id> --claim           # claim it
│
Read CLAUDE.md + relevant files  # understand context before writing a line
│
Write code                       # smallest safe patch
│
npm run typecheck                # MUST be clean
npx vitest run                   # MUST be green
│
git add <specific files>         # never git add -A (risk of secrets/binaries)
git commit -m "..."              # include Co-Authored-By trailer
git push                         # Vercel auto-deploys on push to main
│
Verify deploy                    # wait for Vercel to go green
│
bd close <id>                    # mark done
│
Append to docs/handoff-log.md    # MANDATORY before ending session
│
bd dolt push                     # if Dolt remote configured
```

**Verification gates — never skip:**
1. `npm run typecheck` must exit 0 before commit
2. `npx vitest run` must be green
3. Vercel build must succeed post-push

---

## 5. Push / Deploy Protocol

Verbatim from `CLAUDE.md` (these are hard rules):

> **MANDATORY WORKFLOW when ending a work session:**
>
> 1. File issues for remaining work — create bd issues for anything needing follow-up
> 2. Run quality gates (if code changed) — typecheck, tests, linter
> 3. Update issue status — close finished work, update in-progress items
> 4. **PUSH TO REMOTE — this is MANDATORY:**
>    ```bash
>    git pull --rebase
>    bd dolt push
>    git push
>    git status  # MUST show "up to date with origin"
>    ```
> 5. Clean up — clear stashes, prune remote branches
> 6. Verify — all changes committed AND pushed
> 7. Hand off — provide context for next session
>
> **Work is NOT complete until `git push` succeeds. NEVER stop before pushing.**

Additional rule: **feature branches + PRs** — for anything non-trivial, push to a feature branch and open a PR rather than pushing directly to `main`. The user merges.

---

## 6. Issue Tracker — Beads (`bd`)

Beads is a local-first issue tracker stored in `.beads/`. All task tracking goes through `bd`. **Never use TodoWrite, TaskCreate, or markdown TODO lists.**

### Finding work
```bash
bd ready                          # issues with no blockers, ready to start
bd list --status=open             # all open issues
bd list --status=in_progress      # currently claimed
bd show <id>                      # full detail + dependencies
```

### Claiming + working
```bash
bd update <id> --claim            # claim an issue before writing code
bd update <id> --notes "..."      # add context while working
bd update <id> --design "..."     # record design decisions
```

### Closing
```bash
bd close <id>                     # mark one issue complete
bd close <id1> <id2> <id3>        # batch close (more efficient)
bd close <id> --reason="..."      # close with explanation
```

### Creating issues
```bash
bd create --title="Summary" \
  --description="Why this exists and what to do" \
  --type=task|bug|feature \
  --priority=2
```
Priority is **0–4 or P0–P4** (0=critical, 2=medium, 4=backlog). NOT "high"/"medium"/"low".
Always create the bd issue **before** writing code.

### Cross-session memory
```bash
bd remember "insight"             # persist knowledge across sessions
bd memories <keyword>             # search stored insights
```
**Do NOT create MEMORY.md files.** They fragment across accounts. Use `bd remember` instead.

### Sync
```bash
bd dolt push                      # push beads to Dolt remote (if configured)
bd prime                          # load full workflow context (run after compaction/new session)
```

### Hard rules
- Use bd for ALL task tracking.
- Create the issue BEFORE writing code.
- Mark in_progress when starting. Close only after deploy is verified.

---

## 7. Data Sources

| Source | What it tells you | How to access |
|---|---|---|
| `bd ready` | What's actionable right now | `bd ready` in project root |
| `docs/handoff-log.md` | What was done last session + pending carryovers | Read file |
| `git log --oneline -10` | Recent shipped work | git |
| `/ops` dashboard | MRR, LLM cost, funnel, P&L | Live at `wuwu-advisor.vercel.app/ops` (ops password required) |
| Vercel dashboard | Build status, env vars, deploy logs | `vercel.com/dashboard` |
| Stripe dashboard | Subscriptions, revenue, test-mode events | `dashboard.stripe.com` |
| `CLAUDE.md` | Project hard rules, architecture, safety-critical files | File in project root |
| `~/.claude/CLAUDE.md` | Global user preferences + model routing | File on machine |

---

## 8. Dashboards

```bash
# Typecheck
npm run typecheck

# Unit tests
npx vitest run

# Dev server
npm run dev            # http://localhost:3000

# Prod smoke (requires dev server running)
npm run test:smoke:auth
npm run test:smoke:checkout

# Lint
npm run lint

# Alpha readiness check
npm run verify:alpha
```

---

## 9. Tools

| Tool | Purpose |
|---|---|
| `bd` | Issue tracking (see §6) |
| `gh` | GitHub CLI — PRs, status checks |
| `vercel` | Deploy CLI (if needed for logs/env) |
| Bash tool | Shell commands, git, bd, npm |
| Read/Edit/Write | File operations |
| `npx tsx scripts/...` | One-shot verification scripts |

---

## 10. Active Focus Areas

The board is currently **empty** — all issues closed after the audit + gkg session. Next priorities by roadmap gate:

### Gate 3 — Launch commercially (next gate to close)
1. **3.2 Flip Stripe test → live** — enable live-mode keys, set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to live values in Vercel, verify webhook endpoint in Stripe dashboard, test with a real card. Ship-blocker for revenue. **~0.5 eng-day. Opus 4.7 / High** (security-critical).
2. **3.0 Pre-launch narrative + conversion quick wins** — landing page copy tuning, hero copy test. **~1 eng-day. Sonnet 4.6 / Medium**.
3. **3.3 Ops dashboard analytics second wave** — cohort retention, LTV estimates. **~1 eng-day. Sonnet 4.6 / Medium**.

### Gate 1 — Remaining hygiene
4. **1.12 Mobile debug guard** — wrap `DebugAccessBanner` in `__DEV__` before TestFlight public. **~0.5 eng-day. Sonnet 4.6 / Low**. Ship-blocker for mobile.

### Gate 2 — Operational instrumentation (next up after Gate 3)
5. **2.7 Ad-spend ingestion** — Meta + Google daily cost pull. Unblocks CPA-by-channel KPI.

---

## 11. Recently Shipped

| SHA | Title |
|---|---|
| `eceac34` | feat(gkg): Upstash Redis rate limiting — auth brute-force + LLM cost cap |
| `8fdfd5e` | fix(p2): Codex week-year boundary fix + Vercel sensitize-secrets script |
| `75b85ce` | feat: weekly big-decision counter + pricing copy fix |
| `d34d411` | sec: audit-2025-05 complete sweep (P0→P3) |
| `c85ecda` | feat(ux): C-01 timezone, F-10 nav labels, C-04 cult-phrase, F-11/12 voice rules |
| `3da4997` | feat(alpha): ship safety stack, memory, attribution, telemetry, UX fixes |
| `309c9b6` | feat(ops): profitability-first dashboard overhaul |

---

## 12. Iteration Log Protocol

Append to `docs/handoff-log.md` **before ending every session**. This is the handback seam between coordinators. Format:

```markdown
### YYYY-MM-DD (model: <model-name>)

**Issues touched:** <bd-id> | <title>
**Outcome:** shipped to live | drafted only | investigation only | blocked

**What was done:**
- <bullet per meaningful action>

**Files modified:**
- `path/to/file:LINE` — what changed

**Verification:**
- typecheck: ✓ / ✗
- unit tests: ✓ / ✗ (N passed)
- Vercel deploy: ✓ / pending / failed

**Next-session handoff notes:**
- <pending verifications that need human eyes>
- <unresolved design questions>
- <carryover for whoever resumes>
```

---

## 13. Resume Instructions for Anthropic Claude Code

When handing back to an Anthropic Claude Code session:

1. Read `docs/handoff-log.md` — top entry has the last session's state and pending items.
2. Run `bd prime` to restore full beads workflow context.
3. Run `git log --oneline -5` + `bd list --status=open` to confirm current state.
4. Brief the user: what was done, what's pending, recommended next task with model+effort.
5. Check `npm run typecheck` and `npx vitest run` — confirm clean baseline before starting.

---

## 14. Hard Rules

- **Never push directly to `main` for non-trivial changes** — feature branch + PR. User merges.
- **Never touch safety-critical files without extra care** — `lib/ops-auth.ts`, `lib/auth.ts`, `lib/billing.ts`, `lib/access.ts`, `domain/safety/*`, `middleware.ts`, `app/api/stripe/webhook/route.ts`.
- **Never add `git add -A` or `git add .`** — stage specific files only. Risks committing `.env.local` or large binaries.
- **Never skip `--no-verify`** on commits. If a hook fails, fix the root cause.
- **Never expand scope in-band** — the smallest safe patch wins. Open a new bd issue for adjacent work.
- **Never use TodoWrite, TaskCreate, or MEMORY.md files** — use `bd` and `bd remember`.
- **Stripe live-mode is gated** — do not flip `STRIPE_SECRET_KEY` to live without explicit user instruction.
- **Sensitive env vars** — `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ANTHROPIC_API_KEY`, and 7 others are already Sensitized in Vercel (write-only). Do not attempt to read them from Vercel dashboard.
- **`RATE_LIMIT_DISABLED=true`** — set in `.env.local` for local dev to skip Upstash checks.
