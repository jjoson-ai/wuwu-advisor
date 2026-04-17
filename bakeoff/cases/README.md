# Bake-off Case Packs

These files define the frozen synthetic inputs for the launch routing bake-off.

## Files
- `profile-cases.json`
  - 20 synthetic user/profile cases used for Today, Forecast, and Blueprint.
  - Use these when comparing free vs Pro output quality across stable profile inputs.
- `ask-cases.json`
  - 20 high-intent Ask questions tied to the profile pack.
  - Oversamples career, relationship, timing, and uncertainty-heavy questions.

## Working rules
- Keep prompts and schemas fixed while running the bake-off.
- Do not edit case wording mid-run. If the pack changes, use a new `run_id`.
- Ask comparisons should reuse one frozen upstream context bundle per profile+tier so only the Ask surface varies.
