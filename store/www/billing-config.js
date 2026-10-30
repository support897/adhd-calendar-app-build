// Pace billing config — filled at the Paid Apps sitting
// (Finance read-back, 19 Oct 2026, RC project deeac682).
//
// The appl_ key is RevenueCat's PUBLIC SDK key: it ships in
// the app by design. No secret key lives here or anywhere in
// the client — purchases are verified by RevenueCat and the
// entitlement record is written system-side only.
window.PACE_BILLING = {
  revenueCatIosKey: "appl_ZQeXxKVfHuNVSaMGGuhKTVNKdsq",
  revenueCatAndroidKey: null,
  entitlement: "plus",
  products: { monthly: "pace_plus_monthly", yearly: "pace_plus_yearly", lifetime: "pace_lifetime" }
};
