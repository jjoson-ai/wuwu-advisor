#!/usr/bin/env bash

set -euo pipefail

MOBILE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ADB_BIN="${ADB_BIN:-$HOME/Library/Android/sdk/platform-tools/adb}"

if [ ! -x "$ADB_BIN" ]; then
  echo "adb not found at: $ADB_BIN" >&2
  echo "Set ADB_BIN to your adb path and retry." >&2
  exit 1
fi

if ! "$ADB_BIN" devices | grep -q "device$"; then
  echo "No Android emulator/device connected." >&2
  exit 1
fi

pkill -f 'node .*expo start' || true

"$ADB_BIN" reverse --remove-all || true
"$ADB_BIN" reverse tcp:8081 tcp:8081
"$ADB_BIN" shell am force-stop host.exp.exponent || true

cd "$MOBILE_DIR"

echo "Starting Expo Metro on localhost..."
npx expo start --localhost --clear &
EXPO_PID=$!

cleanup() {
  if kill -0 "$EXPO_PID" >/dev/null 2>&1; then
    kill "$EXPO_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

sleep 8

echo "Launching Expo Go on the emulator..."
"$ADB_BIN" shell am start -W \
  -a android.intent.action.VIEW \
  -d 'exp://127.0.0.1:8081/--/' \
  host.exp.exponent

echo
echo "Expo is running. Keep this terminal open."
echo "Press Ctrl+C when you want to stop Metro."

wait "$EXPO_PID"
