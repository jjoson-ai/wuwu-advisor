# Wuwu Advisor Launch QA Checklist

This checklist is for the current MVP launch surface only:
- Today
- Forecast
- Blueprint
- Ask
- Free + Pro
- web checkout
- mobile surface parity where applicable

Use a dedicated **free** test user and a dedicated **Pro** test user where possible.

## 1. Global setup

- Verify the debug tier override is set to `Auto`
- Verify the free test user is actually `free`
- Verify the Pro test user is actually `pro`
- Verify onboarding is complete
- Verify the environment points to the intended Stripe mode and app origin

## 2. Free Today

Web:
- Open [dashboard/page.tsx](/Users/y9378348c/Documents/Hula%20House/astrologer-on-demand/app/dashboard/page.tsx)
- Generate Today
- Confirm the page shows:
  - Summary
  - What to lean into
  - Watch for
  - Best timing
  - Work
  - Money
  - Relationships
  - Energy
  - Reflection
  - Small move
- Confirm no crash and no leaked internal terms

Mobile:
- Open [today-screen.tsx](/Users/y9378348c/Documents/Hula%20House/astrologer-on-demand/apps/mobile/src/features/today/today-screen.tsx)
- Generate Today
- Confirm the same core sections render
- If the refresh limit is hit in the target environment, confirm the upgrade CTA opens checkout

## 3. Pro Today

- Generate Today as a Pro user
- Confirm output renders normally
- Confirm no free-tier upgrade prompt is shown
- Confirm no stale warning appears on a freshly generated Pro artifact

## 4. Free Forecast

Web:
- Open [forecast/page.tsx](/Users/y9378348c/Documents/Hula%20House/astrologer-on-demand/app/forecast/page.tsx)
- Generate Forecast
- Confirm the hero card is compact and structured
- Confirm it reads as a 30-day Forecast, not Today
- Confirm only free-visible content is shown
- Confirm locked cards remain locked

Mobile:
- Open [forecast-screen.tsx](/Users/y9378348c/Documents/Hula%20House/astrologer-on-demand/apps/mobile/src/features/forecast/forecast-screen.tsx)
- Generate Forecast
- Confirm the same free summary behavior
- Confirm locked cards show `Unlock Pro`
- Confirm tapping `Unlock Pro` opens the web Stripe checkout flow

## 5. Pro Forecast

- Generate Forecast as a Pro user
- Confirm the summary card renders in the correct section order
- Confirm `Current phase` and detailed cards render
- Confirm `Planning lens` is visible
- Confirm no stale warning appears on a freshly generated Pro artifact

## 6. Free Blueprint

Web:
- Open [blueprint/page.tsx](/Users/y9378348c/Documents/Hula%20House/astrologer-on-demand/app/blueprint/page.tsx)
- Generate Blueprint
- Confirm visible free sections render:
  - Overview
  - Guiding numbers
  - Chinese signature
  - How you come across
  - How you connect
- Confirm locked sections remain locked

Mobile:
- Open [blueprint-screen.tsx](/Users/y9378348c/Documents/Hula%20House/astrologer-on-demand/apps/mobile/src/features/blueprint/blueprint-screen.tsx)
- Generate Blueprint
- Confirm the same free-visible sections
- Confirm locked cards open the web Stripe checkout flow

## 7. Pro Blueprint

- Generate Blueprint as a Pro user
- Confirm full sections render
- Confirm BaZi rows show:
  - label tooltip/explainer on the label
  - inline descriptor on the value
- Confirm if BaZi is unavailable, the page shows the intended fallback instead of crashing

## 8. Free Ask

Web:
- Open [decision/page.tsx](/Users/y9378348c/Documents/Hula%20House/astrologer-on-demand/app/decision/page.tsx)
- Submit a normal question
- Confirm guidance renders
- Confirm disclaimer appears above the question form
- Hit the free usage limit
- Confirm the upgrade CTA appears and starts checkout

Mobile:
- Open [ask-screen.tsx](/Users/y9378348c/Documents/Hula%20House/astrologer-on-demand/apps/mobile/src/features/ask/ask-screen.tsx)
- Submit a normal question
- Hit the free usage limit
- Confirm the upgrade CTA opens the web Stripe checkout flow

## 9. Pro Ask

- Submit a question as a Pro user
- Confirm no usage-limit upgrade prompt is shown
- Confirm guidance renders
- Confirm recent questions still work

## 10. Web free-to-Pro upgrade path

- As a free user, generate a free Forecast or Blueprint first
- Click `Unlock Pro`
- Complete Stripe Checkout
- Confirm return passes through:
  - `/billing/complete`
  - `/billing/return`
  - final app page with `upgraded=1`
- Confirm the user is now treated as Pro

## 11. Stale artifact behavior after upgrade

- Upgrade after generating a free Forecast, Blueprint, Today artifact, or Ask guidance
- Confirm old free-generated artifacts do **not** simply reveal Pro depth
- Confirm the app shows the intended stale/regenerate message
- Regenerate
- Confirm full Pro depth appears only after regeneration

## 12. Billing/webhook sanity

- Confirm `checkout_started` is logged when checkout begins
- Confirm `checkout_completed` is logged on successful return
- Confirm the Stripe webhook endpoint is reachable for:
  - `checkout.session.completed`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

## 13. Instrumentation sanity

- Confirm server logs show:
  - `today_generated`
  - `forecast_generated`
  - `blueprint_generated`
  - `ask_submitted`
- Confirm `tier`, `platform`, `generation_path`, and `final_model_selected` are present on generation events
- Confirm `paywall_shown` and `upgrade_clicked` fire from current upgrade surfaces

## 14. Launch blockers

Block launch if any of these fail:
- Stripe checkout does not return to the app cleanly
- upgrading reveals premium content from a stale free artifact without regeneration
- mobile `Unlock Pro` CTA does not open checkout
- any core surface crashes on free or Pro
- internal routing/debug terms appear in user-facing output
