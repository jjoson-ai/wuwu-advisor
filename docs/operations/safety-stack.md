# Safety stack — modification protocol

The safety stack (`domain/safety/*`, `domain/decision/decision.safety.ts`, `lib/output-safety.ts`) is the layer between LLM output and the user. Bugs here cause real harm. Patches require a higher bar than the rest of the codebase.

Read `ARCHITECTURE.md §7` for the execution order and what each layer does. This file is the **how to safely change them** companion.

## 1. The five layers (recap)

1. **Crisis detection (input)** — `domain/safety/crisis-detection.ts::detectCrisisInput`
2. **Decision safety classifier** — `domain/decision/decision.safety.ts::classifyDecisionSafety` (Ask only)
3. **Generation pipeline** — see `ARCHITECTURE.md §8`
4. **Crisis detection (output)** — `domain/safety/crisis-detection.ts::detectCrisisOutput`
5. **Output safety classifier** — `domain/safety/output-safety.ts::classifyOutputSafety` (regex prefilter + Haiku judge)
6. **Internal-term sanitization** — `lib/output-safety.ts`

## 2. Before you change anything

- Read every existing test in `tests/unit/safety-*.test.ts` (or wherever the safety suites currently live). If your change doesn't have a regression test for the case you're fixing, write it **first**, watch it fail, then implement.
- Diff the regex change with `npm run test:unit -- safety` running in `--watch`. Regex precedence is the most common source of safety regressions; an "obvious" widening of a benign-prefilter pattern often silently disables a critical-pattern hit.
- If you're adding a new regex pattern, also add at least:
  - 3 positive examples (should match)
  - 3 negative examples (should NOT match — pay attention to the false-positive surface)
  - 1 ambiguous example (document why your call goes the way it does)

## 3. Fail-open vs fail-closed (re-stated, critical)

| Layer | On error |
|---|---|
| Crisis detection (regex) | Can't error in practice. On crash → block (caller's responsibility). |
| Decision safety (regex) | Can't error in practice. On crash → block. |
| Output safety LLM judge | **Fail-OPEN per request** — Anthropic outage must not DoS the app. |
| Output safety circuit breaker | After 5 consecutive judge failures, flips to **fail-CLOSED** — blocks all outputs until reset. |
| Internal-term sanitization | Best-effort string replacement; can't really fail. |

Do not change these defaults without explicit discussion. Flipping any of them silently is a P0 issue.

## 4. The Haiku judge — what it costs

Every generation that reaches output-safety pays one Haiku call. At current volume (~1k generations/day) this is sub-dollar; at 100k/day it's material. If you're tempted to widen the regex prefilter to short-circuit more cases (skip the judge), be aware:

- A widened regex prefilter can produce false-positive blocks. The judge exists to handle nuance the regex can't.
- A widened prefilter must come with a corresponding **negative-example test pass** to prove it doesn't over-block.

If you're tempted to disable the judge entirely for cost: don't. Cost-cut elsewhere (rate-limit tightening, Sonnet→Haiku swaps in compose pass).

## 5. Care Mode — never improvise

`domain/safety/care-mode.ts::buildCareModePayload` returns hardcoded copy. There is no LLM call in Care Mode. This is the **deterministic path** for crisis cases; an LLM hallucinating during a self-harm crisis is the failure case we are specifically avoiding.

If you want to change Care Mode copy:

1. Bump `CARE_MODE_VERSION`.
2. Update the resource list against the current 988 / Samaritans / Crisis Text Line / findahelpline.com URLs (these have changed before).
3. Run the unit suite that asserts Care Mode does not call any LLM client.
4. Have a human review the copy before merge. This is not an offload-eligible task.

## 6. Output sanitization — the leak list

`lib/output-safety.ts` recursively scans the final JSON payload for terms that should never reach the user:

- `complexityScore`, `conflictScore`, `emotionalIntensity`, `decisionAmbiguity`, `synthesisBurden`, `phaseShiftScore`
- `forced_frontier_reasons`, `final_model_selected`, `path_taken`, `fallback_triggered`
- (full list in the file)

If you add a new internal signal name, add it to this list **in the same PR**. Forgetting is how internal naming leaks into user-facing copy.

## 7. Decision safety categories — symmetric coverage

`classifyDecisionSafety` returns one of `{normal, self_harm, harm_to_others, illegal_wrongdoing}`. The four corresponding response modes are in `DECISION_SAFETY_MODES`. If you add a new category:

1. Add the regex patterns (benign prefilter + matchers).
2. Add the corresponding response mode (`buildDecisionSafetyResponse`).
3. Update the route handler that dispatches (`app/api/generate-decision-guidance/route.ts`).
4. Add at least one test per layer.

Asymmetric coverage (a category that classifies but doesn't dispatch, or dispatches but doesn't classify) is the second most common safety regression after regex precedence.

## 8. What does **not** go in the safety stack

- Brand voice rules (those live in `domain/safety/prompt-rules.ts::VOICE_DISCIPLINE_RULES` — included in every system prompt but enforced by the LLM, not by post-generation classifier).
- Free-tier feature gating (that's `lib/access.ts` + `lib/server-usage-limits.ts`).
- Content quality (verbosity, hedge count, jargon glossing) — `prompt-rules.ts` warns the LLM but doesn't post-reject.

If a non-safety concern feels like it should go in the safety stack, you probably want a different layer.

## 9. Smoke test before merge

For any safety-stack patch:

```bash
npm run test:unit -- safety
npm run test:unit -- decision
npm run build
```

And manually trigger one example of each:

- Benign decision question (should reach generation).
- Crisis input (should return Care Mode without LLM call).
- Decision-safety self-harm category (should return crisis_support mode).
- Output-safety violation (e.g. a forced "stock pick" question — should be blocked by output safety).

Save the request/response transcripts to `docs/audits/` for the merge record.
