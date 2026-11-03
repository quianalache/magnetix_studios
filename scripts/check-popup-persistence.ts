/**
 * Deterministic Page-owned Popup persistence QA. Emulator only — exercises the
 * REAL `savePuckDraft` / `publishPuckPage` (no copied persistence logic).
 *
 * Run (the package script preloads the `server-only` shim the service needs):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-popup-persistence pnpm check:popup-persistence
 */
import assert from "node:assert/strict";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAdminDb } from "../src/lib/firebase/admin";
import { savePuckDraft, publishPuckPage } from "../src/lib/server/pages-funnels-puck-service";
import { createDefaultPopup, findStalePopupReferences, normalizePopupMap, type PopupDefinition } from "../src/types/pages-funnels-popup";
import { FIRESTORE_MAX_FIELD_DEPTH, POPUP_CONTENT_MAX_DEPTH, fieldDepth } from "../src/lib/pages-funnels/popup-content";
import { applyPopupEditorChange, popupToEditorData } from "../src/lib/pages-funnels/popup-editor";
import type { Data as PuckData } from "@puckeditor/core";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith("demo-")) {
  throw new Error("Refusing to run outside a demo Firestore emulator.");
}
if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });

let passed = 9; // the nine original assertions below (Slices 1–4), all counted on success

async function main() {
  const db = getAdminDb();
  const pageId = `qa-popup-${Date.now()}`;
  const subAccountId = "qa-popup-sub-account";
  const popupId = "popup_stable_001";
  const data = {
    root: { props: {} },
    content: [{ type: "Heading", props: { id: "heading-1", text: "QA" } }],
  } as PuckData;
  const popup = createDefaultPopup(popupId, "QA popup");

  // Reads the page the way every reader does: Popup maps decoded through the real codec.
  const readPage = async (id = pageId) => {
    const d = (await db.collection("pages").doc(id).get()).data()!;
    return {
      ...d,
      raw: { draft: d.puckDraftPopups, published: d.puckPublishedPopups },
      puckDraftPopups: d.puckDraftPopups ? normalizePopupMap(d.puckDraftPopups) : undefined,
      puckPublishedPopups: d.puckPublishedPopups ? normalizePopupMap(d.puckPublishedPopups) : undefined,
    } as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  await db.collection("pages").doc(pageId).set({ subAccountId, status: "draft", blocks: [], createdAt: new Date(), updatedAt: new Date() });
  try {
    const saved = await savePuckDraft(subAccountId, pageId, data, { [popupId]: popup });
    assert.equal(saved.ok, true, "draft save succeeds");
    const afterSave = await readPage();
    assert.equal(afterSave.puckDraftPopups[popupId].id, popupId, "stable popup id survives draft save");
    assert.equal(afterSave.puckPublishedPopups, undefined, "draft save does not create published snapshot");

    const published = await publishPuckPage(subAccountId, pageId, data, { [popupId]: popup });
    assert.equal(published.ok, true, "publish succeeds");
    const afterPublish = await readPage();
    assert.deepEqual(afterPublish.puckPublishedPopups, afterPublish.puckDraftPopups, "publish snapshots draft popups atomically");

    const edited = createDefaultPopup(popupId, "Renamed popup");
    await savePuckDraft(subAccountId, pageId, data, { [popupId]: edited });
    const afterEdit = await readPage();
    assert.equal(afterEdit.puckDraftPopups[popupId].name, "Renamed popup", "draft edit persists");
    assert.equal(afterEdit.puckPublishedPopups[popupId].name, "QA popup", "published snapshot remains frozen");

    const withMissingRef = { ...data, content: [{ type: "Button", props: { id: "button-1", action: { type: "open_popup", popupId: "missing" } } }] } as PuckData;
    assert.deepEqual(findStalePopupReferences(withMissingRef, { [popupId]: edited }), ["missing"], "stale popup refs are detected");
    const rejected = await savePuckDraft(subAccountId, pageId, withMissingRef, { [popupId]: edited });
    assert.equal(rejected.ok, false, "stale popup reference is rejected");
    // ---- Slice 4.5: real child content, several Popups, frame settings ----
    const headingOf = (p: PopupDefinition) => {
      const find = (v: unknown): string | null => {
        if (!v || typeof v !== "object") return null;
        if (Array.isArray(v)) { for (const x of v) { const r = find(x); if (r) return r; } return null; }
        const n = v as { type?: string; props?: Record<string, unknown> };
        if (n.type === "Heading" && typeof n.props?.text === "string") return n.props.text;
        for (const x of Object.values(n.props ?? {})) { const r = find(x); if (r) return r; }
        return null;
      };
      return find(p.content.content);
    };
    // The editor's own change path: edit the Popup's Heading through its editor data.
    const editHeading = (map: Record<string, PopupDefinition>, id: string, text: string) => {
      const editor = popupToEditorData(map[id]);
      const next = JSON.parse(JSON.stringify(editor).replace(/"text":"[^"]*","level"/, `"text":${JSON.stringify(text)},"level"`));
      return applyPopupEditorChange(map, id, next);
    };
    let map: Record<string, PopupDefinition> = {
      popup_a: createDefaultPopup("popup_a", "Popup A"),
      popup_b: createDefaultPopup("popup_b", "Popup B"),
      popup_c: createDefaultPopup("popup_c", "Popup C"),
    };
    map = editHeading(map, "popup_a", "QA Popup Version A");
    map = editHeading(map, "popup_b", "Popup B heading");
    const pubA = await publishPuckPage(subAccountId, pageId, data, map);
    assert.equal(pubA.ok, true, "publish with three Popups succeeds"); passed++;
    map = editHeading(map, "popup_a", "QA Popup Version B");
    // Frame settings change on A only.
    const frameEdit = popupToEditorData(map.popup_a);
    (frameEdit.root.props as { frame: { style: { panelPadding: number } } }).frame.style.panelPadding = 12;
    map = applyPopupEditorChange(map, "popup_a", frameEdit);
    await savePuckDraft(subAccountId, pageId, data, map);
    const afterB = await readPage();
    assert.equal(headingOf(afterB.puckDraftPopups.popup_a), "QA Popup Version B", "draft holds Version B child content"); passed++;
    assert.equal(headingOf(afterB.puckPublishedPopups.popup_a), "QA Popup Version A", "published still holds Version A child content"); passed++;
    assert.equal(afterB.puckDraftPopups.popup_a.style.panelPadding, 12, "frame setting persists in the draft"); passed++;
    assert.equal(afterB.puckPublishedPopups.popup_a.style.panelPadding, 32, "frame setting not live until publish"); passed++;
    assert.equal(headingOf(afterB.puckDraftPopups.popup_b), "Popup B heading", "Popup B content untouched by A's edits"); passed++;
    assert.deepEqual(afterB.puckDraftPopups.popup_c, map.popup_c, "Popup C untouched"); passed++;
    assert.deepEqual(afterB.puckDraftPopups.popup_a.content.root, { props: {} }, "frame never leaks into saved content root"); passed++;
    assert.deepEqual(afterB.puckDraftData, data, "page draft untouched by Popup edits"); passed++;
    // A → B → A switching: each Popup's tree saved under its own id.
    map = editHeading(map, "popup_b", "B edited after A");
    map = editHeading(map, "popup_a", "QA Popup Version B");
    await savePuckDraft(subAccountId, pageId, data, map);
    const afterSwitch = await readPage();
    assert.deepEqual(Object.keys(afterSwitch.puckDraftPopups).sort(), ["popup_a", "popup_b", "popup_c"], "stable ids after switching"); passed++;
    assert.equal(headingOf(afterSwitch.puckDraftPopups.popup_b), "B edited after A", "B keeps its own edit"); passed++;
    assert.equal(headingOf(afterSwitch.puckDraftPopups.popup_a), "QA Popup Version B", "A keeps its own edit"); passed++;
    const pubB = await publishPuckPage(subAccountId, pageId, data, map);
    assert.equal(pubB.ok, true, "second publish succeeds"); passed++;
    const afterPub = await readPage();
    assert.equal(headingOf(afterPub.puckPublishedPopups.popup_a), "QA Popup Version B", "after publish the live Popup shows Version B"); passed++;
    assert.equal(afterPub.puckPublishedPopups.popup_a.style.panelPadding, 12, "frame setting live after publish"); passed++;
    // Deleting a Popup removes it from the draft only.
    const { popup_c: _removed, ...withoutC } = map;
    void _removed;
    await savePuckDraft(subAccountId, pageId, data, withoutC);
    const afterDelete = await readPage();
    assert.equal(afterDelete.puckDraftPopups.popup_c, undefined, "deleted Popup leaves the draft"); passed++;
    assert.ok(afterDelete.puckPublishedPopups.popup_c, "live page keeps it until the next publish"); passed++;
    // ---- Storage headroom (2026-11-03): Popup content stored as a JSON string ----
    const raw = (await readPage()).raw;
    assert.equal(typeof raw.draft.popup_a.contentJson, "string", "stored Popup content is a JSON string"); passed++;
    assert.equal(raw.draft.popup_a.content, undefined, "no map-shaped content is written any more"); passed++;
    assert.ok(fieldDepth(raw.draft) <= 3 && fieldDepth(raw.published) <= 3, `stored Popup maps are ${fieldDepth(raw.draft)} levels deep (Firestore allows ${FIRESTORE_MAX_FIELD_DEPTH})`); passed++;
    type Node = { props: Record<string, unknown> & { rows?: Node[]; columns?: Node[]; elements?: Node[] } };
    const buttonOf = (p: PopupDefinition) => (p.content.content[0] as unknown as Node).props.rows![0].props.columns![0].props.elements![2];
    // The content the OLD storage could not save (one level past 20) now saves…
    const formerlyTooDeep = createDefaultPopup("popup_deep", "Formerly too deep");
    buttonOf(formerlyTooDeep).props.background = { color: { gradient: { stops: [{ id: "s1", probe: { x: 1 } }] } } };
    // …with a Slice-5-style nested action carrying destination metadata.
    buttonOf(formerlyTooDeep).props.action = { type: "none", destination: { kind: "popup", target: { id: "popup_a", meta: { analytics: { label: "cta" } } } } };
    const deepSaved = await savePuckDraft(subAccountId, pageId, data, { ...map, popup_deep: formerlyTooDeep });
    assert.equal(deepSaved.ok, true, "content one level past the OLD limit now saves (real headroom)"); passed++;
    assert.deepEqual((await readPage()).puckDraftPopups.popup_deep.content, formerlyTooDeep.content, "…and reads back exactly"); passed++;
    // Pathological depth is still refused clearly.
    let silly: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < POPUP_CONTENT_MAX_DEPTH + 2; i++) silly = { n: silly };
    const absurd = createDefaultPopup("popup_absurd", "Absurd");
    buttonOf(absurd).props.background = silly;
    const absurdResult = await savePuckDraft(subAccountId, pageId, data, { popup_absurd: absurd });
    assert.equal(!absurdResult.ok && absurdResult.status, 413, "content past the sanity cap → clear 413"); passed++;
    // Malformed Popups are refused (never silently dropped, which would delete them).
    const malformed = await savePuckDraft(subAccountId, pageId, data, { ...map, popup_bad: { id: "popup_bad", name: "Bad" } as unknown as PopupDefinition });
    assert.equal(!malformed.ok && malformed.status, 400, "malformed Popup → 400"); passed++;
    assert.ok((await readPage()).puckDraftPopups.popup_deep, "…and nothing was written"); passed++;
    // Whole-document size guard (Firestore's 1 MiB cap).
    const huge = { ...data, content: [{ type: "Text", props: { id: "t", text: "x".repeat(950_000) } }] } as PuckData;
    const hugeResult = await savePuckDraft(subAccountId, pageId, huge, map);
    assert.equal(!hugeResult.ok && hugeResult.status, 413, "page doc over the size budget → clear 413"); passed++;
    // Atomic publish: page + Popups land in ONE document write.
    const pageC = { ...data, content: [{ type: "Heading", props: { id: "heading-1", text: "Page C" } }] } as PuckData;
    const pubC = await publishPuckPage(subAccountId, pageId, pageC, editHeading(map, "popup_a", "Popup C"));
    assert.equal(pubC.ok, true, "publish C succeeds"); passed++;
    const afterC = await readPage();
    assert.equal(afterC.puckPublishedData.content[0].props.text, "Page C", "published page = C"); passed++;
    assert.equal(headingOf(afterC.puckPublishedPopups.popup_a), "Popup C", "published Popup = C, in the same document write"); passed++;

    // ---- Legacy (Slices 3–4.5) map-content docs: read as-is, converted on the next intentional save ----
    const legacyPage = `${pageId}-legacy`;
    const legacyPopup = { ...createDefaultPopup("popup_legacy", "Legacy"), createdAt: "2026-11-01T00:00:00.000Z" };
    await db.collection("pages").doc(legacyPage).set({ subAccountId, status: "published", blocks: [], puckDraftData: data, puckPublishedData: data, puckDraftPopups: { popup_legacy: legacyPopup }, puckPublishedPopups: { popup_legacy: legacyPopup } });
    try {
      const before = await readPage(legacyPage);
      assert.deepEqual(before.puckDraftPopups.popup_legacy, legacyPopup, "legacy draft Popup reads unchanged (ids, content, style, timestamps)"); passed++;
      assert.deepEqual(before.puckPublishedPopups.popup_legacy, legacyPopup, "legacy published Popup reads unchanged"); passed++;
      await savePuckDraft(subAccountId, legacyPage, data, before.puckDraftPopups);
      const converted = await readPage(legacyPage);
      assert.equal(typeof converted.raw.draft.popup_legacy.contentJson, "string", "next save writes the new shape"); passed++;
      assert.deepEqual(converted.puckDraftPopups.popup_legacy, legacyPopup, "…with identical Popup id, block ids, content, style and timestamps"); passed++;
      assert.ok(converted.raw.published.popup_legacy.content && !converted.raw.published.popup_legacy.contentJson, "published stays legacy until the next publish (no bulk rewrite)"); passed++;
    } finally {
      await db.collection("pages").doc(legacyPage).delete();
    }
    console.log(`Popup persistence QA: ${passed}/${passed} PASS`);
  } finally {
    await db.collection("pages").doc(pageId).delete();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
