# Offload discipline — when to delegate to OpenCode

Working notes derived from session experience (2026-04 → 2026-05). The single-sentence rule:

> If a task touches **auth, billing, schema, the safety stack, or any file in `ARCHITECTURE.md §17`**, do it in Claude Code. Everything else is offload-eligible, subject to scope discipline.

The dispatch mechanics (slash commands, `oc-tier`, `hh-orchestrate`, etc.) live in `~/.claude/CLAUDE.md` (agent state). This file is the **in-repo** version: what's safe to offload, what isn't, and how to write briefs that don't fail.

## 1. What stays in Claude Code

Per `~/.claude/CLAUDE.md` ("When to keep vs offload"):

- Auth / session handling
- Crypto primitives
- Distributed-system primitives (idempotency, locks, retries)
- Schema migrations (especially RLS)
- Stripe live-mode work
- Final code review of any safety-critical PR
- UI/UX changes that require visual judgment

Examples from this project: PR #11 (Sentry instrumentation + email idempotency semantics) was done in Claude. PR #9 (EAS Build pipeline) was originally an offload candidate but ran into permission issues; rather than fight them, it was done in Claude.

## 2. What offloads cleanly

- Multi-file mechanical refactors (rename, signature change, callsite update sweeps).
- Unit-test generation for an already-implemented feature.
- Documentation drafting (with human review).
- Codebase scouting / audits (`docs/audits/*` style work).
- Boilerplate scaffolding (route stubs, component shells, mock factories).
- Brand-voice content drafts (with human review).

## 3. Free-tier scope discipline

When using free OpenCode tier (`opencode/*-free` models), scope a single dispatch to:

- **≤ 2 production files + ≤ 1 test file** OR **≤ 120 lines of new/changed code**, whichever bound hits first.

Larger work decomposes into layers:

- **Layer A** = data / contract / single-file change.
- **Layer B** = orchestration / wiring (cross-cutting consumers).

Dispatch A first, merge it, then dispatch B. Don't combine. Concurrent OC tabs must operate on **disjoint** files — overlap (even on read paths) causes cross-contamination where one tab "helpfully" merges in changes that belong to another.

## 4. The phantom-completion guard

Free-tier OC has a documented failure mode: it reports "task complete, bd issue closed" but no actual code change landed. Mitigation goes in every brief:

> Before marking the bd issue closed, paste the actual output of `git show HEAD --stat` (or the diff hunks for the changed regions) into the bd close notes.

If that block is missing from the close notes, treat the close as suspect — re-verify the diff before assuming the work is done.

## 5. The merge-gate

Claude Code runs the merge-gate on every offloaded PR before close:

- `npm run typecheck && npm run test:unit && npm run lint` must pass.
- `git diff origin/main...HEAD` must be read end-to-end. No "trust the agent" close-without-review.
- For safety-critical files (`ARCHITECTURE.md §17`), additional smoke tests per `docs/operations/release-checklist.md`.

The cost of doing a 5-minute merge-gate review is much smaller than the cost of merging a phantom-complete PR and discovering it three days later.

## 6. The two-failures rule

If an offload dispatch fails twice on the same scope:

- **Don't dispatch a third time** with the same brief.
- Either decompose the scope further, OR pull the work back to Claude.

Three failed dispatches on the same brief is a signal that the brief is wrong, not that the model is having a bad day. Re-think the boundary.

## 7. Anti-fabrication

This applies to **every** agent, every model, every dispatch:

- Never invent identifiers (folder IDs, OAuth tokens, vendor API keys, Stripe price IDs, Supabase project refs, etc.).
- Missing input → config placeholder + bd blocker. Don't proceed with a guessed value.
- Tasks touching external resources (Sheets, Drive, OAuth, Shopify, vendor APIs) require human verification before any `bd close`.

The failure case here is real: an agent guesses `STRIPE_PRO_PRICE_ID = "price_1AaBbCc..."` because it sounds plausible, the brief moves through, and you find out at the first checkout attempt that the price ID doesn't exist.

## 8. The bd issue is the single source of truth

Don't pass derivative briefs as `--prompt` heredocs or `--message` files. The bd issue's `description` + `design` + `acceptance_criteria` IS the brief. Both `/offload` and `/oc-swarm` skills read the bd issue and pass it straight through to the OC sub-orchestrator.

Pre-flight check before any offload:

```bash
bd show <bd-id> --json | jq '.[0] | {description, design, acceptance_criteria}'
```

All three fields non-empty? Dispatch. Any field thin? Fill it in first.

## 9. OpenCode permission issue (known blocker)

OpenCode auto-rejects `external_directory` for paths containing spaces — including this repo's path (`/Users/y9378348c/Documents/Hula House/astrologer-on-demand`). A symlink at `/Users/y9378348c/wuwu-advisor` was also rejected.

Workaround (tracked in bd): add a project-level `opencode.json` with explicit `permission: "allow"` for this directory. Until that's resolved, sufficiently complex offloads fall back to Claude.

## 10. When NOT to offload (situational)

Beyond the global "stays in Claude" list:

- Anything where you can't articulate the acceptance criteria precisely. If the brief reads "make it nicer" or "improve the X experience", the work is too ill-defined to offload.
- Anything that hasn't been merged-gate-tested in this codebase before. The first time we do X-type work, do it in Claude so the pattern is documented; the second time, offload from the documented pattern.
- Anything blocking the critical path. Latency on offload (queue + dispatch + review + iterate) is real. For "ship this in the next hour" work, Claude is faster.

## 11. Related

- `~/.claude/CLAUDE.md` — agent-state dispatch protocol (not in-repo).
- `~/.claude/skills/offload.md` — `/offload` skill (not in-repo).
- `~/.claude/skills/oc-swarm.md` — `/oc-swarm` skill (not in-repo).
- `~/.config/opencode/topology.yaml` — OC agent topology (not in-repo).
- `docs/coordinator-handoff.md` — package for handing project coordination to a non-Anthropic coordinator.
- `docs/coordinator-launch-prompt.md` — corresponding launch prompt.
