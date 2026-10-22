/**
 * Reading Tools + Reading Result Pages — pure checks (no Firestore, no
 * network): the 24-hour Reading result pass (mint, verify, expiry, every
 * way an attacker might bend it), the Reading Tool rules (legacy docs keep
 * the Standard Result, custom-page normalization, combination rules), the
 * Featured Offer presentation (can never carry price or terms), the Offer
 * price/billing labels, the reading-tool.js navigate guard, and the
 * Reading Result Page starter layout.
 *
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/check-reading-result-pass.ts
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import * as pass from "../src/lib/server/reading-result-pass";
import * as personAuth from "../src/lib/server/person-auth";
import * as embeds from "../src/lib/energetic-decoder/embeds";
import * as priceLabel from "../src/lib/course-offers/price-label";
import * as settings from "../src/lib/energetic-decoder/reading-block-settings";
import * as template from "../src/lib/pages-funnels/puck/reading-result-template";
import * as resolve from "../src/lib/pages-funnels/puck/resolve";

// Every signer reads the secret at call time, so this is set before any use.
process.env.AUTOMATIONS_TOKEN_SECRET ||= "check-reading-result-pass-secret";

let passes = 0;
let failures = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    passes++;
    console.log(`PASS  ${label}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${label} — ${(err as Error).message}`);
  }
}

const b64url = (s: string) => Buffer.from(s, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const now = Date.now();
const token = pass.mintReadingResultPass({ readingId: "readingA", subAccountId: "saOne", pageId: "pageX" });

// ── Pass: happy path ───────────────────────────────────────────────────
check("mint → verify returns the same Reading, business and page", () => {
  const v = pass.verifyReadingResultPass(token);
  assert.ok(v);
  assert.equal(v.readingId, "readingA");
  assert.equal(v.subAccountId, "saOne");
  assert.equal(v.pageId, "pageX");
  assert.equal(v.test, false);
});
check("expires 24 hours after issue", () => {
  const v = pass.verifyReadingResultPass(token)!;
  assert.ok(Math.abs(v.expiresAt - (now + 24 * 60 * 60 * 1000)) < 5000);
});
check("still valid at 23h59m", () => {
  assert.ok(pass.verifyReadingResultPass(token, now + 24 * 60 * 60 * 1000 - 60_000));
});
check("expired pass is rejected", () => {
  assert.equal(pass.verifyReadingResultPass(token, now + 24 * 60 * 60 * 1000 + 60_000), null);
});
check("a pass minted from an old Reading's creation time is already expired", () => {
  const old = pass.mintReadingResultPass({ readingId: "r", subAccountId: "s", issuedAt: now - 25 * 60 * 60 * 1000 });
  assert.equal(pass.verifyReadingResultPass(old), null);
});
check("test flag round-trips (staff Test runs open the draft)", () => {
  const t = pass.mintReadingResultPass({ readingId: "r", subAccountId: "s", pageId: "p", test: true });
  assert.equal(pass.verifyReadingResultPass(t)?.test, true);
});

// ── Pass: binding ──────────────────────────────────────────────────────
check("grants only its own Reading", () => {
  const v = pass.verifyReadingResultPass(token);
  assert.equal(pass.passGrants(v, { readingId: "readingA", subAccountId: "saOne" }), true);
  assert.equal(pass.passGrants(v, { readingId: "readingB", subAccountId: "saOne" }), false);
});
check("grants only its own business", () => {
  const v = pass.verifyReadingResultPass(token);
  assert.equal(pass.passGrants(v, { readingId: "readingA", subAccountId: "saTwo" }), false);
  assert.equal(pass.passGrants(v, { subAccountId: "saTwo" }), false);
});
check("grants only its own Result Page", () => {
  const v = pass.verifyReadingResultPass(token);
  assert.equal(pass.passGrants(v, { subAccountId: "saOne", pageId: "pageX" }), true);
  assert.equal(pass.passGrants(v, { subAccountId: "saOne", pageId: "pageY" }), false);
});
check("a pass without a page never opens a Result Page", () => {
  const noPage = pass.verifyReadingResultPass(pass.mintReadingResultPass({ readingId: "readingA", subAccountId: "saOne" }));
  assert.equal(pass.passGrants(noPage, { subAccountId: "saOne", pageId: "pageX" }), false);
});
check("passGrants(null) is always false", () => {
  assert.equal(pass.passGrants(null, { subAccountId: "saOne" }), false);
});

// ── Pass: forgery and tampering ────────────────────────────────────────
check("swapping the Reading id in the payload breaks the signature", () => {
  const [body, sig] = token.split(".");
  const payload = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  payload.r = "readingB";
  assert.equal(pass.verifyReadingResultPass(`${b64url(JSON.stringify(payload))}.${sig}`), null);
});
check("extending the expiry breaks the signature", () => {
  const [body, sig] = token.split(".");
  const payload = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  payload.exp += 365 * 24 * 60 * 60 * 1000;
  assert.equal(pass.verifyReadingResultPass(`${b64url(JSON.stringify(payload))}.${sig}`), null);
});
check("a pass signed with another secret is rejected", () => {
  const body = b64url(JSON.stringify({ r: "readingA", sa: "saOne", p: "pageX", t: 0, exp: now + 1000000, v: 1 }));
  const sig = createHmac("sha256", "not-the-secret").update(`rrp1:${body}`).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(pass.verifyReadingResultPass(`${body}.${sig}`), null);
});
check("a token signed without the rrp1 domain is rejected", () => {
  const body = b64url(JSON.stringify({ r: "readingA", sa: "saOne", p: "pageX", t: 0, exp: now + 1000000, v: 1 }));
  const sig = createHmac("sha256", process.env.AUTOMATIONS_TOKEN_SECRET!).update(body).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(pass.verifyReadingResultPass(`${body}.${sig}`), null);
});
check("garbage, empty and oversized tokens are rejected", () => {
  for (const t of ["", "abc", ".", "a.b", `${"x".repeat(2000)}.y`, null, undefined]) assert.equal(pass.verifyReadingResultPass(t as string), null);
});
check("a bare Reading id is not a pass", () => {
  assert.equal(pass.verifyReadingResultPass("readingA"), null);
});
check("ids that aren't plain document ids can't be minted", () => {
  assert.throws(() => pass.mintReadingResultPass({ readingId: "../etc", subAccountId: "saOne" }));
  assert.throws(() => pass.mintReadingResultPass({ readingId: "r", subAccountId: "s", pageId: "a/b" }));
});

// ── Pass is never an identity ──────────────────────────────────────────
check("a result pass is NOT accepted as a MyMagnetix session", () => {
  assert.equal(personAuth.verifyPersonSessionToken(token), null);
});
check("a result pass is NOT accepted as a MyMagnetix magic link", () => {
  assert.equal(personAuth.verifyPersonMagicLinkToken(token), null);
});
check("a MyMagnetix session token is NOT accepted as a result pass", () => {
  const ses = personAuth.signPersonSessionToken("person1", "a@b.co");
  assert.equal(pass.verifyReadingResultPass(ses), null);
});

// ── Cookies ────────────────────────────────────────────────────────────
check("cookie names are per Reading / per page", () => {
  assert.equal(pass.readingPassCookieName("abc"), "mx_rr_abc");
  assert.equal(pass.resultPagePassCookieName("p1"), "mx_rp_p1");
});
check("cookie lifetime never outlives the pass", () => {
  const v = pass.verifyReadingResultPass(token)!;
  const age = pass.passCookieMaxAge(v);
  assert.ok(age > 0 && age <= 24 * 60 * 60);
  assert.equal(pass.passCookieMaxAge(v, v.expiresAt + 1000), 0);
});

// ── Reading Tool rules ─────────────────────────────────────────────────
check("a Reading Tool saved before 2026-10-21 keeps the Standard Result", () => {
  const legacy = embeds.normalizeEmbedConfig("e1", { subAccountId: "s", status: "live", afterSubmit: { show: "full", pdf: true } });
  assert.deepEqual(legacy.afterSubmit.destination, { kind: "standard" });
  assert.equal(legacy.afterSubmit.show, "full");
});
check("custom Result Page destination normalizes; junk falls back to standard", () => {
  const ok = embeds.normalizeEmbedConfig("e1", { afterSubmit: { destination: { kind: "customPage", pageId: "page_1" } } });
  assert.deepEqual(ok.afterSubmit.destination, { kind: "customPage", pageId: "page_1" });
  const bad = embeds.normalizeEmbedConfig("e1", { afterSubmit: { destination: { kind: "customPage", pageId: "../x" } } });
  assert.deepEqual(bad.afterSubmit.destination, { kind: "standard" });
  const empty = embeds.normalizeEmbedConfig("e1", { afterSubmit: { destination: { kind: "customPage" } } });
  assert.deepEqual(empty.afterSubmit.destination, { kind: "standard" });
});
check("Standard Result display rules don't block a custom Result Page", () => {
  const s = embeds.defaultEmbedSettings();
  s.reading.views = [];
  assert.ok(embeds.embedCombinationError(s));
  s.afterSubmit.destination = { kind: "customPage", pageId: "p" };
  assert.equal(embeds.embedCombinationError(s), null);
});
check("Confirmation only still needs MyMagnetix or email", () => {
  const s = embeds.defaultEmbedSettings();
  s.afterSubmit.show = "confirmation";
  s.afterSubmit.myMagnetix = false;
  s.afterSubmit.email = false;
  assert.ok(embeds.embedCombinationError(s));
});
check("MyMagnetix is no longer offered as a next-step button (it has its own)", () => {
  assert.equal(embeds.nextStepHref("s", { kind: "myMagnetix", label: "x" }), null);
});
check("public projection never carries a Featured Offer by itself", () => {
  const e = embeds.normalizeEmbedConfig("e1", { subAccountId: "s", afterSubmit: { nextStep: { kind: "featuredOffer", offerId: "o1" } } });
  const pub = embeds.toPublicEmbed(e);
  assert.equal(pub.afterSubmit.featuredOffer, null);
  assert.equal(pub.afterSubmit.destination, "standard");
});

// ── Featured Offer presentation ────────────────────────────────────────
check("Featured Offer presentation can't carry price, terms or grants", () => {
  const p = embeds.normalizeFeaturedOfferPresentation({ headline: "Go deeper", priceLabel: "$1", priceCents: 1, grants: ["Everything"], billingNote: "free forever", ctaLabel: "Join", layout: "banner" });
  assert.deepEqual(Object.keys(p).sort(), ["badge", "body", "ctaLabel", "headline", "imageUrl", "layout"]);
  assert.equal(p.layout, "banner");
});
check("Featured Offer image must be an http(s) URL", () => {
  assert.equal(embeds.normalizeFeaturedOfferPresentation({ imageUrl: "javascript:alert(1)" }).imageUrl, "");
  assert.equal(embeds.normalizeFeaturedOfferPresentation({ imageUrl: "https://x.co/a.png" }).imageUrl, "https://x.co/a.png");
});
check("unknown Featured Offer layout falls back to card", () => {
  assert.equal(embeds.normalizeFeaturedOfferPresentation({ layout: "carousel" }).layout, "card");
});
check("a Featured Offer next step needs an Offer", () => {
  assert.deepEqual(embeds.normalizeEmbedConfig("e", { afterSubmit: { nextStep: { kind: "featuredOffer" } } }).afterSubmit.nextStep, { kind: "none" });
});

// ── Offer price labels (identical to checkout) ─────────────────────────
check("price labels: free, one-time, recurring, override", () => {
  assert.equal(priceLabel.offerPriceLabel({ type: "free", priceCents: null, currency: null, recurringInterval: null, priceTextOverride: null }), "Free");
  assert.equal(priceLabel.offerPriceLabel({ type: "oneTime", priceCents: 9700, currency: "USD", recurringInterval: null, priceTextOverride: null }), "$97");
  assert.equal(priceLabel.offerPriceLabel({ type: "recurring", priceCents: 2900, currency: "USD", recurringInterval: "month", priceTextOverride: null }), "$29 / month");
  assert.equal(priceLabel.offerPriceLabel({ type: "oneTime", priceCents: 9700, currency: "USD", recurringInterval: null, priceTextOverride: "Founding price" }), "Founding price");
});
check("billing note: renewal + trial for recurring only", () => {
  assert.equal(priceLabel.offerBillingNote({ type: "recurring", recurringInterval: "month", trialDays: 7 }), "Renews every month · 7-day free trial");
  assert.equal(priceLabel.offerBillingNote({ type: "oneTime", recurringInterval: null, trialDays: null }), null);
});

// ── Block settings ─────────────────────────────────────────────────────
check("parseList keeps canonical order and drops unknown values", () => {
  assert.deepEqual(settings.parseList("profile,bogus,type", settings.AT_A_GLANCE_FACTS, []), ["type", "profile"]);
  assert.deepEqual(settings.parseList(undefined, settings.SKILL_LAYERS, settings.SKILL_LAYERS), settings.SKILL_LAYERS);
});

// ── Starter layout + collectors ────────────────────────────────────────
check("starter Reading Result Page has the MyMagnetix button and Human Design sections", () => {
  const data = template.buildReadingResultStarterData();
  const types: string[] = [];
  const walk = (n: { type: string; props: Record<string, unknown> }) => {
    types.push(n.type);
    for (const v of Object.values(n.props)) if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && "type" in c && walk(c));
  };
  data.content.forEach((n) => walk(n as never));
  for (const t of ["MyMagnetixButton", "HumanDesignChart", "AtAGlance", "Centers", "Channels", "Gates", "Variables", "Skills", "PdfButton"]) {
    assert.ok(types.includes(t), `missing ${t}`);
  }
  // No undefined values (Firestore rejects them on create).
  assert.ok(!JSON.stringify(data, (_k, v) => (v === undefined ? "__UNDEF__" : v)).includes("__UNDEF__"));
});
check("Featured Offer ids are collected from nested columns", () => {
  const data = {
    root: { props: {} },
    content: [
      { type: "Section", props: { id: "s", rows: [{ type: "Row", props: { id: "r", columns: [{ type: "Column", props: { id: "c", elements: [{ type: "FeaturedOffer", props: { id: "f", offerId: "o9" } }] } }] } }] } },
    ],
  };
  assert.deepEqual(resolve.collectPuckFeaturedOfferIds(data as never), ["o9"]);
});

// ── reading-tool.js navigate guard ─────────────────────────────────────
check("install script only follows Magnetix's own result handoff", () => {
  const src = readFileSync("public/reading-tool.js", "utf-8");
  assert.ok(src.includes("magnetix:reading-tool:navigate"));
  assert.ok(src.includes("event.source !== frame.contentWindow"));
  const re = /\^\\\/api\\\/decoder\\\/\[A-Za-z0-9_-\]\+\\\/result\$/;
  assert.ok(re.test(src), "path guard present");
});

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
