/**
 * Saved page templates (2026-10-12) — server checks. EMULATOR ONLY
 * (Firestore + Auth, `demo-*` project, no production credentials). Calls
 * the real routes through the consolidated Energetic Decoder dispatcher.
 *
 * Proves: save stores a page snapshot (no page id, tokens and Chart Design
 * references kept, render-only fields dropped, Page Center + visibility
 * kept) with system / page type / Other validation; the list is the
 * caller's own templates in this workspace only, newest first; another
 * member, another workspace and a non-member see nothing and can't rename
 * or delete; rename changes only the name; delete removes only the
 * template (report designs holding pages inserted from it are untouched);
 * expiring image links are swapped for the library image's public copy or
 * dropped, never stored; no Firestore rule exposes the collection.
 *
 * Run:
 *   mkdir -p /tmp/emu && echo '{"firestore":{"rules":"<repo>/firestore.rules"},
 *     "emulators":{"auth":{"port":9099},"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore,auth \
 *     --project demo-page-templates \
 *     "NODE_OPTIONS='--require ./scripts/_chart-design-check-shim.cjs' pnpm exec tsx scripts/check-report-page-templates-service.ts"
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { viaDispatcher } from "./_via-dispatcher";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-page-templates";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: needs Firestore + Auth emulators, a demo-* project and no production credentials.");
  process.exit(2);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ||= PROJECT;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= PROJECT;
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();

const AG = "ag1";
const SA1 = "saOne";
const SA2 = "saTwo";
let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}
function req(uid: string, method = "GET", body?: unknown) {
  return new Request("http://test.local/x", { method, headers: { "x-user-uid": uid, "x-user-email": `${uid}@example.test`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SIGNED = "https://storage.googleapis.com/bucket/media-library/saOne/a1/me.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=1800&X-Goog-Signature=abc";
const PUBLIC = "https://firebasestorage.googleapis.com/v0/b/bucket/o/media-public%2FsaOne%2Fa1%2Fx.jpg?alt=media&token=t1";

type SampleElement = { id: string; type: string; zIndex: number; geometry: { x: number; y: number; width: number; height: number; rotation: number }; style: Record<string, unknown>; payload: Record<string, unknown> };
function samplePage(): { id: string; title: string; visibleIf: Record<string, string>; centerKey: string; blocks: unknown[]; elements: SampleElement[] } {
  return {
    id: "page-src",
    title: "Client Welcome",
    visibleIf: { attribute: "definedCenters", operator: "contains", value: "sacral" },
    centerKey: "sacral",
    blocks: [],
    elements: [
      { id: "e1", type: "text", zIndex: 0, geometry: { x: 10, y: 20, width: 300, height: 60, rotation: 0 }, style: { fontSize: 20, color: "#123456" }, payload: { text: "Welcome, {{first_name}}" } },
      { id: "e2", type: "shortcode", zIndex: 1, geometry: { x: 10, y: 90, width: 300, height: 60, rotation: 0 }, style: {}, payload: { token: "type_description", resolvedText: "FROZEN VALUE" } },
      { id: "e3", type: "chart", zIndex: 2, geometry: { x: 10, y: 160, width: 300, height: 300, rotation: 0 }, style: {}, payload: { piece: "human-design-bodygraph", chartDesignSetId: "set-violet", chartDesigns: { humanDesign: { chartDefinedColor: "#ff0000" } } } },
      { id: "e4", type: "image", zIndex: 3, geometry: { x: 400, y: 20, width: 200, height: 200, rotation: 0 }, style: { borderRadius: 100 }, payload: { url: PUBLIC, assetId: "a1", alt: "Me", fit: "cover" } },
      { id: "e5", type: "shape", zIndex: 4, geometry: { x: 0, y: 0, width: 816, height: 1056, rotation: 0 }, style: { backgroundColor: "#0f1115" }, payload: { shape: "rectangle" } },
    ],
  };
}

async function main() {
  const ed = await import("../src/app/api/sub-accounts/[id]/energetic-decoder/[[...path]]/route");
  const listRoute = viaDispatcher(ed, "report-page-templates");
  const oneRoute = viaDispatcher(ed, "report-page-templates/[templateId]");
  const p = (id: string, extra: Record<string, string> = {}) => ({ params: Promise.resolve({ id, ...extra }) });
  const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });
  const save = (uid: string, sa: string, body: Record<string, unknown>) => listRoute.POST(req(uid, "POST", body), p(sa)).then(json);
  const list = (uid: string, sa: string) => listRoute.GET(req(uid), p(sa)).then(json);

  for (const uid of ["u1", "u2", "outsider"]) {
    await auth.createUser({ uid, email: `${uid}@example.test` }).catch(() => undefined);
    await auth.setCustomUserClaims(uid, { status: "active", agencyId: AG, agencyRole: null });
  }
  for (const sa of [SA1, SA2]) await db.doc(`subAccounts/${sa}`).set({ agencyId: AG, name: sa, status: "active" });
  await db.doc(`subAccounts/${SA1}/subAccountMembers/u1`).set({ status: "active", role: "admin" });
  await db.doc(`subAccounts/${SA2}/subAccountMembers/u1`).set({ status: "active", role: "admin" });
  await db.doc(`subAccounts/${SA1}/subAccountMembers/u2`).set({ status: "active", role: "collaborator" });
  await db.doc(`subAccounts/${SA2}/subAccountMembers/outsider`).set({ status: "active", role: "admin" });
  // Media Library: a1 (this workspace) has a public copy; a2 (this workspace) is private; a3 belongs to SA2.
  await db.doc(`subAccounts/${SA1}/mediaAssets/a1`).set({ subAccountId: SA1, agencyId: AG, mediaType: "image", status: "ready", publicImage: { url: PUBLIC, key: "k" } });
  await db.doc(`subAccounts/${SA1}/mediaAssets/a2`).set({ subAccountId: SA1, agencyId: AG, mediaType: "image", status: "ready", publicImage: null });
  await db.doc(`subAccounts/${SA2}/mediaAssets/a3`).set({ subAccountId: SA2, agencyId: AG, mediaType: "image", status: "ready", publicImage: { url: PUBLIC, key: "k" } });

  console.log("\nSave");
  let firstId = "";
  await check("saves a snapshot: no page id; tokens, inline tokens, chart reference, image, Page Center + visibility kept; render-only fields dropped", async () => {
    const r = await save("u1", SA1, { name: "  Client   Welcome ", system: "humanDesign", pageType: "About Me", page: samplePage() });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const t = r.body.template as Record<string, unknown> & { page: Record<string, unknown> & { elements: { id: string; payload: Record<string, unknown> }[] } };
    firstId = String(t.id);
    assert.deepEqual([t.name, t.system, t.pageType, t.createdByUid, t.subAccountId], ["Client Welcome", "humanDesign", "About Me", "u1", SA1]);
    assert.equal(t.page.id, undefined, "no page id stored");
    assert.deepEqual(t.page.visibleIf, samplePage().visibleIf);
    assert.equal(t.page.centerKey, "sacral");
    const els = t.page.elements;
    assert.equal(els.length, 5);
    assert.equal(els[0].payload.text, "Welcome, {{first_name}}", "inline token kept");
    assert.deepEqual(els[1].payload, { token: "type_description" }, "token kept, frozen value dropped");
    assert.deepEqual(els[2].payload, { piece: "human-design-bodygraph", chartDesignSetId: "set-violet" }, "chart part + saved design reference only");
    assert.equal(els[3].payload.url, PUBLIC, "public image kept");
    assert.deepEqual(samplePage().elements.map((e) => e.geometry), els.map((e) => (e as unknown as { geometry: unknown }).geometry), "geometry exact");
    const stored = (await db.doc(`reportPageTemplates/${firstId}`).get()).data()!;
    assert.equal(stored.agencyId, AG);
    assert.doesNotMatch(JSON.stringify(stored), /chartDesigns|resolvedText|FROZEN VALUE|page-src/);
  });
  await check("validation: name, system, page type (system's categories + Other); Astrology has its own", async () => {
    assert.equal((await save("u1", SA1, { name: "", system: "humanDesign", pageType: "Cover", page: samplePage() })).status, 400);
    assert.equal((await save("u1", SA1, { name: "x", system: "frequency", pageType: "Cover", page: samplePage() })).status, 400);
    assert.equal((await save("u1", SA1, { name: "x", system: "humanDesign", pageType: "Table", page: samplePage() })).status, 400, "Table is Astrology-only");
    assert.equal((await save("u1", SA1, { name: "x", system: "astrology", pageType: "Gate", page: samplePage() })).status, 400);
    assert.equal((await save("u1", SA1, { name: "x", system: "humanDesign", pageType: "Mine", page: samplePage() })).status, 400, "no user-made categories");
    assert.equal((await save("u1", SA1, { name: "x", system: "humanDesign", pageType: "Cover", page: null })).status, 400);
    assert.equal((await save("u1", SA1, { name: "x", system: "humanDesign", pageType: "Cover", page: { ...samplePage(), elements: Array.from({ length: 401 }, (_, i) => ({ ...samplePage().elements[0], id: `x${i}` })) } })).status, 400, "element cap");
  });
  await check("expiring image links: swapped for the library image's public copy, else dropped (never stored); foreign assets never used", async () => {
    const page = samplePage();
    page.elements = [
      { ...page.elements[3], id: "i1", payload: { url: SIGNED, assetId: "a1" } },
      { ...page.elements[3], id: "i2", payload: { url: SIGNED, assetId: "a2" } },
      { ...page.elements[3], id: "i3", payload: { url: SIGNED, assetId: "a3" } },
      { ...page.elements[3], id: "i4", payload: { url: SIGNED } },
    ];
    const r = await save("u1", SA1, { name: "Images", system: "humanDesign", pageType: "Other", page });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.imagesSwapped, r.body.imagesCleared], [1, 3]);
    const urls = (r.body.template as { page: { elements: { payload: { url: string } }[] } }).page.elements.map((e) => e.payload.url);
    assert.deepEqual(urls, [PUBLIC, "", "", ""]);
    assert.doesNotMatch(JSON.stringify((await db.collection("reportPageTemplates").get()).docs.map((d) => d.data())), /X-Goog-Signature/);
  });

  console.log("\nList (Mine) + tenancy");
  await check("Mine = the caller's own templates in this workspace, newest first; Other, Astrology included", async () => {
    await sleep(30);
    assert.equal((await save("u1", SA1, { name: "Closing", system: "humanDesign", pageType: "Other", page: samplePage() })).status, 200);
    await sleep(30);
    assert.equal((await save("u1", SA1, { name: "Astro Cover", system: "astrology", pageType: "Cover", page: samplePage() })).status, 200);
    const r = await list("u1", SA1);
    assert.equal(r.status, 200);
    const ts = r.body.templates as { name: string; createdAt: string; system: string; pageType: string }[];
    assert.deepEqual(ts.map((t) => t.name), ["Astro Cover", "Closing", "Images", "Client Welcome"]);
    assert.ok(ts.every((t, i) => i === 0 || ts[i - 1].createdAt >= t.createdAt));
  });
  await check("isolation: another member of the workspace, another workspace and a non-member see none", async () => {
    assert.deepEqual((await list("u2", SA1)).body.templates, [], "another member's Mine is their own");
    assert.deepEqual((await list("u1", SA2)).body.templates, [], "another workspace");
    assert.equal((await list("outsider", SA1)).status, 403, "non-member");
    assert.equal((await save("outsider", SA1, { name: "x", system: "humanDesign", pageType: "Cover", page: samplePage() })).status, 403);
  });
  await check("rename / delete: only the owner, only in its workspace (others get 404/403, nothing changes)", async () => {
    assert.equal((await oneRoute.PATCH(req("u2", "PATCH", { name: "Hijack" }), p(SA1, { templateId: firstId }))).status, 404);
    assert.equal((await oneRoute.PATCH(req("u1", "PATCH", { name: "Hijack" }), p(SA2, { templateId: firstId }))).status, 404);
    assert.equal((await oneRoute.DELETE(req("u2", "DELETE"), p(SA1, { templateId: firstId }))).status, 404);
    assert.equal((await oneRoute.DELETE(req("outsider", "DELETE"), p(SA1, { templateId: firstId }))).status, 403);
    assert.equal((await db.doc(`reportPageTemplates/${firstId}`).get()).get("name"), "Client Welcome");
  });

  console.log("\nRename + delete");
  await check("rename changes only the template's name (page snapshot untouched); empty names refused", async () => {
    const before = (await db.doc(`reportPageTemplates/${firstId}`).get()).data()!;
    assert.equal((await oneRoute.PATCH(req("u1", "PATCH", { name: " " }), p(SA1, { templateId: firstId }))).status, 400);
    const r = await json(await oneRoute.PATCH(req("u1", "PATCH", { name: "Welcome Letter" }), p(SA1, { templateId: firstId })));
    assert.equal(r.status, 200);
    const after = (await db.doc(`reportPageTemplates/${firstId}`).get()).data()!;
    assert.equal(after.name, "Welcome Letter");
    assert.deepEqual(after.page, before.page);
  });
  await check("delete removes only the template: a report design holding a page inserted from it is untouched", async () => {
    const inserted = { ...samplePage(), id: "fresh-page", title: "Welcome Letter", elements: samplePage().elements.map((e, i) => ({ ...e, id: `fresh-${i}` })) };
    await db.doc("reportDesigns/rd1").set({ subAccountId: SA1, agencyId: AG, title: "Report", pages: [inserted] });
    const before = JSON.stringify((await db.doc("reportDesigns/rd1").get()).data());
    assert.equal((await oneRoute.DELETE(req("u1", "DELETE"), p(SA1, { templateId: firstId }))).status, 200);
    assert.equal((await db.doc(`reportPageTemplates/${firstId}`).get()).exists, false);
    assert.equal(JSON.stringify((await db.doc("reportDesigns/rd1").get()).data()), before);
    assert.ok(!((await list("u1", SA1)).body.templates as { id: string }[]).some((t) => t.id === firstId));
    assert.equal((await oneRoute.DELETE(req("u1", "DELETE"), p(SA1, { templateId: firstId }))).status, 404, "already gone");
  });
  await check("no Firestore rule matches reportPageTemplates (server-only, default deny)", () => {
    assert.doesNotMatch(readFileSync("firestore.rules", "utf8"), /reportPageTemplates/);
  });

  console.log(`\n${passed} checks passed.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
