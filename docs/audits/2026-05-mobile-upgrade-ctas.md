# Mobile Upgrade-CTA Audit (G3.1)

**Generated:** 2026-05-06 by Anthropic Claude Opus 4.7 (after OC retry attempts hit `external_directory` permission rejections)
**Scope:** Inventory every Upgrade / Pro / paywall surface in `apps/mobile/src/` ahead of G3.2's reader-app rewrite
**Branch:** `feat/g3.1-mobile-cta-audit`

---

## Executive Summary

- **Total upgrade CTAs:** 6 (across 4 screens)
- **Architectural pattern:** All CTAs ultimately call `startProCheckout()` in `apps/mobile/src/lib/pro-checkout.ts`, which hits `/api/checkout` and opens the returned Stripe Checkout URL via `Linking.openURL()` — i.e. **already opens in external browser, no in-app billing exists**.
- **Reader-app posture:** The flow is technically reader-app compatible today (no native IAP code), but the **copy is too purchase-adjacent** for Google's reader-app exemption. Words like "Upgrade to Pro" / "Unlock" / Pro pricing implications need to be softened in G3.2.
- **No native IAP code found.** No `react-native-iap`, no `expo-in-app-purchases`, no RevenueCat — clean slate.

The good news: G3.2 is mostly a **copy + flow-affordance rewrite**, not an architectural change. We don't need to build any new payment plumbing.

---

## Inventory

### 1. `apps/mobile/src/components/locked-feature-card.tsx` — shared component

The single source of upgrade-button rendering used by Forecast and Blueprint screens. Default `ctaLabel = "Upgrade to Pro"`, default `statusLabel = "Included in Pro"`. The button's `onPress` fires `paywall_shown` / `upgrade_clicked` product events and calls `startProCheckout({ feature, upgradeSurface })`.

Re-used at: forecast-screen.tsx:336, forecast-screen.tsx:348, blueprint-screen.tsx:604, blueprint-screen.tsx:613 (4 instances).

### 2. `apps/mobile/src/lib/pro-checkout.ts` — the actual checkout helper

```typescript
export async function startProCheckout(input: StartProCheckoutInput) {
  const payload = await apiRequest<CheckoutResponse>("/api/checkout", {...});
  await Linking.openURL(payload.checkoutUrl);
}
```

This is the only path from mobile → checkout. Already external-browser via `Linking.openURL`. **Reader-app safe by construction.**

### 3. Per-screen hits

| Screen | Line | Component / Pattern | Current copy | upgradeSurface | Reader-app safe? |
|---|---|---|---|---|---|
| **Today** (`today-screen.tsx`) | 593 | Inline `<Pressable>` → `startProCheckout({feature: "today", upgradeSurface: "today_refresh_limit"})` | "Upgrade to Pro" | `today_refresh_limit` | ✅ external link, ⚠️ copy is purchase-adjacent |
| **Today** (`today-screen.tsx`) | 806 | Inline `<Pressable>` (no onPress wired — dead button currently) | "Upgrade to Pro" | (none) | ⚠️ COPY + dead button bug |
| **Forecast** (`forecast-screen.tsx`) | 336 | `<LockedFeatureCard>` for "regenerate at higher tier" stale-state nudge | `ctaLabel="Regenerate Forecast"` | (no upgradeSurface) | ✅ this one is for re-gen, not upgrade |
| **Forecast** (`forecast-screen.tsx`) | 348 | `<LockedFeatureCard>` consolidated paywall | "Upgrade to Pro" (default) + "Unlock your full Forecast" title | `forecast_consolidated_paywall` | ✅ external link, ⚠️ "Upgrade" / "Unlock" copy |
| **Blueprint** (`blueprint-screen.tsx`) | 604 | `<LockedFeatureCard>` regenerate-at-higher-tier | `ctaLabel="Regenerate Blueprint"` | (none) | ✅ regen, not upgrade |
| **Blueprint** (`blueprint-screen.tsx`) | 613 | `<LockedFeatureCard>` consolidated paywall | "Upgrade to Pro" + "Unlock your full Blueprint" title | `blueprint_consolidated_paywall` | ✅ external link, ⚠️ "Upgrade" / "Unlock" copy |
| **Ask** (`ask-screen.tsx`) | 607 | Inline `<Pressable>` → `startProCheckout({feature: "ask", upgradeSurface: "ask_usage_limit"})` | "Upgrade to Pro" | `ask_usage_limit` | ✅ external link, ⚠️ copy |

### 4. Telemetry

Two product events fire from these surfaces:
- `paywall_shown` — fired on render (de-duped via `onceKey`)
- `upgrade_clicked` — fired on press, immediately before `startProCheckout`

These are useful for measuring funnel; G3.2 should NOT remove them. Just make sure the rewritten CTAs still fire them.

---

## Bug found during audit (file separately)

**`today-screen.tsx:806` has a dead "Upgrade to Pro" `<Pressable>` with no `onPress` handler.** It renders inside the `featureAccess.canViewFullBlueprint` false branch ("Make this sharper with your Blueprint" card). Tapping it does nothing. Either (a) it should call `startProCheckout({feature: "today", upgradeSurface: "today_blueprint_nudge"})` like the others, OR (b) it should be removed if this card is decorative-only. Recommend filing as a separate bd P3 bug — out of scope for G3.2 reader-app rewrite, but worth a one-line fix while we're nearby.

---

## Recommended G3.2 changes (concrete spec)

### Pattern A — Replace "Upgrade to Pro" copy on all 5 active CTAs

The reader-app exemption hinges on the in-app experience NOT looking like an in-app store. Google reviewers flag "Upgrade", "Subscribe", "Buy", "Purchase", "Unlock". Soften to neutral / informational verbs:

| Old | New (recommendation) |
|---|---|
| "Upgrade to Pro" | "Continue on web" |
| "Unlock your full Forecast" / "Unlock your full Blueprint" | "See your full Forecast" / "See your full Blueprint" |
| "Included in Pro" (status badge) | "Available on web" |
| Confirmation dialog (NEW): on press, show alert "Pro is managed on wuwu-advisor.com. Continue?" with Continue/Cancel | (see below) |

### Pattern B — Add a one-step interstitial before `Linking.openURL`

Currently the press IMMEDIATELY opens the browser. Reader-app reviewers prefer an explicit user gesture confirming the external transition. Add a `Alert.alert` step:

```typescript
import { Alert, Linking } from "react-native";

await Alert.alert(
  "Continue on web",
  "Pro plans are managed on wuwu-advisor.com. We'll open your browser to continue.",
  [
    { text: "Cancel", style: "cancel" },
    {
      text: "Continue",
      onPress: async () => {
        await trackProductEvent({ event_name: "upgrade_clicked", ... });
        await startProCheckout({ ... });
      },
    },
  ],
);
```

### Pattern C — Add `utm_source=android-app` to the checkout URL

Modify `pro-checkout.ts` to append `?utm_source=android-app&utm_medium=external_link&utm_campaign=<upgradeSurface>` to the returned `checkoutUrl` so paid-conversion telemetry can attribute the install funnel. This is a 5-line change in `pro-checkout.ts`. Web `/api/checkout` already supports a `returnPath` param; extending it to accept `utm_*` params and forward them is trivial.

### Pattern D — Update `LockedFeatureCard` to take `ctaLabel` everywhere it currently uses the default

Two of the 4 `LockedFeatureCard` callsites currently rely on the default `ctaLabel = "Upgrade to Pro"`. After Pattern A's copy update, change the default in `locked-feature-card.tsx` to `"Continue on web"` so stale callsites inherit the new copy automatically.

### Files G3.2 will touch

- `apps/mobile/src/components/locked-feature-card.tsx` — change default `ctaLabel`, default `statusLabel`
- `apps/mobile/src/lib/pro-checkout.ts` — add Alert interstitial, append utm_* params
- `apps/mobile/src/features/forecast/forecast-screen.tsx` — `LockedFeatureCard` props (title copy)
- `apps/mobile/src/features/blueprint/blueprint-screen.tsx` — `LockedFeatureCard` props (title copy)
- `apps/mobile/src/features/ask/ask-screen.tsx` — inline button copy (line 615)
- `apps/mobile/src/features/today/today-screen.tsx` — inline button copy (lines 601, 806). Fix dead-button bug at line 806 OR file separately.

Estimated effort: **0.5–1 eng-day. Offload `glm-5.1:cloud` with this audit doc as input.** No Opus required for the rewrite.

---

## Reader-app rules to apply in G3.2

Verbatim, paste into the G3.2 brief:

- **No** "Buy" / "Subscribe" / "Purchase" / "Pay" verbs in-app
- **No** "Upgrade" verb (it's borderline; soften to "Continue on web" or "Manage on wuwu-advisor.com")
- **No** prices shown in-app on Android (the feature-list and benefits are fine; the dollar amount is the trigger). The current code does NOT display $14.99 anywhere in mobile, ✅.
- **Always** an external-browser handoff via `Linking.openURL` (never an in-app webview for Stripe — Apple-specific concern, but Google increasingly aligns)
- **One-step confirmation** ("we're about to open your browser") — Pattern B above
- **Account-deletion in-app** — already exists per Gate 4 plan; verify in G4.1
- **Clear "managed on wuwu-advisor.com" framing** — replaces any "Upgrade to Pro" framing

---

## Verification (when G3.2 ships)

- [ ] No string "Upgrade to Pro" remains in `apps/mobile/src/` (`grep -rn "Upgrade to Pro" apps/mobile/src/` returns 0 hits)
- [ ] No string "Subscribe" or "Buy" appears in `apps/mobile/src/`
- [ ] All `Pressable` upgrade-CTAs are wired (no dead button at `today-screen.tsx:806`)
- [ ] `startProCheckout` always shows an Alert interstitial first
- [ ] Checkout URL includes `utm_source=android-app`
- [ ] Smoke-test on a physical Android device: tap each CTA → confirm Alert appears → tap Continue → confirm browser opens to `wuwu-advisor.com/pricing` or Stripe Checkout

---

## Notes for the next coordinator

- **Why this audit was Opus-written, not OC-written:** OC was dispatched twice via `minimax-m2.7:cloud` and both times bash tool calls were auto-rejected by OpenCode's `external_directory` permission system. The path `/Users/y9378348c/Documents/Hula House/...` and even the symlinked `/Users/y9378348c/wuwu-advisor/...` triggered rejection. Worth investigating an `opencode.json` permission allowlist as a separate bd issue. For now, similar read-only docs-audit work can be done by Anthropic CC with similar effort.
- **OC permission issue is a real blocker** for ~30% of routine offload work. File as P2 bd issue (`tools / opencode permission allowlist`) for follow-up.
