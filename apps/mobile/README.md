# Astrologer On Demand Mobile

This is the Phase B Expo shell for the future mobile app.

Current scope:

- Supabase email/password sign-in
- optional dev-only test account sign-in
- session persistence on device
- onboarding/settings gate
- real Today, Blueprint, Forecast, Ask, and Settings screens

## Required environment

Copy `.env.example` to `.env` and set:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000
EXPO_PUBLIC_ENABLE_TEST_ACCOUNT_SIGN_IN=false
EXPO_PUBLIC_TEST_ACCOUNT_EMAIL=
EXPO_PUBLIC_TEST_ACCOUNT_PASSWORD=
```

Notes:

- Use `10.0.2.2` for Android emulator access to a backend running on your local machine.
- For a physical Android device, replace `EXPO_PUBLIC_API_BASE_URL` with your machine's LAN IP, for example `http://192.168.1.25:3000`.
- The mobile app still listens for Supabase auth callback URLs so future OAuth or recovery flows can reuse the same scheme.
- The test-account sign-in is for local development only. Keep it disabled in normal builds and never commit real credentials.

## First run

```bash
cd "/Users/y9378348c/Documents/Hula House/astrologer-on-demand/apps/mobile"
npm install
npm run start
```

## iOS simulator

Use the default iOS script for normal local runs:

```bash
cd "/Users/y9378348c/Documents/Hula House/astrologer-on-demand/apps/mobile"
npm run ios
```

This intentionally uses `expo run:ios --no-install` to avoid Expo re-running a fragile CocoaPods install step on every build.
It also applies a small local patch for an Expo iOS build script that breaks when the project path contains spaces.

If native iOS dependencies change, refresh Pods first:

```bash
cd "/Users/y9378348c/Documents/Hula House/astrologer-on-demand/apps/mobile"
npm run ios:pods
npm run ios
```

Or do both in one command:

```bash
cd "/Users/y9378348c/Documents/Hula House/astrologer-on-demand/apps/mobile"
npm run ios:install
```

## Stable Android emulator restart

Use this when Expo Go or Metro gets into a bad state on the emulator:

```bash
cd "/Users/y9378348c/Documents/Hula House/astrologer-on-demand/apps/mobile"
npm run android:reset
```

What it does:

- kills the old Expo process
- resets `adb reverse`
- starts Metro on `localhost`
- launches Expo Go with `exp://127.0.0.1:8081/--/`

## Validation

```bash
cd "/Users/y9378348c/Documents/Hula House/astrologer-on-demand/apps/mobile"
npm run typecheck
```
