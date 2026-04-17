# Native UX Audit Capture

This harness captures the native iOS app into:

`audit-artifacts/native-ux-capture/<run-id>/ios/<scenario>/`

Each scenario writes:

- `screenshot.png`
- `meta.json`
- `summary.txt`
- optional `hierarchy.txt` when `WUWU_CAPTURE_HIERARCHY=1`

## Prerequisites

- Maestro CLI installed and on `PATH`
- Xcode simulator tooling working
- iOS simulator booted
- app installed for bundle id `com.astrologerondemand.app`
- Metro/dev app running if your local build needs it
- one signed-in test user already present on the simulator
- onboarding already completed for that simulator user

Build/install the app on the simulator first:

```bash
cd "/Users/y9378348c/Documents/Hula House/astrologer-on-demand/apps/mobile"
npm run ios
```

The default iOS script applies a small local patch for an Expo iOS build script that breaks when the project path contains spaces.

If native iOS dependencies changed since the last build:

```bash
cd "/Users/y9378348c/Documents/Hula House/astrologer-on-demand/apps/mobile"
npm run ios:pods
npm run ios
```

## Commands

List scenarios:

```bash
npm run audit:ux:native:list
```

Run the full iOS capture:

```bash
npm run audit:ux:native:ios
```

Run only a subset:

```bash
WUWU_NATIVE_SCENARIOS=forecast-free,forecast-pro npm run audit:ux:native:ios
```

Reuse a specific run id:

```bash
WUWU_AUDIT_RUN_ID=20260323-120000 npm run audit:ux:native:ios
```

Capture a Maestro hierarchy dump per scenario:

```bash
WUWU_CAPTURE_HIERARCHY=1 npm run audit:ux:native:ios
```
