#!/usr/bin/env bash
# Build the signed Google Play bundle (AAB). Run from anywhere:
#   mobile/scripts/android-release.sh
# Regenerates android/ with `expo prebuild --clean`, appends release signing that reads the
# upload key from env vars (filled from ~/.config/timeiq/android-signing.json), then runs
# bundleRelease and copies the AAB to mobile/build/timeiq-<version>-vc<versionCode>.aab.
set -euo pipefail

cd "$(dirname "$0")/.."
SIGNING_JSON="${TIMEIQ_SIGNING_JSON:-$HOME/.config/timeiq/android-signing.json}"
[ -f "$SIGNING_JSON" ] || { echo "Missing $SIGNING_JSON" >&2; exit 1; }

# Android Studio's bundled JDK when no JAVA_HOME is set.
if [ -z "${JAVA_HOME:-}" ] && [ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

# Release builds must never ship fixture data.
unset EXPO_PUBLIC_SCREENSHOT_MODE
export NODE_ENV=production

# Passwords go through the environment, never argv.
eval "$(node -e '
const s = require(process.argv[1]);
for (const [k, v] of [["STORE_FILE", s.storeFile], ["STORE_PASSWORD", s.storePassword], ["KEY_ALIAS", s.keyAlias], ["KEY_PASSWORD", s.keyPassword]]) {
  if (!v) throw new Error("android-signing.json is missing " + k);
  console.log(`export TIMEIQ_UPLOAD_${k}=${JSON.stringify(v)}`);
}' "$SIGNING_JSON")"

CI=1 npx expo prebuild -p android --clean

cat >> android/app/build.gradle <<'GRADLE'

// Added by scripts/android-release.sh: sign release builds with the Play upload key.
android {
    signingConfigs {
        upload {
            storeFile file(System.getenv("TIMEIQ_UPLOAD_STORE_FILE"))
            storePassword System.getenv("TIMEIQ_UPLOAD_STORE_PASSWORD")
            keyAlias System.getenv("TIMEIQ_UPLOAD_KEY_ALIAS")
            keyPassword System.getenv("TIMEIQ_UPLOAD_KEY_PASSWORD")
        }
    }
    buildTypes.release.signingConfig signingConfigs.upload
}
GRADLE

(cd android && ./gradlew --no-daemon bundleRelease)

read -r VERSION VC < <(node -e 'const e = require("./app.json").expo; console.log(e.version, e.android.versionCode)')
mkdir -p build
OUT="build/timeiq-$VERSION-vc$VC.aab"
cp android/app/build/outputs/bundle/release/app-release.aab "$OUT"
echo "Built $(pwd)/$OUT"
