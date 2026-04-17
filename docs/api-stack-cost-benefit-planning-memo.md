# Wuwu API Stack Cost-Benefit Planning Memo

## Purpose
Update the roadmap with the missing second compute layer: LLM cost.

Key conclusion:
Astrology API cost is not the main compute driver. LLM cost dominates. That means the biggest near-term margin lever is not self-hosting astrology by itself. It is tighter LLM routing, smaller structured inputs, and prompt caching.

## Decision summary
### Best-value stack should be the near-term operating baseline
Use:
- FreeAstroAPI for astrology inputs
- Sonnet-default LLM routing
- Opus only for the hardest premium Ask / deep-dive cases
- compact structured upstream JSON
- prompt caching
- strict token telemetry by surface

### Self-hosted ephemeris should be Phase 2
Use self-hosted Swiss Ephemeris later for:
- control
- reliability
- portability
- moat
- some cost improvement at scale

Do not treat self-hosting as the main pre-launch margin fix.

## Why
### 1. LLM cost dominates astrology API cost
In the modeled stacks, LLM COGS are the overwhelming majority of variable compute cost.

Implication:
- moving from one astrology API vendor to another changes margin modestly
- changing frontier-model usage changes margin materially

### 2. Self-hosting alone does not slash LLM spend
Self-hosting the astrology layer reduces astrology vendor spend and can reduce prompt bloat a little, but it does not meaningfully reduce LLM usage unless paired with:
- compact normalized chart JSON
- caching static chart context
- removal of verbose vendor interpretation text
- tighter routing to cheaper models

### 3. Best-value beats status quo faster than full self-host
The highest-return, lowest-risk move is:
- keep a cheap hosted astrology layer
- discipline the LLM layer
- instrument real token costs

This improves margin without adding major pre-launch complexity.

## Updated stack comparison

### Status quo
- Astrology: FreeAstroAPI primary
- LLM: frontier-heavy Anthropic mix
- Margin outcome: acceptable for launch speed, but compute margin is dragged by expensive model usage

### Best value
- Astrology: FreeAstroAPI primary
- LLM: Sonnet-default, Opus only where truly needed
- Add compact structured payloads and prompt caching
- Margin outcome: best near-term tradeoff between quality, speed, and profitability

### Best in class
- Astrology: self-host Swiss Ephemeris + light hosted fallback
- LLM: strict routing, compact structured inputs, prompt caching
- Margin outcome: best long-term control and highest modeled margin, but more engineering and operational complexity

## Commercial recommendation
### Near-term recommendation
Adopt the **best-value stack** as the planning baseline.

That means:
- do not self-host astrology yet purely to save money
- do improve the LLM stack now
- keep launch scope tight

### Phase 2 recommendation
Move to self-hosted ephemeris when you want:
- stronger control
- lower vendor dependence
- more deterministic trust story
- better long-term platform moat
- some additional cost improvement at scale

## Roadmap implication
Add the following roadmap change:

### New compute/margin priority order
1. instrument real token cost by surface
2. cap expensive frontier model usage
3. compress astrology context before it reaches the LLM
4. add prompt caching
5. evaluate self-hosted ephemeris as a Phase 2 stack improvement

## What to instrument next
To turn this memo into real financial planning, instrument:
- token usage by Today / Forecast / Blueprint / Ask
- token usage by free vs paid
- token usage by web vs mobile
- model-path mix: cheap / frontier / fallback
- request cost estimates by surface

## Working rule
Treat astrology API choice as a product-quality and control decision.
Treat LLM architecture as the main gross-margin decision.
