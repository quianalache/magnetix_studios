/**
 * Deterministic Page-owned Popup persistence QA. Emulator only.
 * Run with: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-popup-persistence
 * NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx scripts/check-popup-persistence.ts
 */
import assert from "node:assert/strict";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAdminDb } from "../src/lib/firebase/admin";
import { savePuckDraft, publishPuckPage } from "../src/lib/server/pages-funnels-puck-service";
import { createDefaultPopup, findStalePopupReferences } from "../src/types/pages-funnels-popup";
import type { Data as PuckData } from "@puckeditor/core";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith("demo-")) {
  throw new Error("Refusing to run outside a demo Firestore emulator.");
}
if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });

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
    console.log("Popup persistence QA: 8/8 PASS");
  } finally {
    await db.collection("pages").doc(pageId).delete();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
