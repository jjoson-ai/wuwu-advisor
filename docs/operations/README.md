# Operations runbooks

In-repo operational policies. These are derived from session-by-session learnings and exist here (rather than only in agent state) so they survive context evictions and onboard new humans cleanly.

| Runbook | When to read |
|---|---|
| [`release-checklist.md`](./release-checklist.md) | Before every web or mobile release. |
| [`safety-stack.md`](./safety-stack.md) | Before modifying anything under `domain/safety/`, `domain/decision/decision.safety.ts`, or `lib/output-safety.ts`. |
| [`email-invariants.md`](./email-invariants.md) | Before touching `lib/email/*` or `app/api/email/webhook/route.ts`. |
| [`billing-live-flip.md`](./billing-live-flip.md) | Before flipping Stripe from test to live mode (G3.6). |
| [`offload-discipline.md`](./offload-discipline.md) | Before dispatching work to OpenCode / a non-Anthropic model. |

If you find yourself relying on tribal knowledge that isn't in one of these files, either add it here or add it to `ARCHITECTURE.md §16` (Critical invariants).

## See also

- `ARCHITECTURE.md` — system map (top-level)
- `SECURITY.md` — vulnerability reporting
- `CONTRIBUTING.md` — dev workflow
- `AGENTS.md` — product principles + scope rules
- `CLAUDE.md` — Claude-specific build conventions
- `docs/audits/` — audit findings (point-in-time, may be stale)
- `docs/launch-qa-checklist.md` — one-shot launch QA gate
