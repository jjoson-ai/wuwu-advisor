# Wuwu Advisor Commercialization Roadmap

## Purpose
Use this as the standing commercial reference for roadmap decisions.

Rule:
- launch now with Free + Pro
- layer in credits and compounding upsells after launch, not before

## Commercial model
### Launch model now
- Free + Pro

### Target model later
- Free + subscription + credits

### North-star principle
Habit free; monetize urgency and compounding value.

## Phase 1 — Launch monetization
Keep current Free + Pro gating.

Do not delay launch for credits.

Use launch to test:
- habit formation
- free-to-paid conversion
- paid retention
- perceived premium value

Treat Pro as the temporary umbrella monetization layer, not the final commercial architecture.

## Phase 2 — Credits layer
Add credits first to high-intent, high-compute surfaces:
- premium Ask sessions
- timing reads
- relationship deep dives
- career deep dives

Do not creditize everyday habit surfaces initially.
Keep Today and basic Forecast subscription-led.

Use web checkout first wherever possible to improve margin.

## Phase 3 — Compounding upsells
Every premium session/report should create two outputs:
1. a user-facing artifact
2. a structured memory delta

That memory delta should inform future Today, Forecast, and Ask outputs where relevant.

Do not let upsells become dead-end PDFs or one-off reads.

## What to instrument from launch
- Free -> Pro conversion by surface and by platform
- paid retention, annual-plan mix, and upgrade timing after first value moment
- Ask intensity: which questions signal willingness to pay for urgent decision support
- credit opportunity signals: where users ask for more depth than subscription alone should cover
- gross margin by tier, by surface, and by platform

Tracking note:
- define one canonical internal funnel first, then map outward to ad-platform events
- keep Google Ads / Meta conversion mapping layered on top of internal event names, not the other way around

Suggested canonical funnel:
- app_install / first_open
- signup_started
- signup_completed
- onboarding_completed
- first_today_generated
- first_forecast_generated
- first_blueprint_generated
- first_ask_submitted
- paywall_shown
- upgrade_clicked
- checkout_started
- checkout_completed
- pro_activated
- subscription_active
- revenue_recognized

## Architecture implications
Current app already supports this path:
- Today
- Blueprint
- Forecast
- Ask
- gating
- user profile/context layers

Compute note:
- astrology API spend is not the main compute issue; LLM COGS dominate
- near-term best value is hosted astrology plus tighter LLM routing, compact inputs, caching, and token telemetry
- self-hosted ephemeris is Phase 2 for control, portability, and moat, not the main pre-launch margin fix

Post-launch, add typed fields for premium memory writes:
- active goals
- open decisions
- constraints
- major themes
- named relationship/project context
- expiry dates

Future outputs should read only the relevant slice of this advisory context bundle.

## Decision rules
Add credits when:
- paid retention is acceptable
- urgent usage intensity shows under-monetized demand

Double down on web monetization if:
- mobile conversion is good
- app-store tax depresses contribution margin

Only expand upsells that improve:
- future product quality
- retention

Not just short-term revenue.

## Near-term operator workstreams
### Cross-platform auth hardening
Purpose:
- fix the long-term login stack across web + iOS + Android
- reduce dependence on magic link as the primary path

Scope:
- recommended target auth mix:
  - Sign in with Apple
  - Sign in with Google
  - email OTP / magic link as fallback
- Apple should be primary on iOS
- Google should be primary on Android and web
- do not introduce usernames
- do not make password login the primary path
- evaluate passkeys later, post-launch

Rule:
- treat this as a near-term roadmap item, not a mandatory pre-launch rewrite unless login becomes a blocker

### Paid-media conversion tracking layer
Purpose:
- give Google Ads and Meta the right optimization events for installs, activation, purchase, and revenue

Scope:
- use the canonical internal funnel above as the source of truth
- map Google Ads / Meta events from internal names instead of inventing platform-specific product semantics
- keep implementation narrow for launch: first-party event truth first, paid-media mapping second

## Recommended sequencing
1. final launch QA / cleanup
2. internal KPI dashboard v1
3. cross-platform auth hardening plan
4. paid-media conversion tracking layer
5. LLM bake-off and launch routing lock
6. compliance / trust wording cleanup
7. launch now with Free + Pro
8. post-launch credits layer
9. make upsells compound by writing structured context back into the advisory engine
