import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Agency Acquisition Foundation (2026-08-31) — the copy-paste tracking
 * snippet an agency owner puts on their externally-hosted sales page
 * (GitPage today; works on literally any HTML page). Served dynamically
 * (not a static asset) so it can embed this deployment's own origin —
 * the owner never edits the file, they just paste one `<script src>` tag
 * (see `src/components/agency/sales-page-tracking-snippet.tsx`, which
 * renders the exact tag to copy).
 *
 * What it does, in order, on every page load:
 *   1. Reads/creates a long-lived anonymous `visitorId` (localStorage) and
 *      a short-lived anonymous `sessionId` (sessionStorage) — see the
 *      "Visitor/session identity" section of the final report for exactly
 *      what these do and don't measure. NOT fingerprinting: two random
 *      ids, no device/browser signal collected.
 *   2. Sends a beacon to /api/track/acquisition with this page's own UTM/
 *      referrer params (only what's actually in THIS page's URL — never
 *      backfilled from a stale cache, so the visit-counter breakdown by
 *      source stays honest).
 *   3. Remembers the MOST RECENTLY SEEN attribution params in localStorage
 *      (a rolling cache, separate from the server's immutable first-touch
 *      record) purely so step 4 has something to forward even on a page
 *      with no query string of its own.
 *   4. Decorates any outbound link pointing at this Magnetix deployment
 *      (e.g. a "Get started" button linking to /get-started/PLAN) with
 *      whatever attribution params are known — generically, with no
 *      custom code required on the button itself. Re-runs on DOM changes
 *      via a MutationObserver so dynamically-inserted buttons are covered
 *      too.
 *
 * No credentials, no secret key, nothing to steal — see the tracking
 * endpoint's own doc comment for why that's safe.
 */

function buildSnippet(appOrigin: string): string {
  return `/*! Magnetix acquisition tracking — do not edit, paste as-is */
(function () {
  "use strict";
  if (window.__mtxTrackLoaded) return;
  window.__mtxTrackLoaded = true;

  var APP_ORIGIN = ${JSON.stringify(appOrigin)};
  var ENDPOINT = APP_ORIGIN + "/api/track/acquisition";
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

  function safeStorage(kind) {
    // Private/incognito modes and some browser settings can throw on
    // storage access — every call here degrades to an in-memory stand-in
    // rather than breaking the page.
    try {
      var s = window[kind];
      var testKey = "__mtx_test__";
      s.setItem(testKey, "1");
      s.removeItem(testKey);
      return s;
    } catch (e) {
      var mem = {};
      return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = v; },
      };
    }
  }
  var localStore = safeStorage("localStorage");
  var sessionStore = safeStorage("sessionStorage");

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getOrCreate(store, key) {
    var v = store.getItem(key);
    if (!v) {
      v = uuid();
      store.setItem(key, v);
    }
    return v;
  }

  var visitorId = getOrCreate(localStore, "mtxVisitorId");
  var sessionId = getOrCreate(sessionStore, "mtxSessionId");

  function currentParams() {
    var out = {};
    try {
      var sp = new URLSearchParams(window.location.search);
      UTM_KEYS.forEach(function (k) {
        var v = sp.get(k);
        if (v) out[k] = v;
      });
      var ref = sp.get("ref");
      if (ref) out.ref = ref;
      var gclid = sp.get("gclid");
      if (gclid) out.gclid = gclid;
      var fbclid = sp.get("fbclid");
      if (fbclid) out.fbclid = fbclid;
    } catch (e) {}
    return out;
  }

  // Rolling "most recently seen" cache — link-decoration input only, NOT
  // the authoritative first-touch record (that's computed server-side,
  // once, and never overwritten — see attribution-first-touch.ts).
  function updateRollingCache(params) {
    if (Object.keys(params).length === 0) return;
    try {
      localStore.setItem("mtxAttribution", JSON.stringify(params));
    } catch (e) {}
  }

  function rollingCache() {
    try {
      var raw = localStore.getItem("mtxAttribution");
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function sendBeacon() {
    var params = currentParams();
    updateRollingCache(params);

    var body = {
      url: window.location.href,
      utm_source: params.utm_source || null,
      utm_medium: params.utm_medium || null,
      utm_campaign: params.utm_campaign || null,
      utm_content: params.utm_content || null,
      utm_term: params.utm_term || null,
      referrer: document.referrer || null,
      gclid: params.gclid || null,
      fbclid: params.fbclid || null,
      ref: params.ref || null,
      visitorId: visitorId,
      sessionId: sessionId,
    };

    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([JSON.stringify(body)], { type: "application/json" });
        navigator.sendBeacon(ENDPOINT, blob);
        return;
      }
    } catch (e) {}
    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  // ---- Outbound link decoration (generic — no per-button code needed) ----
  function decorateUrl(url) {
    try {
      var u = new URL(url, window.location.href);
      if (u.origin !== APP_ORIGIN) return url; // only decorate links back to Magnetix
      var cache = rollingCache();
      Object.keys(cache).forEach(function (k) {
        if (!u.searchParams.has(k)) u.searchParams.set(k, cache[k]);
      });
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  function decorateLinks(root) {
    var anchors = (root || document).querySelectorAll("a[href]");
    anchors.forEach(function (a) {
      if (a.getAttribute("data-mtx-decorated") === "1") return;
      var decorated = decorateUrl(a.getAttribute("href"));
      if (decorated !== a.getAttribute("href")) {
        a.setAttribute("href", decorated);
      }
      a.setAttribute("data-mtx-decorated", "1");
    });
  }

  window.MagnetixTrack = {
    decorateUrl: decorateUrl,
    getVisitorId: function () { return visitorId; },
    getSessionId: function () { return sessionId; },
  };

  function init() {
    sendBeacon();
    decorateLinks(document);
    try {
      var observer = new MutationObserver(function () {
        decorateLinks(document);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
`;
}

export async function GET() {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const js = buildSnippet(base);
  return new NextResponse(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
