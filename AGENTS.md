# Wuwu Advisor — Codex Operating Guide

Use this file as the default standing guide for implementation work in this repo.

## 1) Product truth

Wuwu Advisor is a premium AI astrology and decision-support product.

Core promise:
- clearer decisions
- better timing

The product should feel:
- grounded
- premium
- calm
- non-cringe
- reflective, not deterministic
- sharper, not longer

## 2) Launch truth

Launch with **Free + Pro now**.

Do **not** delay launch for credits.

Long-term target model:
- Free + subscription + credits

Current rule:
- subscription monetizes continuity, fuller access, and premium daily value
- credits later monetize urgency, timing precision, and high-compute premium sessions

## 3) Core product surfaces and jobs

- **Today** — 24-hour operating brief
- **Blueprint** — stable identity and decision-style reference
- **Forecast** — medium-horizon planning layer
- **Ask** — direct decision/timing guidance for active questions

## 4) Product principles

- free should be useful
- paid should be meaningfully deeper
- structured outputs beat long walls of text
- premium should feel more integrated, not merely unlocked
- premium sessions should eventually compound into future value
- avoid mystical fluff, generic horoscope filler, and deterministic claims
- no feature should feel like a dead-end artifact if it is premium-priced

## 5) Commercial principles

- Habit free; monetize urgency and compounding value
- Use launch to test:
  - free-to-paid conversion
  - paid retention
  - Ask usage intensity
  - gross margin by tier / surface / platform
  - web checkout share
  - compute discipline
- Credits, when added later, should start with:
  - premium Ask
  - timing reads
  - relationship deep dives
  - career deep dives
- Do **not** creditize Today or basic Forecast first
- Favor web checkout and annual plans where practical because web economics are stronger than mobile

## 6) What Wuwu Advisor is not

- not therapy
- not financial or medical advice
- not a generic astrology content farm
- not a one-shot report business
- not a psychic marketplace
- not a pure entertainment meme app
- not a pre-launch monetization science project

## 7) Scope control

Default to the smallest safe patch.

Do not propose:
- a pre-launch monetization rewrite
- unnecessary UI redesign
- broad architecture changes unless explicitly requested

For narrow parser / formatter / layout / bug tasks:
- prioritize current codebase reality
- do not drag in the full commercial context unless it matters

For product / monetization / paywall / landing page / instrumentation tasks:
- explicitly align with docs in `/docs`
- if docs conflict with current codebase reality, prioritize codebase reality for implementation and call out the conflict

## 8) Documentation map

Use these files when relevant:
- `docs/README.md`
- `docs/strategic-brief.md`
- `docs/commercialization-roadmap.md`
- `docs/pricing-model.md`
- `docs/brand-pack.md`
- `docs/api-stack-cost-benefit-planning-memo.md`
- `docs/telemetry-kpis-dashboard-memo.md`

For stack, provider, and compute-margin decisions:
- treat `docs/api-stack-cost-benefit-planning-memo.md` as part of the standing commercial/technical guidance set

For telemetry, KPI, internal dashboard, and commercialization-ops instrumentation decisions:
- treat `docs/telemetry-kpis-dashboard-memo.md` as part of the standing planning/commercialization/operations guidance set

For roadmap decisions around ad attribution / paid-media optimization and login-stack follow-up:
- treat `docs/commercialization-roadmap.md` as the standing source for:
  - cross-platform auth hardening as a near-term plan, not an implied pre-launch rewrite
  - paid-media conversion tracking as an internal-funnel-first layer on top of first-party events

## 9) Language / tone guidance

- premium, calm, precise
- useful to intelligent non-experts
- avoid hype, fluff, and over-explanation
- free surfaces should feel sharp, not chopped
- paid surfaces should feel richer, not merely longer

## 10) Launch optimization priorities

Current highest priorities:
1. real payment / entitlement validation
2. legal / trust pages
3. launch instrumentation
4. provider reliability / degraded mode
5. final launch QA / cleanup
6. internal KPI dashboard v1
7. cross-platform auth hardening plan
8. paid-media conversion tracking layer
9. LLM bake-off / launch routing lock
10. launch with Free + Pro

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
