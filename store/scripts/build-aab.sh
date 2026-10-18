#!/bin/bash
# Pace AAB build — the sandbox-proven recipe (see STORE-README.md).
set -e
export JAVA_HOME=$HOME/tools/jdk-21
export PATH=$JAVA_HOME/bin:$PATH
export JAVA_TOOL_OPTIONS="-Djava.net.preferIPv6Addresses=true -Djavax.net.ssl.trustStore=$HOME/tools/truststore.jks -Djavax.net.ssl.trustStorePassword=changeit"
# /tmp is a 512M tmpfs in this sandbox and the bundle task spills
# there (build died 16 Oct on "No space left"); spill to the big disk.
export JAVA_TOOL_OPTIONS="$JAVA_TOOL_OPTIONS -Djava.io.tmpdir=$HOME/workspace/pace-store/.tmp"
export TMPDIR=$HOME/workspace/pace-store/.tmp
export GRADLE_USER_HOME=$HOME/tools/gradle-home
export ANDROID_HOME=$HOME/tools/android-sdk
export ANDROID_SDK_ROOT=$HOME/tools/android-sdk
cd $HOME/workspace/pace-store
node scripts/sync-www.mjs > /dev/null
# The speech-recognition plugin pins AGP 8.7.2, which this sandbox
# cannot download; the app builds on cached AGP 8.13.0. Align the
# plugin's classpath before Gradle runs (idempotent; survives npm
# reinstalls because it is re-applied here every build).
sed -i "s/com.android.tools.build:gradle:[0-9.]*/com.android.tools.build:gradle:8.13.0/" node_modules/@capacitor-community/speech-recognition/android/build.gradle 2>/dev/null || true
npx cap copy android > /dev/null
# ^ REQUIRED before Gradle: without cap copy, Gradle happily wraps the
#   STALE android assets and reports success (caught 14 Oct: the first
#   rebrand AAB contained the previous build byte-for-byte).
cd $HOME/workspace/pace-store/android
$HOME/workspace/tools/gradle/gradle-8.14.3/bin/gradle bundleRelease -x lintVitalRelease --max-workers=2 --console=plain
echo "EXIT=$?"
