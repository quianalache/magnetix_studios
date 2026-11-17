/**
 * Page Version History V1 (2026-11-17) — EMULATOR ONLY. Exercises the real
 * services and API routes against the Firestore + Auth emulators: capture
 * rules (manual / 30-minute auto / publish / revert / restore), dedupe,
 * retention (15, live version protected), restore boundaries (design only;
 * SEO + tracking, identity, published copy and Reading Result settings kept),
 * draft-revision conflicts, authorization, page deletion cleanup, Media
 * Library usage, and that duplicates start with no history.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8099},"auth":{"port":9199}},"firestore":{"rules":"firestore.rules"}}' > firebase.versions-test.json
 *   firebase emulators:exec --config firebase.versions-test.json --only firestore,auth --project demo-page-versions \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-page-versions.ts"
 */
import assert from "node:assert/strict";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore + Auth emulators and a demo-* project only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID = PROJECT;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT;

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${(err as Error).stack?.split("\n").slice(0, 3).join("\n       ")}`);
  }
}

const AG = "agV", AG2 = "agOther", SA = "saV", SA2 = "saSibling", SA3 = "saForeign";
const settings = (title: string, pixel: string) => ({ seoTitle: title, seoDescription: `${title} description`, socialImage: "", noindex: false, tracking: { metaPixelId: pixel, ga4Id: "", gtmId: "" } });
const tree = (heading: string, extra: Record<string, unknown> = {}, pageSettings?: unknown) => ({
  root: { props: { title: "Root", background: { source: "color", color: heading.length % 2 ? "#ffffff" : "#f5f5f5" }, ...(pageSettings ? { pageSettings } : {}) } },
  content: [{ type: "Heading", props: { id: `h-${heading.length}`, text: heading, ...extra } }],
  zones: {},
});
let popupMap: (label: string) => Record<string, unknown> = () => ({});

async function main() {
  const { initializeApp } = await import("firebase-admin/app");
  initializeApp({ projectId: PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { getAuth } = await import("firebase-admin/auth");
  const svc = await import("../src/lib/server/pages-funnels-puck-service");
  const vsvc = await import("../src/lib/server/pages-funnels/page-version-service");
  const core = await import("../src/lib/server/pages-funnels/page-version-core");
  const { PAGE_VERSION_LIMIT, AUTO_CHECKPOINT_INTERVAL_MS } = await import("../src/lib/pages-funnels/page-versions");
  const { readStoredPuckData, encodePuckData } = await import("../src/lib/pages-funnels/puck-storage");
  const { normalizePopupMap, createDefaultPopup } = await import("../src/types/pages-funnels-popup");
  popupMap = (label: string) => ({ pop1: createDefaultPopup("pop1", `Popup ${label}`) });
  const route = await import("../src/app/api/pages-funnels/puck/page-settings/route");
  const draftRoute = await import("../src/app/api/sub-accounts/[id]/pages-funnels/[pageId]/puck-draft/route");
  const media = await import("../src/lib/server/assets/media-library-service");

  const db = getAdminDb();
  const auth = getAuth();
  const actor = { uid: "admin1", name: "Quiana Test" };

  // ── fixtures ──
  const user = async (uid: string, claims: Record<string, unknown>) => {
    await auth.createUser({ uid, email: `${uid}@example.com` }).catch(() => {});
    await auth.setCustomUserClaims(uid, claims);
  };
  await user("admin1", { status: "active", role: "admin", agencyId: AG, agencyRole: null });
  await user("owner1", { status: "active", role: "admin", agencyId: AG, agencyRole: "owner" });
  await user("collab1", { status: "active", role: "admin", agencyId: AG, agencyRole: null });
  await user("sibling1", { status: "active", role: "admin", agencyId: AG, agencyRole: null });
  await user("foreign1", { status: "active", role: "admin", agencyId: AG2, agencyRole: "owner" });
  await user("removed1", { status: "active", role: "admin", agencyId: AG, agencyRole: null });
  await db.doc(`subAccounts/${SA}`).set({ agencyId: AG, name: "Main" });
  await db.doc(`subAccounts/${SA2}`).set({ agencyId: AG, name: "Sibling" });
  await db.doc(`subAccounts/${SA3}`).set({ agencyId: AG2, name: "Foreign" });
  await db.doc(`subAccounts/${SA}/subAccountMembers/admin1`).set({ status: "active", role: "admin" });
  await db.doc(`subAccounts/${SA}/subAccountMembers/collab1`).set({ status: "active", role: "collaborator" });
  await db.doc(`subAccounts/${SA}/subAccountMembers/removed1`).set({ status: "removed", role: "admin" });
  await db.doc(`subAccounts/${SA2}/subAccountMembers/sibling1`).set({ status: "active", role: "admin" });
  await db.doc("users/admin1").set({ displayName: "Quiana Test" });

  const mkPage = async (id: string, extra: Record<string, unknown> = {}) => {
    await db.doc(`pages/${id}`).set({
      name: `Page ${id}`, slug: `page-${id}`, pageType: "generic", goal: "other", status: "draft", subAccountId: SA, agencyId: AG,
      funnelId: null, blocks: [], seo: { title: "", description: "", ogImage: "" },
      puckDraftData: encodePuckData(tree("Original", {}, settings("Current SEO", "111111111111111")) as never), puckDraftPopups: {},
      ...extra,
    });
  };
  const versions = async (pageId: string) =>
    (await db.collection(`pages/${pageId}/versions`).orderBy("createdAtMs", "desc").get()).docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }) as Record<string, unknown> & { id: string });
  const page = async (pageId: string) => (await db.doc(`pages/${pageId}`).get()).data() as Record<string, unknown>;
  const ageMarker = async (pageId: string) => {
    const p = await page(pageId);
    const h = (p.puckHistory ?? {}) as Record<string, unknown>;
    await db.doc(`pages/${pageId}`).update({ puckHistory: { latestFingerprint: h.latestFingerprint ?? null, latestAtMs: Date.now() - AUTO_CHECKPOINT_INTERVAL_MS - 1000 } });
  };
  const call = (uid: string | null, body: Record<string, unknown>) =>
    route.POST(new Request("http://test/api/pages-funnels/puck/page-settings", { method: "POST", headers: { "Content-Type": "application/json", ...(uid ? { "x-user-uid": uid } : {}) }, body: JSON.stringify(body) }));

  console.log("\nCapture");
  await mkPage("p1");
  await check("manual Save Draft records a 'manual' version with the saved design + attribution", async () => {
    const r = await svc.savePuckDraft(SA, "p1", tree("Manual one") as never, {}, { kind: "manual", actor });
    assert.equal(r.ok, true);
    const v = await versions("p1");
    assert.equal(v.length, 1);
    assert.equal(v[0].reason, "manual");
    assert.equal(v[0].createdByName, "Quiana Test");
    assert.equal((readStoredPuckData(v[0].data) as { content: { props: { text: string } }[] }).content[0].props.text, "Manual one");
  });
  await check("repeating Save Draft with the same design adds nothing (dedupe)", async () => {
    await svc.savePuckDraft(SA, "p1", tree("Manual one") as never, {}, { kind: "manual", actor });
    await svc.savePuckDraft(SA, "p1", tree("Manual one") as never, {}, { kind: "manual", actor });
    assert.equal((await versions("p1")).length, 1);
  });
  await check("autosave within 30 minutes of the last version adds nothing", async () => {
    for (const t of ["Edit a", "Edit b", "Edit c"]) await svc.savePuckDraft(SA, "p1", tree(t) as never, {}, { kind: "auto", actor });
    assert.equal((await versions("p1")).length, 1);
  });
  await check("after 30 minutes, the next autosave keeps the draft as it stood before it ('auto')", async () => {
    await ageMarker("p1");
    await svc.savePuckDraft(SA, "p1", tree("Edit d") as never, {}, { kind: "auto", actor });
    const v = await versions("p1");
    assert.equal(v.length, 2);
    assert.equal(v[0].reason, "auto");
    assert.equal((readStoredPuckData(v[0].data) as { content: { props: { text: string } }[] }).content[0].props.text, "Edit c");
    await svc.savePuckDraft(SA, "p1", tree("Edit e") as never, {}, { kind: "auto", actor });
    assert.equal((await versions("p1")).length, 2, "the interval restarts after a checkpoint");
  });
  await check("first autosave on a page with no history keeps the pre-edit design", async () => {
    await mkPage("p2");
    await svc.savePuckDraft(SA, "p2", tree("First edit") as never, {}, { kind: "auto", actor });
    const v = await versions("p2");
    assert.equal(v.length, 1);
    assert.equal((readStoredPuckData(v[0].data) as { content: { props: { text: string } }[] }).content[0].props.text, "Original");
  });
  await check("an idle editor (autosaves with an unchanged design) creates no versions", async () => {
    await ageMarker("p2");
    const before = (await versions("p2")).length;
    const p = await page("p2");
    const current = readStoredPuckData(p.puckDraftData);
    await svc.savePuckDraft(SA, "p2", current as never, {}, { kind: "auto", actor });
    await ageMarker("p2");
    await svc.savePuckDraft(SA, "p2", current as never, {}, { kind: "auto", actor });
    // the pre-save draft equals the newest version or was captured once — never twice
    const after = await versions("p2");
    assert.ok(after.length <= before + 1);
    const fps = after.map((x) => x.fingerprint);
    assert.equal(new Set(fps).size, fps.length, "no two identical versions");
  });
  await check("a failed save (invalid content) writes no version and keeps the revision", async () => {
    const before = await page("p1");
    const r = await svc.savePuckDraft(SA, "p1", { root: {}, content: "nope" } as never, {}, { kind: "manual", actor });
    assert.equal(r.ok, false);
    const after = await page("p1");
    assert.equal(after.puckDraftRevision, before.puckDraftRevision);
    assert.equal((await versions("p1")).length, 2);
  });

  console.log("\nPublish");
  await check("Publish right after Save Draft relabels that version 'Published' (no duplicate)", async () => {
    await svc.savePuckDraft(SA, "p1", tree("To publish") as never, {}, { kind: "manual", actor });
    const n = (await versions("p1")).length;
    const r = await svc.publishPuckPage(SA, "p1", tree("To publish") as never, {}, { actor });
    assert.equal(r.ok, true);
    const v = await versions("p1");
    assert.equal(v.length, n);
    assert.equal(v[0].reason, "publish");
  });
  await check("Publish of a new design records a 'publish' version", async () => {
    await svc.publishPuckPage(SA, "p1", tree("Published two") as never, {}, { actor });
    assert.equal((await versions("p1"))[0].reason, "publish");
  });
  await check("first Publish on a page that went live before Version History keeps the old live design ('previous_live')", async () => {
    await mkPage("p3", { status: "published", puckPublishedData: encodePuckData(tree("Old live") as never), puckPublishedPopups: {} });
    await svc.publishPuckPage(SA, "p3", tree("New live") as never, {}, { actor });
    const v = await versions("p3");
    assert.deepEqual(v.map((x) => x.reason).sort(), ["previous_live", "publish"]);
    const old = v.find((x) => x.reason === "previous_live")!;
    assert.equal((readStoredPuckData(old.data) as { content: { props: { text: string } }[] }).content[0].props.text, "Old live");
  });

  console.log("\nRevert");
  await check("Revert keeps the replaced draft as 'Before revert'; draft = published", async () => {
    await svc.savePuckDraft(SA, "p1", tree("Unpublished work") as never, {}, { kind: "auto", actor });
    await ageMarker("p1");
    const r = await svc.revertPuckDraftToPublished(SA, "p1", { actor });
    assert.equal(r.ok, true);
    const v = await versions("p1");
    assert.equal(v[0].reason, "before_revert");
    assert.equal((readStoredPuckData(v[0].data) as { content: { props: { text: string } }[] }).content[0].props.text, "Unpublished work");
    const p = await page("p1");
    assert.deepEqual(p.puckDraftData, p.puckPublishedData);
  });

  console.log("\nRestore");
  await mkPage("r1", {
    status: "published",
    readingResult: { chartDesignSetId: "cds1", sample: "generator" },
    puckPublishedData: encodePuckData(tree("Live design") as never),
    puckPublishedPopups: {},
  });
  // v-old: a design with its own (obsolete) SEO + a popup.
  const oldSave = await svc.savePuckDraft(SA, "r1", tree("Old design", { size: "xl" }, settings("Obsolete SEO", "222222222222222")) as never, popupMap("old") as never, { kind: "manual", actor });
  assert.equal(oldSave.ok, true, `fixture save: ${JSON.stringify(oldSave)}`);
  const oldVersion = (await versions("r1"))[0];
  await svc.savePuckDraft(SA, "r1", tree("Current design", {}, settings("Current SEO", "111111111111111")) as never, {}, { kind: "manual", actor });
  await check("restore brings back the old design + popups, keeps CURRENT SEO / tracking, never publishes", async () => {
    const before = await page("r1");
    const r = await vsvc.restorePageVersion(SA, "r1", oldVersion.id, { baseRevision: before.puckDraftRevision as number, actor });
    assert.equal(r.ok, true, JSON.stringify(r));
    const after = await page("r1");
    const draft = readStoredPuckData(after.puckDraftData) as { root: { props: Record<string, unknown> }; content: { props: Record<string, unknown> }[] };
    assert.equal(draft.content[0].props.text, "Old design");
    assert.equal(draft.content[0].props.size, "xl", "block settings restored");
    assert.deepEqual(draft.root.props.pageSettings, settings("Current SEO", "111111111111111"), "current SEO + tracking kept");
    assert.equal(Object.keys(normalizePopupMap(after.puckDraftPopups)).length, 1, "popups restored");
    // identity + operational fields untouched
    for (const k of ["name", "slug", "pageType", "goal", "status", "funnelId", "readingResult", "puckPublishedData", "puckPublishedPopups", "subAccountId", "agencyId"]) {
      assert.deepEqual(after[k], before[k], `${k} unchanged`);
    }
    assert.equal(after.puckDraftRevision, (before.puckDraftRevision as number) + 1);
  });
  await check("restore keeps the replaced draft ('Before restore') and records 'Restored version'", async () => {
    const v = await versions("r1");
    assert.equal(v[0].reason, "restored");
    assert.equal(v[0].restoredFromVersionId, oldVersion.id);
    const before = v.find((x) => x.reason === "before_restore") ?? v.find((x) => (readStoredPuckData(x.data) as { content: { props: { text: string } }[] }).content[0].props.text === "Current design");
    assert.ok(before, "the pre-restore draft is recoverable");
  });
  await check("restoring the design the draft already has changes nothing", async () => {
    const before = await page("r1");
    const n = (await versions("r1")).length;
    const latest = (await versions("r1"))[0];
    const r = await vsvc.restorePageVersion(SA, "r1", latest.id, { baseRevision: before.puckDraftRevision as number, actor });
    assert.equal(r.ok, true);
    assert.equal((await versions("r1")).length, n);
    assert.equal((await page("r1")).puckDraftRevision, before.puckDraftRevision);
  });
  await check("page with no stored Page Settings: restored tree carries none (legacy SEO fallback still applies)", async () => {
    await mkPage("r2", { puckDraftData: encodePuckData(tree("No settings now") as never) });
    await db.doc("pages/r2/versions/vOld").set({
      pageId: "r2", subAccountId: SA, agencyId: AG, reason: "manual", createdAtMs: Date.now() - 1000, createdByUid: "x", createdByName: null,
      fingerprint: "f", sizeBytes: 10, mediaVideoIds: [], data: encodePuckData(tree("Had settings", {}, settings("Old", "333333333333333")) as never), popups: {},
    });
    const r = await vsvc.restorePageVersion(SA, "r2", "vOld", { actor });
    assert.equal(r.ok, true);
    const draft = readStoredPuckData((await page("r2")).puckDraftData) as { root: { props: Record<string, unknown> } };
    assert.equal("pageSettings" in draft.root.props, false);
  });

  console.log("\nConflicts / concurrency");
  await check("a save with a stale revision is refused (409 conflict) and changes nothing", async () => {
    const p = await page("p2");
    const stale = (p.puckDraftRevision as number) - 1;
    const r = await svc.savePuckDraft(SA, "p2", tree("Stale tab") as never, {}, { kind: "auto", baseRevision: stale, actor });
    assert.equal(r.ok, false);
    assert.equal((r as { code?: string }).code, "conflict");
    assert.deepEqual((await page("p2")).puckDraftData, p.puckDraftData);
  });
  await check("a restore with a stale revision is refused and changes nothing (no partial history)", async () => {
    const p = await page("r1");
    const n = (await versions("r1")).length;
    const r = await vsvc.restorePageVersion(SA, "r1", oldVersion.id, { baseRevision: (p.puckDraftRevision as number) - 1, actor });
    assert.equal((r as { code?: string }).code, "conflict");
    assert.equal((await versions("r1")).length, n);
    assert.deepEqual((await page("r1")).puckDraftData, p.puckDraftData);
  });
  await check("after a restore, a pending autosave from before it can't overwrite the restored draft", async () => {
    const p = await page("r1");
    const rev = p.puckDraftRevision as number;
    await svc.savePuckDraft(SA, "r1", tree("Pre-restore edit") as never, {}, { kind: "auto", baseRevision: rev, actor });
    const p2 = await page("r1");
    await vsvc.restorePageVersion(SA, "r1", oldVersion.id, { baseRevision: p2.puckDraftRevision as number, actor });
    const late = await svc.savePuckDraft(SA, "r1", tree("Late autosave") as never, {}, { kind: "auto", baseRevision: p2.puckDraftRevision as number, actor });
    assert.equal((late as { code?: string }).code, "conflict");
    assert.equal((readStoredPuckData((await page("r1")).puckDraftData) as { content: { props: { text: string } }[] }).content[0].props.text, "Old design");
  });
  await check("two simultaneous saves from the same revision: exactly one wins", async () => {
    const rev = (await page("p2")).puckDraftRevision as number;
    const results = await Promise.all([
      svc.savePuckDraft(SA, "p2", tree("Tab A") as never, {}, { kind: "manual", baseRevision: rev, actor }),
      svc.savePuckDraft(SA, "p2", tree("Tab B") as never, {}, { kind: "manual", baseRevision: rev, actor }),
    ]);
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.equal(results.filter((r) => !r.ok && (r as { code?: string }).code === "conflict").length, 1);
  });
  await check("saves without a revision (editor opened before this release) still work", async () => {
    const r = await svc.savePuckDraft(SA, "p2", tree("Old client") as never, {}, {});
    assert.equal(r.ok, true);
  });
  await check("concurrent manual checkpoints of the same design are stored once", async () => {
    await mkPage("c1");
    await Promise.all([1, 2, 3].map(() => svc.savePuckDraft(SA, "c1", tree("Same design") as never, {}, { kind: "manual", actor })));
    const fps = (await versions("c1")).map((x) => x.fingerprint);
    assert.equal(new Set(fps).size, fps.length);
  });

  console.log("\nAuthorization (route)");
  await check("workspace admin and agency owner can list / read / restore", async () => {
    for (const uid of ["admin1", "owner1"]) {
      const list = await call(uid, { pageId: "r1", action: "versions" });
      assert.equal(list.status, 200, uid);
      const json = (await list.json()) as { versions: { id: string }[] };
      assert.ok(json.versions.length > 0);
      assert.equal((await call(uid, { pageId: "r1", action: "version", versionId: json.versions[0].id })).status, 200);
    }
    const rev = (await page("r1")).puckDraftRevision;
    const res = await call("owner1", { pageId: "r1", action: "restore", versionId: oldVersion.id, baseRevision: rev });
    assert.ok([200].includes(res.status));
  });
  await check("collaborator, other workspace, other agency, removed member and anonymous are refused", async () => {
    for (const uid of ["collab1", "sibling1", "foreign1", "removed1", null]) {
      for (const body of [{ action: "versions" }, { action: "version", versionId: oldVersion.id }, { action: "restore", versionId: oldVersion.id }]) {
        const res = await call(uid, { pageId: "r1", ...body });
        assert.ok([401, 403].includes(res.status), `${uid} ${body.action} → ${res.status}`);
      }
    }
  });
  await check("a version id from another page, or a malformed id, reads as not found", async () => {
    const other = (await versions("p1"))[0].id;
    assert.equal((await call("admin1", { pageId: "r1", action: "version", versionId: other })).status, 404);
    assert.equal((await call("admin1", { pageId: "r1", action: "restore", versionId: other })).status, 404);
    assert.equal((await call("admin1", { pageId: "r1", action: "version", versionId: "../x" })).status, 404);
    assert.equal((await call("admin1", { pageId: "r1", action: "version", versionId: "" })).status, 404);
  });
  await check("a page in another workspace can't be read through this workspace (service level)", async () => {
    const r = await vsvc.listPageVersions(SA2, "r1");
    assert.equal(r.ok, false);
  });
  await check("the list carries metadata only — never the designs", async () => {
    const json = (await (await call("admin1", { pageId: "r1", action: "versions" })).json()) as { versions: Record<string, unknown>[]; liveVersionId: string | null };
    for (const v of json.versions) {
      assert.equal("data" in v, false);
      assert.equal("popups" in v, false);
    }
  });
  await check("draft save route: manual kind + revision round-trip; a collaborator can't save", async () => {
    const rev = (await page("p2")).puckDraftRevision;
    const req = (uid: string, body: unknown) =>
      draftRoute.POST(new Request("http://test", { method: "POST", headers: { "Content-Type": "application/json", "x-user-uid": uid }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: SA, pageId: "p2" }) });
    const ok = await req("admin1", { data: tree("Route manual"), popups: {}, kind: "manual", baseRevision: rev });
    assert.equal(ok.status, 200);
    const json = (await ok.json()) as { revision: number };
    assert.equal(json.revision, (rev as number) + 1);
    assert.equal((await versions("p2"))[0].reason, "manual");
    const stale = await req("admin1", { data: tree("Route stale"), popups: {}, kind: "auto", baseRevision: rev });
    assert.equal(stale.status, 409);
    assert.equal(((await stale.json()) as { code: string }).code, "conflict");
    assert.equal((await req("collab1", { data: tree("Collab"), popups: {} })).status, 403);
  });

  console.log("\nRetention");
  await mkPage("k1");
  await check(`at most ${PAGE_VERSION_LIMIT} versions; the oldest go first; the live version is always kept`, async () => {
    await svc.publishPuckPage(SA, "k1", tree("Live forever") as never, {}, { actor });
    const liveId = (await versions("k1"))[0].id;
    for (let i = 0; i < 20; i++) await svc.savePuckDraft(SA, "k1", tree(`Design number ${i} ${"x".repeat(i)}`) as never, {}, { kind: "manual", actor });
    const v = await versions("k1");
    assert.equal(v.length, PAGE_VERSION_LIMIT);
    assert.ok(v.some((x) => x.id === liveId), "live version protected");
    const texts = v.map((x) => (readStoredPuckData(x.data) as { content: { props: { text: string } }[] }).content[0].props.text);
    assert.ok(texts.includes("Design number 19 " + "x".repeat(19)), "newest kept");
    assert.ok(!texts.includes("Design number 0 "), "oldest pruned");
  });
  await check("restore at the limit: before-restore + restored + source survive, total returns to the limit", async () => {
    const all = await versions("k1");
    const source = all[all.length - 2];
    const rev = (await page("k1")).puckDraftRevision as number;
    const r = await vsvc.restorePageVersion(SA, "k1", source.id, { baseRevision: rev, actor });
    assert.equal(r.ok, true);
    const v = await versions("k1");
    assert.equal(v.length, PAGE_VERSION_LIMIT);
    assert.ok(v.some((x) => x.id === source.id), "source kept");
    assert.equal(v[0].reason, "restored");
  });
  await check("histories are per page", async () => {
    assert.ok((await versions("k1")).every((x) => x.pageId === "k1"));
    assert.ok((await versions("p3")).every((x) => x.pageId === "p3"));
  });

  console.log("\nDuplicate / delete / media");
  await check("a duplicated page starts with no history", async () => {
    const dup = await svc.duplicatePuckPage(SA, "k1", "admin1");
    assert.equal(dup.ok, true);
    assert.equal((await versions((dup as { pageId: string }).pageId)).length, 0);
  });
  await check("versions record the Media Library videos they play; the Media Library counts them as in use", async () => {
    await mkPage("m1");
    const videoTree = { root: { props: {} }, content: [{ type: "Video", props: { id: "v1", url: "", mediaVideo: { assetId: "vidAsset1", title: "Intro" } } }], zones: {} };
    await svc.savePuckDraft(SA, "m1", videoTree as never, {}, { kind: "manual", actor });
    await svc.savePuckDraft(SA, "m1", tree("Video removed") as never, {}, { kind: "manual", actor });
    const v = await versions("m1");
    assert.ok(v.some((x) => (x.mediaVideoIds as string[]).includes("vidAsset1")));
    const usage = await media.usageOf({ agencyId: AG, subAccountId: SA }, { id: "vidAsset1", mediaType: "video", subAccountId: SA, agencyId: AG } as never);
    assert.ok(usage.some((u) => u.label === "Pages & Funnels — version history"), JSON.stringify(usage));
    // and a page's CURRENT Video block counts too (the old text match missed it)
    await svc.savePuckDraft(SA, "m1", videoTree as never, {}, { kind: "auto", actor });
    const usage2 = await media.usageOf({ agencyId: AG, subAccountId: SA }, { id: "vidAsset1", mediaType: "video", subAccountId: SA, agencyId: AG } as never);
    assert.ok(usage2.some((u) => u.label === "Pages & Funnels"), JSON.stringify(usage2));
  });
  await check("deleting a page removes its versions + analytics, nothing else", async () => {
    await mkPage("d1");
    await svc.savePuckDraft(SA, "d1", tree("To delete") as never, {}, { kind: "manual", actor });
    await db.doc("pages/d1/analyticsDaily/2026-11-17").set({ views: 3 });
    await db.doc("pages/d1/analyticsUnique/abc").set({ d: 1 });
    await db.doc("funnels/f1").set({ subAccountId: SA, steps: [{ pageId: "d1" }] });
    const otherBefore = (await versions("k1")).length;
    const res = await call("collab1", { pageId: "d1", action: "delete" });
    assert.equal(res.status, 403, "collaborator can't delete");
    const ok = await call("admin1", { pageId: "d1", action: "delete" });
    assert.equal(ok.status, 200);
    assert.equal((await db.doc("pages/d1").get()).exists, false);
    assert.equal((await db.collection("pages/d1/versions").get()).size, 0);
    assert.equal((await db.collection("pages/d1/analyticsDaily").get()).size, 0);
    assert.equal((await db.collection("pages/d1/analyticsUnique").get()).size, 0);
    assert.equal((await db.doc("funnels/f1").get()).exists, true, "funnel untouched");
    assert.equal((await versions("k1")).length, otherBefore, "other pages' history untouched");
  });
  await check("page fingerprints ignore Firestore map ordering", async () => {
    const a = core.designFingerprint(encodePuckData(tree("x") as never), { b: { id: "b", z: 1, a: 2 } as never, a: { id: "a" } as never });
    const b = core.designFingerprint(encodePuckData(tree("x") as never), { a: { id: "a" } as never, b: { a: 2, id: "b", z: 1 } as never });
    assert.equal(a, b);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
