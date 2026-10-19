// Pace billing layer — the entitlement seam (Finance's
// PAYMENTS-CHAPTER-PLAN §3, wired 19 Oct 2026).
//
// THE UNLOCK RULE (the only rule, §3 verbatim): a paid feature
// opens when the user's entitlement record shows its
// entitlement with status trialing or active and the
// period/window has not ended — OR the user is inside the free
// month (the in-app trial: account-age based, SR's read; the
// store products carry NO intro offer, ever). Everything else
// stays shut. Free features never read this record at all.
//
// THE RECORD: subscriptions/{uid} in Pace's own backend —
// system-written only (the RevenueCat / Stripe webhook
// receivers); the rules give the client a get on its own record
// and deny every write (firestore.rules v2.2). This layer only
// ever READS it. plusActive() is synchronous for its callers: it
// answers from the last refresh, seeded at load from a cache
// that carries the record's OWN expiry — the cache covers the
// refresh gap at boot and can never extend past a period end
// (§5: no cached "had Plus once" — refresh re-reads every boot).
(function () {
  "use strict";
  var cfg = window.PACE_BILLING || null;

  // The products of record (Finance §2): pace_plus_monthly
  // A$4.99 · pace_plus_yearly A$39.99 · pace_lifetime A$99.99.
  var PRODUCTS = { monthly: "pace_plus_monthly", yearly: "pace_plus_yearly", lifetime: "pace_lifetime" };
  var ENTITLEMENT = "plus";
  var MONTH = 30 * 864e5;

  var _state = { known: false, plus: false, source: "none", until: 0 };
  try {
    var c = JSON.parse(localStorage.getItem("pace-ent-cache") || "null");
    if (c && c.until > Date.now()) _state = { known: false, plus: !!c.plus, source: c.source || "cache", until: c.until };
  } catch (e) {}

  function billingLive() { return !!cfg; }

  /* ---------- the RevenueCat bridge (the enabling build) ----
     On the packaged app the Purchases plugin is the device's
     live read of the same truth the webhook writes into
     subscriptions/{uid}: RC's customer info folds into the
     SAME §3 evaluation, never a second rule. Identity joins
     the app's own: logIn with the Firebase uid, so a purchase
     follows the person, not the device. On web (no plugin)
     this whole block is inert and the record read governs. */
  function rc() {
    try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases) || null; } catch (e) { return null; }
  }
  var _rcConfigured = false, _rcUid = null, _lastFb = null, _lastAnchor = null;
  function rcKey() {
    if (!cfg) return null;
    var plat = "web";
    try { plat = window.Capacitor.getPlatform(); } catch (e) {}
    return plat === "ios" ? (cfg.revenueCatIosKey || null) : plat === "android" ? (cfg.revenueCatAndroidKey || null) : null;
  }
  function rcSetup(uid) {
    var P = rc(), key = rcKey();
    if (!P || !key) return Promise.resolve(null);
    var chain = Promise.resolve();
    if (!_rcConfigured) { _rcConfigured = true; chain = chain.then(function () { return P.configure({ apiKey: key, appUserID: uid || undefined }); }); }
    if (uid && _rcUid !== uid) { _rcUid = uid; chain = chain.then(function () { return P.logIn({ appUserID: uid }); }); }
    return chain.then(function () { return P.getCustomerInfo(); }).then(function (res) { return (res && (res.customerInfo || res)) || null; }).catch(function () { return null; });
  }
  // CustomerInfo → the best §3 grant it carries.
  function rcGrant(info, now) {
    var out = { plus: false, until: 0 };
    try {
      var act = (info && info.entitlements && info.entitlements.active) || {};
      Object.keys(act).forEach(function (k) {
        var e = act[k];
        if (!e || e.isActive === false) return;
        var r = evalRecord({ entitlement: k, status: "active", period_ends_at: e.expirationDate || null }, now);
        if (r.plus && (!out.plus || r.until > out.until)) out = r;
      });
    } catch (e) {}
    return out;
  }
  function foldRc(best, uid) {
    return rcSetup(uid).then(function (info) {
      if (!info) return { best: best, owned: false };
      var r = rcGrant(info, Date.now());
      if (r.plus && (!best.plus || r.until > best.until)) return { best: { plus: true, until: r.until, source: "record" }, owned: true };
      return { best: best, owned: r.plus };
    });
  }
  function buy(productId) {
    var P = rc();
    if (!P) return Promise.reject(new Error("store-unavailable"));
    return P.getOfferings().then(function (off) {
      var cur = off && (off.current || off);
      var pkgs = (cur && cur.availablePackages) || [];
      var pkg = null;
      for (var i = 0; i < pkgs.length; i++) { var pr = pkgs[i].product || {}; if (pr.identifier === productId) { pkg = pkgs[i]; break; } }
      if (!pkg) throw new Error("product-missing");
      return P.purchasePackage({ aPackage: pkg });
    }).then(function () { return refresh(_lastFb, _rcUid, _lastAnchor); });
  }
  function restore() {
    var P = rc();
    if (!P) return Promise.reject(new Error("store-unavailable"));
    return P.restorePurchases().then(function () { return refresh(_lastFb, _rcUid, _lastAnchor); });
  }
  // The store's own localised price strings, when the plugin
  // can read them (the reader's currency, at the sitting).
  function storePrices() {
    var P = rc();
    if (!P || !rcKey()) return Promise.resolve(null);
    return rcSetup(_rcUid).then(function () { return P.getOfferings(); }).then(function (off) {
      var cur = off && (off.current || off);
      var pkgs = (cur && cur.availablePackages) || [];
      var out = {};
      pkgs.forEach(function (p) { var pr = p.product || {}; if (pr.identifier && pr.priceString) out[pr.identifier] = pr.priceString; });
      return Object.keys(out).length ? out : null;
    }).catch(function () { return null; });
  }

  function persist(uid) {
    try { localStorage.setItem("pace-ent-cache", JSON.stringify({ uid: uid || "", plus: _state.plus, source: _state.source, until: _state.until, owned: !!_state.owned })); } catch (e) {}
  }

  // §3's evaluation of one record. Dates arrive as ISO strings.
  function evalRecord(rec, now) {
    if (!rec) return { plus: false, until: 0 };
    if (rec.entitlement !== "plus" && rec.entitlement !== "lifetime") return { plus: false, until: 0 };
    if (rec.status !== "trialing" && rec.status !== "active") return { plus: false, until: 0 };
    var end = rec.period_ends_at || rec.expires_at || null;
    var endMs = end ? Date.parse(end) : Infinity;
    if (!(now < endMs)) return { plus: false, until: 0 };
    return { plus: true, until: endMs };
  }

  // refresh(fb, uid, spineCreatedAt) — call at every boot /
  // sign-in settle. fb is window.PaceFB (its fsGet reads the
  // record); uid null = guest (free month runs off the device's
  // first-run stamp; guests have no record to read).
  function refresh(fb, uid, spineCreatedAt) {
    var now = Date.now();
    _lastFb = fb || null; _lastAnchor = spineCreatedAt || null;
    var anchor = 0;
    if (uid) anchor = Date.parse(spineCreatedAt || "") || 0;
    else {
      try {
        anchor = Number(localStorage.getItem("pace-first-run") || 0);
        if (!anchor) { anchor = now; localStorage.setItem("pace-first-run", String(now)); }
      } catch (e) { anchor = now; }
    }
    var best = { plus: false, until: 0, source: "none" };
    if (anchor && now - anchor < MONTH) best = { plus: true, until: anchor + MONTH, source: "free-month" };
    _state = { known: !uid, plus: best.plus, source: best.source, until: best.until };
    function settle(b, recPlus) {
      return foldRc(b, uid).then(function (f) {
        // owned: a paid grant (record or RC) is live, whatever
        // grant's clock runs longest — the Plans copy keys off
        // this, never off which source won the arithmetic.
        _state = { known: true, plus: f.best.plus, source: f.best.source, until: f.best.until, owned: !!(recPlus || f.owned) };
        persist(uid);
        return _state;
      });
    }
    if (!uid || !fb || !fb.fsGet) { persist(uid); return settle(best, false); }
    return fb.fsGet("subscriptions/" + uid).then(function (rec) {
      var r = evalRecord(rec, Date.now());
      if (r.plus && (!best.plus || r.until > best.until)) best = { plus: true, until: r.until, source: "record" };
      return settle(best, r.plus);
    }).catch(function () { return settle(best, false); });
  }

  // The synchronous gate answer: entitled right now.
  function plusActive() { return !!(_state.plus && Date.now() < _state.until); }

  // The price words the Plans surface speaks today. When the
  // layer goes live these read from the store's own localised
  // prices for the user's storefront (never a desk conversion).
  function priceLine() { return "A$4.99 a month, or A$39.99 a year. First month free."; }

  window.PaceBilling = { live: billingLive, plusActive: plusActive, refresh: refresh, state: function () { return _state; }, priceLine: priceLine, products: PRODUCTS, entitlement: ENTITLEMENT, buy: buy, restore: restore, storePrices: storePrices };
})();
