#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_SCRIPT="$APP_DIR/node_modules/expo-constants/scripts/get-app-config-ios.sh"
TARGET_PODSPEC="$APP_DIR/node_modules/expo-constants/ios/EXConstants.podspec"
TARGET_LOCAL_PODSPEC="$APP_DIR/ios/Pods/Local Podspecs/EXConstants.podspec.json"
TARGET_PBXPROJ="$APP_DIR/ios/Pods/Pods.xcodeproj/project.pbxproj"
BROKEN_BASENAME='PROJECT_DIR_BASENAME=$(basename $PROJECT_DIR)'

if [ ! -f "$TARGET_SCRIPT" ]; then
  exit 0
fi

if grep -Fq "$BROKEN_BASENAME" "$TARGET_SCRIPT"; then
  perl -0pi -e 's/PROJECT_DIR_BASENAME=\$\(basename \$PROJECT_DIR\)/PROJECT_DIR_BASENAME=\$\(basename "\$PROJECT_DIR"\)/g' "$TARGET_SCRIPT"
fi

APP_DIR="$APP_DIR" python3 <<'PY'
import os
from pathlib import Path

app_dir = Path(os.environ["APP_DIR"])

targets = {
    app_dir / "node_modules/expo-constants/ios/EXConstants.podspec": (
        ':script => "bash -l -c \\"#{env_vars}$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\"",',
        ':script => "bash -l -c \\"\\\\\\"#{env_vars}$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\\\\\"\\"",',
    ),
    app_dir / "ios/Pods/Local Podspecs/EXConstants.podspec.json": (
        '"script": "bash -l -c \\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\"",',
        '"script": "bash -l -c \\"\\\\\\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\\\\\"\\"",',
    ),
    app_dir / "ios/Pods/Pods.xcodeproj/project.pbxproj": (
        'shellScript = "bash -l -c \\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\"";',
        'shellScript = "bash -l -c \\"\\\\\\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\\\\\"\\"";',
    ),
    app_dir / "ios/AstrologerOnDemand.xcodeproj/project.pbxproj": (
        '`\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\"`',
        '\\"$(\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\")\\"',
    ),
}

for path, (old, new) in targets.items():
    if not path.exists():
        continue
    text = path.read_text()
    if old in text:
        path.write_text(text.replace(old, new))
PY
