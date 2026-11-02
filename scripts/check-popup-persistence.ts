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
import { createDefaultPopup, findStalePopupReferences, type PopupDefinition } from "../src/types/pages-funnels-popup";
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

  await db.collection("pages").doc(pageId).set({ subAccountId, status: "draft", blocks: [], createdAt: new Date(), updatedAt: new Date() });
  try {
    const saved = await savePuckDraft(subAccountId, pageId, data, { [popupId]: popup });
    assert.equal(saved.ok, true, "draft save succeeds");
    const afterSave = (await db.collection("pages").doc(pageId).get()).data()!;
    assert.equal(afterSave.puckDraftPopups[popupId].id, popupId, "stable popup id survives draft save");
    assert.equal(afterSave.puckPublishedPopups, undefined, "draft save does not create published snapshot");

    const published = await publishPuckPage(subAccountId, pageId, data, { [popupId]: popup });
    assert.equal(published.ok, true, "publish succeeds");
    const afterPublish = (await db.collection("pages").doc(pageId).get()).data()!;
    assert.deepEqual(afterPublish.puckPublishedPopups, afterPublish.puckDraftPopups, "publish snapshots draft popups atomically");

    const edited = createDefaultPopup(popupId, "Renamed popup");
    await savePuckDraft(subAccountId, pageId, data, { [popupId]: edited });
    const afterEdit = (await db.collection("pages").doc(pageId).get()).data()!;
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
    const afterB = (await db.collection("pages").doc(pageId).get()).data()!;
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
    const afterSwitch = (await db.collection("pages").doc(pageId).get()).data()!;
    assert.deepEqual(Object.keys(afterSwitch.puckDraftPopups).sort(), ["popup_a", "popup_b", "popup_c"], "stable ids after switching"); passed++;
    assert.equal(headingOf(afterSwitch.puckDraftPopups.popup_b), "B edited after A", "B keeps its own edit"); passed++;
    assert.equal(headingOf(afterSwitch.puckDraftPopups.popup_a), "QA Popup Version B", "A keeps its own edit"); passed++;
    const pubB = await publishPuckPage(subAccountId, pageId, data, map);
    assert.equal(pubB.ok, true, "second publish succeeds"); passed++;
    const afterPub = (await db.collection("pages").doc(pageId).get()).data()!;
    assert.equal(headingOf(afterPub.puckPublishedPopups.popup_a), "QA Popup Version B", "after publish the live Popup shows Version B"); passed++;
    assert.equal(afterPub.puckPublishedPopups.popup_a.style.panelPadding, 12, "frame setting live after publish"); passed++;
    // Deleting a Popup removes it from the draft only.
    const { popup_c: _removed, ...withoutC } = map;
    void _removed;
    await savePuckDraft(subAccountId, pageId, data, withoutC);
    const afterDelete = (await db.collection("pages").doc(pageId).get()).data()!;
    assert.equal(afterDelete.puckDraftPopups.popup_c, undefined, "deleted Popup leaves the draft"); passed++;
    assert.ok(afterDelete.puckPublishedPopups.popup_c, "live page keeps it until the next publish"); passed++;
    // Firestore's 20-level limit: too-deep Popup content gets a clear 413, never a bare 500.
    const deepBg = { color: { gradient: { stops: [{ id: "s1", probe: { x: 1 } }] } } };
    const tooDeep = createDefaultPopup("popup_deep", "Too deep");
    type Node = { props: Record<string, unknown> & { rows?: Node[]; columns?: Node[]; elements?: Node[] } };
    const section = tooDeep.content.content[0] as unknown as Node;
    section.props.rows![0].props.columns![0].props.elements![2].props.background = deepBg;
    const deepResult = await savePuckDraft(subAccountId, pageId, data, { popup_deep: tooDeep });
    assert.equal(deepResult.ok, false, "too-deep Popup content is refused"); passed++;
    assert.equal(!deepResult.ok && deepResult.status, 413, "…with a clear 413, not a Firestore 500"); passed++;
    console.log(`Popup persistence QA: ${passed}/${passed} PASS`);
  } finally {
    await db.collection("pages").doc(pageId).delete();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
