# Pace — store package (Capacitor wrap of the live web app)

Built 13 Oct 2026 under Ilse's store order (via HQ 22:06) + the Skills Scout's
store-packaging ruling (Capacitor route; ruling
~/workspace/skills-scout/rulings/2026-10-13-store-packaging.md).
The live web app is unchanged; this package only wraps it.

## What this is
- Capacitor 8.5.3 (core/android/ios/cli aligned), appId shop.ilseplacencia.pace,
  appName "Pace", version 1.0.0 (versionCode 1).
- www/ is a byte-identical copy of the web app, produced by
  scripts/sync-www.mjs (MD5-verified on every sync; the v3 app with To do +
  Habits is what's inside).
- capacitor.config.json holds no server.url and no cleartext — the app runs
  fully offline from the bundle.
- Android: variables.gradle minSdk 24 / compileSdk 36 / targetSdk 36 (the
  Scout baseline). Release signing reads android/keystore.properties ONLY when
  present (see SIGNING.md — the keystore is Ilse's Secure Vault step; the AAB
  here is built unsigned but signing-ready, the declared deviation).
- iOS: Xcode project + SPM, deployment target 15.0, bundle id set in the
  project, version 1.0.0 / 1, and a PrivacyInfo.xcprivacy wired into the app
  target (no tracking, no collected data, UserDefaults reason CA92.1 — the
  truth for a localStorage app). Compiling needs a Mac or cloud (none here).

## Listing pack (listing/)
LISTING.md (titles within limits, Play short description 74/80, full
description from real features, Apple keywords audited with the aso skill:
de-duplicated against the title, 'habits' added), PRIVACY-POLICY.md +
privacy.html (collects nothing; honest notes on the OCR CDN, browser voice
and local notifications), RATING-NOTES.md (4+/Everyone, all data-safety
answers "none", Apple review notes, the 6 pre-submission tasks),
feature graphic, icons, and 4 real screenshots per store (a 5th, Habits,
joins once the new logo wires).

## Proof gathered here
- cap sync clean; www MD5-identical to the web repo.
- Android bundleRelease: see "Build result" below (filled on completion).
- npx cap doctor: see below.
- No emulator exists on this machine (no /dev/kvm): the wrapped-app proof is
  the bundle's contents + the web app's own 143 maker checks + these records,
  stated plainly rather than dressed up.

## Build result (14 Oct 2026)
- app-release.aab BUILT: 3,181,694 bytes (final, incl. the O1 "Next" rename; the 3,181,693 B first build is superseded) at android/app/build/outputs/bundle/
  release/app-release.aab, from the laws build (logo C wired, sidebar law,
  empty-start, Skip guide; www MD5-verified identical, and the bundle's own
  assets/public/app.js MD5 e301c770 matches the repo build exactly).
- Identity (merged manifest): package shop.ilseplacencia.pace,
  versionCode 1, versionName 1.0.0.
- npx cap doctor: Capacitor 8.5.3 aligned (cli/core/android/ios);
  "Android looking great"; Xcode not installed (Linux — iOS compiles on a
  Mac/cloud at submission prep, as declared).
- Build environment notes (hard-won, for the next desk): Gradle works in
  this sandbox ONLY with -Djava.net.preferIPv6Addresses=true (the sandbox
  intercepts Java's IPv4 loopback; the daemon is unreachable without it),
  GRADLE_USER_HOME outside /root-vs-HOME split, a truststore = JDK cacerts +
  /etc/ssl/certs/hatch-egress-ca.pem, JDK 21 (Capacitor 8 source release),
  heap capped at 1024m and release lint skipped (the daemon was OOM-killed
  at the dex merge otherwise on this shared 8GB box).
- The AAB is UNSIGNED (signing-ready): android/keystore.properties is read
  only when present; see SIGNING.md for Ilse's Secure Vault step.

## Store Review fix build (14 Oct 2026, SW pace-v9)
Fixes for the Store Review sweep (Pace 42 PASS / 8 FAIL), maker sweep 166/166:
- SR-E1/E2: privacy.html + support.html published from the app repo and LIVE
  (200 at the exact URLs in listing/LISTING.md); both linked in Settings.
- SR-H6: support.html is the support URL (email + the common questions).
- SR-H2: all screenshots re-shot on this build — 6 per store, incl. the new
  04-to-do.png and 05-habits.png; old v2 shots deleted.
- SR-A7: Tesseract BUNDLED (vendor/tesseract: library + worker + LSTM cores
  + English data, licences in place); zero CDN references in the app.
  Bundletool catch, found by inspecting this bundle: bundletool stores .gz
  assets decompressed under the stripped name, so the language file rides
  as raw "eng.traineddata" (5,199,098 B) — the app passes gzip:false inside
  the Capacitor wrapper and asks for exactly that name (web keeps the .gz).
  Both shapes proven by test (web suite + store-shape simulation, exact OCR
  text, zero external requests).
- Rebuilt AAB: 9,099,462 bytes, BUILD SUCCESSFUL, contents verified against
  the repo (app.js MD5 49662782 inside and out, SW pace-v9, privacy/support
  inside, manifest identity unchanged). Still UNSIGNED — SR-I1 closes with
  Ilse's Vault keystore step in SIGNING.md, then a signed rebuild.
- Build script now lives in the package: scripts/build-aab.sh (the /root
  copy died with a VM restart; the recipe below is unchanged).

## Pre-submission (Ilse's steps, from RATING-NOTES.md)
Apple Developer US$99/yr + her ID check; Google Play US$25 + her ID check;
upload key via the Secure Vault route in SIGNING.md; host privacy.html at a
public URL (the live site stays untouched until she says so); bundle
Tesseract locally if Apple flags the runtime CDN (2.5.2 watch item);
compile iOS on a Mac/cloud and run both apps once on real devices.
- Export flag (post-re-run fix): ITSAppUsesNonExemptEncryption=false is now
  set in ios/App/App/Info.plist (plist parses, value verified False) — the
  App Store Connect encryption answer is "No" (the app uses no non-exempt
  encryption; it ships no crypto beyond the platform's own HTTPS).
