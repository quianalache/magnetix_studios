/**
 * Wave 2B-2 — Booking block. Deterministic checks.
 *
 * Offline (always): the stored model (lenient normalize + strict save
 * check), source collection, registry / placement / Popup + AI allowlists,
 * and the block's markup in every context (builder empty state, missing and
 * draft sources, embedded flow, display toggles, card, Button only, visitors
 * never seeing an unconnected/missing block, independent multiple blocks).
 *
 * Tenancy (when the Firestore + Auth emulators are configured): the REAL
 * `resolve-booking` route handler and the REAL server resolver the public
 * page uses — same workspace resolves, foreign / missing / malformed slugs
 * resolve like nothing, drafts never reach visitors, no internal booking
 * settings leak into the payload.
 *
 * Run:
 *   pnpm check:booking
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   GCLOUD_PROJECT=demo-booking-block pnpm check:booking
 */
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BOOKING_BUTTON_LABEL_MAX,
  DEFAULT_BOOKING_BLOCK,
  bookingBlockProblem,
  collectBookingSlugs,
  findBookingProblem,
  isBookingSlug,
  normalizeBookingBlock,
} from "../src/lib/pages-funnels/booking-block";
import { autoWrapRootNode } from "../src/lib/pages-funnels/puck/auto-hierarchy";
import { POPUP_ALLOWED_BLOCKS } from "../src/lib/pages-funnels/popup-content";
import { assertSafePuck } from "../src/lib/pages-funnels/ai/page-plan";
import { clientPuckConfig } from "../src/components/pages-funnels/puck/client-config";
import { BLOCK_ICONS } from "../src/components/pages-funnels/puck/block-icons";
import { BookingBlockView, BOOKING_DISABLED_IN_BUILDER, type BookingRenderContext } from "../src/components/pages-funnels/puck/booking-block";
import type { BookingBlockPayload } from "../src/lib/booking/public-payload";

let passed = 0;
const check = async (label: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${label}`);
    throw err;
  }
};

const payload = (over: Partial<BookingBlockPayload> = {}): BookingBlockPayload => ({
  subAccountId: "sa_a",
  status: "published",
  page: {
    slug: "discovery-call",
    name: "Discovery Call",
    description: "A short call to plan your next step.",
    timezone: "America/New_York",
    durationMinutes: 30,
    payment: null,
    visibleDays: 14,
    intakeFields: [],
  },
  branding: { name: "QA Studio", logoUrl: null, accentColor: "#0A7E8C", displayFont: null },
  href: "https://crm.example.com/b/sa_a/discovery-call",
  ...over,
});
const view = (props: Record<string, unknown>, context: BookingRenderContext, p: BookingBlockPayload | null | "loading" = payload()) =>
  renderToStaticMarkup(
    h(BookingBlockView, {
      id: "Booking-1",
      props: { ...DEFAULT_BOOKING_BLOCK, bookingPageSlug: "discovery-call", ...props },
      context,
      resolution: p === "loading" ? { status: "loading" } : { status: "done", payload: p },
    }),
  );

async function offline() {
  // ---- model ----
  await check("defaults: not connected, embedded, everything shown, in a card", () => {
    assert.deepEqual(normalizeBookingBlock({}), DEFAULT_BOOKING_BLOCK);
    assert.equal(DEFAULT_BOOKING_BLOCK.bookingPageSlug, "");
    assert.equal(DEFAULT_BOOKING_BLOCK.displayMode, "embed");
  });
  await check("lenient render: malformed values fall back to defaults (no crash)", () => {
    const n = normalizeBookingBlock({ bookingPageSlug: "../x", displayMode: "calendar_only", display: "yes", button: { label: 7, style: "neon", align: "up" } });
    assert.deepEqual(n, DEFAULT_BOOKING_BLOCK);
    assert.deepEqual(normalizeBookingBlock(null), DEFAULT_BOOKING_BLOCK);
    assert.deepEqual(normalizeBookingBlock([1, 2]), DEFAULT_BOOKING_BLOCK);
  });
  await check("button label trimmed + capped; empty label falls back", () => {
    assert.equal(normalizeBookingBlock({ button: { label: "  Book  " } }).button.label, "Book");
    assert.equal(normalizeBookingBlock({ button: { label: "x".repeat(80) } }).button.label.length, BOOKING_BUTTON_LABEL_MAX);
    assert.equal(normalizeBookingBlock({ button: { label: "   " } }).button.label, "Book a time");
  });
  await check("slug rule matches the booking engine's (lowercase kebab, 1–48)", () => {
    for (const ok of ["a", "discovery-call", "call-30", "x".repeat(48)]) assert.ok(isBookingSlug(ok), ok);
    for (const bad of ["", "-a", "a-", "A", "a_b", "a/b", "../x", "x".repeat(49), 5, null]) assert.ok(!isBookingSlug(bad), String(bad));
  });
  await check("strict save check: valid and partial props pass", () => {
    assert.equal(bookingBlockProblem({ id: "b", ...DEFAULT_BOOKING_BLOCK, bookingPageSlug: "discovery-call" }), null);
    assert.equal(bookingBlockProblem({ id: "b" }), null);
    assert.equal(bookingBlockProblem({ bookingPageSlug: "" }), null);
  });
  await check("strict save check: every malformed field is refused with a plain reason", () => {
    assert.match(bookingBlockProblem({ bookingPageSlug: "Other_Workspace/x" })!, /booking page/);
    assert.match(bookingBlockProblem({ displayMode: "calendar_only" })!, /display mode/);
    assert.match(bookingBlockProblem({ display: [] })!, /display settings/);
    assert.match(bookingBlockProblem({ display: { showTitle: "no" } })!, /display setting/);
    assert.match(bookingBlockProblem({ button: "x" })!, /button settings/);
    assert.match(bookingBlockProblem({ button: { label: "x".repeat(41) } })!, /at most 40/);
    assert.match(bookingBlockProblem({ button: { style: "neon" } })!, /button style/);
    assert.match(bookingBlockProblem({ button: { align: "up" } })!, /alignment/);
    assert.match(bookingBlockProblem("x")!, /couldn't be read/);
  });
  const nested = (slugs: unknown[], extra: Record<string, unknown> = {}) => ({
    root: { props: {} },
    content: [{ type: "Section", props: { id: "s", rows: [{ type: "Row", props: { id: "r", columns: [{ type: "Column", props: { id: "c", elements: slugs.map((slug, i) => ({ type: "Booking", props: { id: `b${i}`, bookingPageSlug: slug, ...extra } })) } }] } }] } }],
  });
  await check("findBookingProblem walks nested slots; collectBookingSlugs de-duplicates and drops malformed", () => {
    assert.equal(findBookingProblem(nested(["a", "b"])), null);
    assert.match(findBookingProblem(nested(["a", "../x"]))!, /booking page/);
    assert.deepEqual(collectBookingSlugs(nested(["a", "b", "a", "../x", ""])), ["a", "b"]);
    assert.deepEqual(collectBookingSlugs({ content: [], zones: { z: [{ type: "Booking", props: { bookingPageSlug: "z" } }] } }), ["z"]);
    assert.deepEqual(collectBookingSlugs(null), []);
  });

  // ---- registry / placement / allowlists ----
  await check("registry: Booking is a Business block with an icon, placeable in Columns", () => {
    const cfg = clientPuckConfig as unknown as { components: Record<string, { label?: string; defaultProps?: Record<string, unknown> }>; categories: Record<string, { components?: string[] }> };
    assert.equal(cfg.components.Booking?.label, "Booking");
    assert.ok(cfg.categories.business.components?.includes("Booking"));
    assert.ok(BLOCK_ICONS.Booking);
    const columnAllow = (cfg.components.Column as unknown as { fields: { elements: { allow: string[] } } }).fields.elements.allow;
    assert.ok(columnAllow.includes("Booking"));
    assert.deepEqual({ ...cfg.components.Booking.defaultProps, style: undefined }, { ...DEFAULT_BOOKING_BLOCK, style: undefined });
  });
  await check("placement: a Booking dropped at page level is wrapped in Section → Row → Column", () => {
    const wrapped = autoWrapRootNode({ type: "Booking", props: { id: "b" } } as never) as { type: string };
    assert.equal(wrapped.type, "Section");
  });
  await check("not allowed in Popups; AI page generation rejects it", () => {
    assert.ok(!POPUP_ALLOWED_BLOCKS.has("Booking"));
    assert.throws(() => assertSafePuck({ root: { props: {} }, content: [{ type: "Booking", props: { id: "b", bookingPageSlug: "a" } }] }));
  });
  await check("settings: only the group for the chosen layout is shown", async () => {
    const booking = (clientPuckConfig as unknown as { components: { Booking: { fields: Record<string, unknown>; resolveFields: (d: unknown, p: unknown) => Record<string, unknown> } } }).components.Booking;
    const embed = await booking.resolveFields({ props: { displayMode: "embed" } }, { fields: booking.fields });
    const button = await booking.resolveFields({ props: { displayMode: "button" } }, { fields: booking.fields });
    assert.ok("display" in embed && !("button" in embed));
    assert.ok("button" in button && !("display" in button));
    for (const f of [embed, button]) for (const k of ["bookingPageSlug", "displayMode", "style"]) assert.ok(k in f, k);
  });

  // ---- rendering in every context ----
  await check("builder, not connected: editor-only 'Connect a Booking Page' state", () => {
    const html = view({ bookingPageSlug: "" }, "builder", null);
    assert.match(html, /Connect a Booking Page/);
    assert.match(html, /data-booking-state="unset"/);
  });
  await check("visitors never see an unconnected / missing / draft / unresolved block", () => {
    assert.equal(view({ bookingPageSlug: "" }, "published", null), "");
    assert.equal(view({}, "published", null), "");
    assert.equal(view({}, "published", payload({ status: "draft" })), "");
    assert.equal(view({}, "published", "loading"), "");
  });
  await check("builder + Preview, deleted / foreign source: repairable warning, stored slug untouched", () => {
    for (const ctx of ["builder", "preview"] as const) {
      const html = view({}, ctx, null);
      assert.match(html, /deleted or isn(&#x27;|')t in this workspace/);
      assert.ok(!html.includes("data-booking-experience"));
    }
  });
  await check("builder: draft Booking Page shows the experience with a draft notice", () => {
    const html = view({}, "builder", payload({ status: "draft" }));
    assert.match(html, /data-booking-state="draft"/);
    assert.match(html, /data-booking-experience/);
  });
  await check("embedded flow: the booking engine's own experience (tenant surface, real calendar sections)", () => {
    const html = view({}, "published");
    assert.match(html, /data-booking-experience/);
    assert.match(html, /tenant-surface/);
    assert.match(html, /aria-label="Choose a day"/);
    assert.match(html, /aria-label="Choose a time"/);
    assert.match(html, /Discovery Call/);
    assert.match(html, /<h2[^>]*>Discovery Call<\/h2>/, "embedded heading is an h2, not a second h1");
    assert.match(html, /30 minutes/);
    assert.match(html, /A short call to plan/);
    assert.match(html, /tenant-card/);
    assert.match(html, /@container\/booking/);
  });
  await check("display toggles hide only what they say (timezone picker always stays)", () => {
    const html = view({ display: { showTitle: false, showDescription: false, showDetails: false, card: false } }, "published");
    assert.ok(!html.includes("Discovery Call"));
    assert.ok(!html.includes("A short call to plan"));
    assert.ok(!html.includes("30 minutes"));
    assert.ok(!/class="[^"]*tenant-card/.test(html));
    assert.match(html, /Times shown in/);
  });
  await check("Button only: links to the Booking Page's public URL (canonical booking destination)", () => {
    const html = view({ displayMode: "button", button: { label: "Book now", style: "outline", align: "center" } }, "published");
    assert.match(html, /<a[^>]+href="https:\/\/crm.example.com\/b\/sa_a\/discovery-call"/);
    assert.match(html, /Book now/);
    assert.ok(!html.includes("data-booking-experience"));
  });
  await check("Button only in the builder: no link (editing can't navigate away)", () => {
    const html = view({ displayMode: "button" }, "builder");
    assert.ok(!/href=/.test(html));
    assert.match(html, /Book a time/);
  });
  await check("builder disables booking with a plain explanation (constant wired)", () => {
    assert.match(BOOKING_DISABLED_IN_BUILDER, /can't be made in the editor/);
  });
  await check("multiple blocks: independent markup and unique control ids", () => {
    const one = view({}, "published");
    const html = renderToStaticMarkup(
      h("div", null,
        h(BookingBlockView, { id: "Booking-a", props: { ...DEFAULT_BOOKING_BLOCK, bookingPageSlug: "discovery-call" }, context: "published", resolution: { status: "done", payload: payload() } }),
        h(BookingBlockView, { id: "Booking-b", props: { ...DEFAULT_BOOKING_BLOCK, bookingPageSlug: "strategy" }, context: "published", resolution: { status: "done", payload: payload({ page: { ...payload().page, slug: "strategy", name: "Strategy Session" } }) } }),
      ),
    );
    assert.match(html, /Discovery Call/);
    assert.match(html, /Strategy Session/);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(",")}`);
    assert.ok(one.length > 0);
  });
}

async function tenancy() {
  const { initializeApp, getApps } = await import("firebase-admin/app");
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin");
  const { GET: resolveBookingRoute } = await import("../src/app/api/pages-funnels/puck/resolve-booking/route");
  const { resolveBookingsForSubAccount } = await import("../src/lib/server/page-booking-resolver");
  const db = getAdminDb();
  const auth = getAdminAuth();
  const run = `t${Date.now()}`;
  const A = { agency: `ag_a_${run}`, sa: `sa_a_${run}`, uid: `u_a_${run}`, page: `pg_a_${run}` };
  const B = { agency: `ag_b_${run}`, sa: `sa_b_${run}`, uid: `u_b_${run}`, page: `pg_b_${run}` };
  const bookingDoc = (sa: string, slug: string, status: "published" | "draft", over: Record<string, unknown> = {}) =>
    db.doc(`subAccounts/${sa}/bookingPages/${slug}`).set({
      subAccountId: sa, slug, name: `${slug} of ${sa}`, description: "desc", status, durationMinutes: 30, bufferMinutes: 0,
      workingHours: [], timezone: "UTC", visibleDays: 14, minNoticeHours: 2, maxPerDay: null, intakeFields: [],
      hosts: [{ uid: "secret-host", name: "Host" }], meetingUrl: "https://meet.example.com/secret", logoUrl: null, accentColor: null, ...over,
    });
  try {
    for (const t of [A, B]) {
      await auth.createUser({ uid: t.uid, email: `${t.uid}@example.com` });
      await auth.setCustomUserClaims(t.uid, { role: "user", status: "active", agencyId: t.agency, agencyRole: null });
      await db.doc(`subAccounts/${t.sa}`).set({ agencyId: t.agency, name: t.sa });
      await db.doc(`subAccounts/${t.sa}/subAccountMembers/${t.uid}`).set({ uid: t.uid, role: "admin", status: "active" });
      await db.doc(`pages/${t.page}`).set({ subAccountId: t.sa, agencyId: t.agency, name: "QA", status: "draft" });
    }
    await bookingDoc(A.sa, "call-a", "published");
    await bookingDoc(A.sa, "draft-a", "draft");
    await bookingDoc(B.sa, "call-b", "published");
    // A doc under A's path but stamped with B's workspace never resolves (defense in depth).
    await bookingDoc(A.sa, "stamped-b", "published", { subAccountId: B.sa });

    const call = async (query: string, uid?: string) => {
      const res = await resolveBookingRoute(new Request(`http://localhost/api/pages-funnels/puck/resolve-booking?${query}`, { headers: uid ? { "x-user-uid": uid } : {} }));
      return { status: res.status, body: await res.text() };
    };
    const q = (pageId: string, slugs: string[]) => `pageId=${encodeURIComponent(pageId)}&slugs=${encodeURIComponent(slugs.join(","))}`;

    await check("route: A member, Page A → A's Booking Page resolves (drafts flagged)", async () => {
      const r = await call(q(A.page, ["call-a", "draft-a"]), A.uid);
      assert.equal(r.status, 200);
      const b = JSON.parse(r.body).bookings;
      assert.equal(b["call-a"].status, "published");
      assert.equal(b["call-a"].subAccountId, A.sa);
      assert.equal(b["draft-a"].status, "draft");
    });
    await check("route: B's slug named on Page A resolves like a missing one (no leak)", async () => {
      const r = await call(q(A.page, ["call-b", `never-${run}`]), A.uid);
      const b = JSON.parse(r.body).bookings;
      assert.equal(b["call-b"], null);
      assert.equal(b[`never-${run}`], null);
      assert.ok(!r.body.includes(B.sa) && !r.body.includes("of sa_b"));
    });
    await check("route: workspace comes from the page, never the caller", async () => {
      assert.equal((await call(q(B.page, ["call-b"]), A.uid)).status, 404, "A member naming Page B");
      assert.equal((await call(q(A.page, ["call-a"]))).status, 404, "unauthenticated");
      assert.equal((await call(`slugs=call-a`, A.uid)).status, 404, "no pageId");
      assert.equal((await call(q(A.page, ["../x", "A_B"]), A.uid)).status, 404, "only malformed slugs");
    });
    await check("payload carries only visitor-safe Booking Page fields", async () => {
      const r = await call(q(A.page, ["call-a"]), A.uid);
      assert.ok(!r.body.includes("secret-host") && !r.body.includes("meet.example.com"));
      const p = JSON.parse(r.body).bookings["call-a"];
      assert.deepEqual(Object.keys(p.page).sort(), ["description", "durationMinutes", "intakeFields", "name", "payment", "slug", "timezone", "visibleDays"]);
      assert.match(p.href, new RegExp(`/b/${A.sa}/call-a$`));
    });
    await check("public resolver: published only, own workspace only", async () => {
      const res = await resolveBookingsForSubAccount(A.sa, ["call-a", "draft-a", "call-b", "stamped-b", "../x"]);
      assert.equal(res["call-a"]?.status, "published");
      assert.equal(res["draft-a"], null, "draft never reaches visitors");
      assert.equal(res["call-b"], null, "foreign slug never resolves");
      assert.equal(res["stamped-b"], null, "doc stamped with another workspace never resolves");
      assert.equal(res["../x"], null);
      assert.deepEqual(await resolveBookingsForSubAccount(null, ["call-a"]), { "call-a": null });
    });
    await check("deleted Booking Page resolves to nothing (block repairable in builder, inert publicly)", async () => {
      await db.doc(`subAccounts/${A.sa}/bookingPages/call-a`).delete();
      assert.equal((await resolveBookingsForSubAccount(A.sa, ["call-a"]))["call-a"], null);
      assert.equal(JSON.parse((await call(q(A.page, ["call-a"]), A.uid)).body).bookings["call-a"], null);
    });
  } finally {
    for (const t of [A, B]) {
      await auth.deleteUser(t.uid).catch(() => {});
      await db.recursiveDelete(db.doc(`subAccounts/${t.sa}`)).catch(() => {});
      await db.doc(`pages/${t.page}`).delete().catch(() => {});
    }
  }
}

async function main() {
  await offline();
  const emulator = process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.GCLOUD_PROJECT?.startsWith("demo-");
  if (emulator) await tenancy();
  console.log(`Booking block checks: ${passed} passed${emulator ? " (incl. emulator tenancy)" : " (offline; set the emulator env for tenancy)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
