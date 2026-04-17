# Launch LLM Bake-off

This harness compares frozen Wuwu launch surfaces across routing variants without changing live prompts or schemas.

## What it covers
- Today
- Forecast
- Blueprint
- Ask

## Candidate variants
- Variant A: Sonnet default + Opus fallback
- Variant B: GPT-5.4 default + Sonnet/Opus fallback
- Variant C: mini on approved free/low-risk surfaces, Sonnet for paid and Ask
- Variant D: current production routing control

## Workflow
1. Run the bake-off runner against the frozen case pack.
2. Review the generated blind packets under `bakeoff/outputs/<run-id>/blind-review/`.
3. Fill reviewer score CSVs under `bakeoff/judgments/<run-id>/`.
4. Run the report generator to produce per-surface and per-tier rankings.

## Working rules
- Freeze prompt contracts and schemas during the bake-off.
- Treat Ask support context as a frozen dependency bundle. Generate it once, then reuse it across Ask variants.
- Prefer the cheapest acceptable stack, not the nominally strongest model.
- If a variant cannot complete a case cleanly, record it. Do not hand-edit outputs.

## Runtime folders
- `bakeoff/outputs/`
  - raw candidate outputs, blind review packets, run manifests, and CSV summaries
- `bakeoff/judgments/`
  - filled reviewer CSVs
- `bakeoff/reports/`
  - generated ranking and launch-routing recommendations
