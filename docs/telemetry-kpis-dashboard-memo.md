# Wuwu Telemetry & KPI Dashboard Memo

## Purpose
This memo defines the minimum real-time operator dashboard for Wuwu Advisor.

It is for:
- revenue growth tracking
- cost management
- gross margin / contribution monitoring
- product decision-making
- fundraising readiness
- prioritizing investments / features

This is an **internal-only** dashboard, not a user-facing feature.

---

## Decision principle
Track metrics that help answer:

1. Is the business growing?
2. Is the product converting and retaining?
3. Is compute staying disciplined?
4. Which surfaces justify more investment?
5. Which surfaces are too expensive relative to value?
6. When are credits / premium deep dives justified?

Avoid vanity metrics that do not change decisions.

---

## KPI blocks

## 1) Revenue growth
Track in real time or near-real time:

- MRR
- ARR run-rate
- new paid subscriptions
- net paid adds
- upgrade conversion rate
- checkout start -> completion
- web share of paid
- ARPPU
- net ARPPU
- annual-plan mix

### Why it matters
This tells you:
- whether monetization is working
- whether pricing/packaging needs adjustment
- whether web checkout is improving economics

---

## 2) Retention / monetization quality
Track:

- paid D7 retention
- paid D30 retention
- monthly paid retention
- churn / cancellation rate
- reactivation rate if available
- upgrade timing after first value moment
- later-ready placeholder for credit / upsell attach

### Why it matters
This tells you:
- whether Pro is actually valuable
- whether the product creates continuity
- whether later credits should layer onto healthy retention or try to compensate for weak retention

---

## 3) Product usage / demand
Track:

- DAU / WAU / MAU
- Today usage
- Forecast usage
- Blueprint usage
- Ask usage
- Ask intensity per user
- Ask intensity per paid user
- repeat Ask within 24h
- regeneration rate
- free -> Pro conversion by surface

### Why it matters
This tells you:
- which surfaces drive habit
- which surfaces drive conversion
- which moments indicate urgent willingness to pay
- where credits/deep dives may later fit best

---

## 4) Cost / gross margin
Track:

- total compute cost
- LLM cost by surface
- LLM cost by tier
- LLM cost by platform
- astrology API cost by surface if available
- cost per active user
- cost per paid user
- gross margin by tier
- gross margin by surface
- gross margin by platform
- model routing mix
- fallback rate

### Why it matters
This tells you:
- whether margin is being dragged by model choice
- whether a feature is commercially healthy
- whether hosted astrology API cost is material or noise relative to LLM cost
- where routing changes can improve profitability

---

## 5) P&L operating view
Track:

- revenue
- COGS
- gross profit
- gross margin %
- refunds
- failed payments
- support / activation issue counts if available
- optional fixed-infra estimate
- optional contribution margin after fixed infra

### Why it matters
This gives a founder/investor-ready view of:
- topline
- cost base
- margin
- operating health

---

## 6) Quality / trust
Track separately from monetization:

- usefulness score
- adoption rate / followed advice
- hit rate for testable claims
- Brier score if available
- calibration if available
- harmful-output / complaint rate
- coverage of claims with explicit horizons / resolution rules if available

### Why it matters
Wuwu should not optimize only for engagement or upsell.
It needs to maintain trust, usefulness, and decision quality.

---

## Required filters
Dashboard should be filterable by:

- time window (today / 7d / 30d / MTD)
- tier (free / paid)
- surface (Today / Forecast / Blueprint / Ask)
- platform (web / mobile)
- model path / routing path if available

---

## Launch-minimum live metrics
The launch dashboard should at least make these live first:

### Revenue / monetization
- paywall_shown
- upgrade_clicked
- checkout_started
- checkout_completed
- plan_type
- upgrade_surface
- platform

### Usage / habit
- today_generated
- forecast_generated
- blueprint_generated
- ask_submitted
- ask_regenerated
- first-use variants where possible
- repeat Ask within 24h

### Cost / compute
- feature
- model selected
- cheap / premium / fallback routing path
- request cost estimate if available
- tier

---

## KPI interpretation rules

### Free -> Pro conversion
Do not look only at total conversion.
Break it down by:
- surface
- platform
- first value moment
- paid plan type
- annual vs monthly mix

### Ask intensity
This is one of the most important future-monetization indicators.
Watch for:
- repeated use in short windows
- follow-up behavior
- paid Ask intensity vs free Ask intensity
- signs of urgent decision support demand

### Gross margin
Do not judge only at the total-product level.
Look at:
- margin by feature
- margin by tier
- margin by platform
- model-path mix
- fallback frequency

### Quality
Keep usefulness separate from predictive accuracy.
Do not collapse all “quality” into one vanity score.

---

## What the dashboard should help decide
This dashboard should make it easier to decide:

- whether to keep the current Free + Pro structure
- when to add credits
- which feature deserves more investment
- whether web checkout should be pushed harder
- whether a model routing change improves or hurts profitability
- whether a new modality/API is worth the cost
- whether a premium deep dive should be launched

---

## Phase 2 later
Can wait until after launch:

- credit / upsell attach dashboards
- cohort tables
- more advanced retention slices
- deeper claim-resolution analytics
- feature-level contribution margin after allocated fixed costs
- investor-ready historical trend views
- experimentation framework

---

## Standing rule
This dashboard is for operator decisions, not vanity reporting.

Prioritize:
- revenue
- retention
- cost discipline
- margin
- trust
- signals that change roadmap decisions
