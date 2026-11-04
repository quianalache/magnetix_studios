/**
 * Unknown-block safety guard (2026-11-04). A page holding block types this
 * build doesn't know (saved by a newer build) must never be edited or saved
 * by this build: the builder refuses to open it, and the save / publish
 * service refuses to write over it — nothing is stripped or rewritten.
 *
 * Offline: detection (top-level, nested slots, blocks inside array items,
 * legacy zones, Popup content), no false positives (actions / backgrounds
 * are not blocks; every registered block is known), the refusal message.
 * Emulator (FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT=demo-*): Save Draft and
 * Publish over a stored page with an unknown block are refused and the stored
 * document is byte-for-byte unchanged; incoming unknown content is refused;
 * ordinary pages still save + publish.
 *
 * Run: pnpm check:unknown-blocks
 */
import assert from "node:assert/strict";
import { KNOWN_PUCK_BLOCK_TYPES, findUnknownBlockTypes, findUnknownBlockTypesInPage, unknownBlocksSaveError } from "../src/lib/pages-funnels/puck/known-blocks";
import { encodePuckData } from "../src/lib/pages-funnels/puck-storage";
import { createDefaultPopup, encodePopupMapForStorage } from "../src/types/pages-funnels-popup";
import type { Data } from "@puckeditor/core";

const FUTURE = "FutureBlockForCompatibilityTest";
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

const block = (type: string, id: string, props: Record<string, unknown> = {}) => ({ type, props: { id, ...props } });
const nested = (inner: unknown) => ({
  root: { props: {} },
  content: [block("Section", "Section-1", { rows: [block("Row", "Row-1", { columns: [block("Column", "Column-1", { elements: [block("Heading", "h1", { text: "Hi" }), inner] })] })] })],
});
/** A page using every registered block type, plus the settings shapes that carry a `type` but aren't blocks. */
const allKnown = () => ({
  root: { props: { pageBackground: { source: "color", color: { mode: "gradient", gradient: { type: "linear", stops: [] } } } } },
  content: KNOWN_PUCK_BLOCK_TYPES.map((type, i) =>
    block(type, `${type}-${i}`, {
      action: { type: "booking", bookingPageSlug: "a" },
      cta: { enabled: true, action: { type: "url", url: "https://x" } },
      items: [{ id: "i", kind: "dropdown", label: "x", children: [{ id: "c", label: "c", action: { type: "page", pageId: "p" } }] }],
      chart: { type: "bar", series: [] },
    }),
  ),
});

async function offline() {
  await check("every registered block type (with action / background / chart settings) is known — no false positives", () => {
    assert.deepEqual(findUnknownBlockTypes(allKnown()), []);
  });
  await check("unknown top-level block found", () => {
    assert.deepEqual(findUnknownBlockTypes({ root: { props: {} }, content: [block("Heading", "h"), block(FUTURE, "f")] }), [FUTURE]);
  });
  await check("unknown block nested in Section → Row → Column found", () => {
    assert.deepEqual(findUnknownBlockTypes(nested(block(FUTURE, "f"))), [FUTURE]);
  });
  await check("unknown block inside an array item (e.g. a tab's content) found", () => {
    assert.deepEqual(findUnknownBlockTypes(nested(block("Tabs", "t", { tabs: [{ label: "A", content: [block(FUTURE, "f")] }] }))), [FUTURE]);
  });
  await check("legacy zones searched", () => {
    assert.deepEqual(findUnknownBlockTypes({ root: { props: {} }, content: [], zones: { "x:y": [block("OtherFutureBlock", "o")] } }), ["OtherFutureBlock"]);
  });
  await check("several unknown types: sorted, de-duplicated", () => {
    assert.deepEqual(findUnknownBlockTypes({ content: [block("Zeta", "z1"), block("Alpha", "a"), block("Zeta", "z2")] }), ["Alpha", "Zeta"]);
  });
  await check("stored page: draft, published (puck-json-v1 and legacy map) and Popup content are all checked", () => {
    const popup = createDefaultPopup("popup_a", "P");
    popup.content = { root: { props: {} }, content: [block(FUTURE, "in-popup")] } as unknown as Data;
    assert.deepEqual(findUnknownBlockTypesInPage({ puckDraftData: encodePuckData(nested(block(FUTURE, "f")) as unknown as Data) }), [FUTURE]);
    assert.deepEqual(findUnknownBlockTypesInPage({ puckPublishedData: nested(block("Published", "p")) }), ["Published"]);
    assert.deepEqual(findUnknownBlockTypesInPage({ puckDraftPopups: encodePopupMapForStorage({ popup_a: popup }) }), [FUTURE]);
    assert.deepEqual(findUnknownBlockTypesInPage({ puckDraftData: encodePuckData(allKnown() as unknown as Data) }), []);
    assert.deepEqual(findUnknownBlockTypesInPage({}), []);
  });
  await check("unreadable stored content contributes nothing (it has its own refusal)", () => {
    assert.deepEqual(findUnknownBlockTypesInPage({ puckDraftData: { encoding: "puck-json-v1", json: "{not json" } }), []);
  });
  await check("refusal message is plain language and says nothing changed", () => {
    const m = unknownBlocksSaveError([FUTURE]);
    assert.match(m, /newer content/);
    assert.match(m, /Nothing was changed/);
    assert.ok(m.includes(FUTURE));
  });
}

async function emulator() {
  const { initializeApp, getApps } = await import("firebase-admin/app");
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { savePuckDraft, publishPuckPage } = await import("../src/lib/server/pages-funnels-puck-service");
  const db = getAdminDb();
  const run = `t${Date.now()}`;
  const SA = `sa_${run}`;
  const FUTURE_PAGE = `pg_future_${run}`, OK_PAGE = `pg_ok_${run}`;
  const futureData = nested(block(FUTURE, "Future-1", { anything: { deep: [1, 2] } }));
  const knownEdit = nested(block("Text", "t1", { text: "edited by an older builder" })) as unknown as Data;
  try {
    await db.doc(`pages/${FUTURE_PAGE}`).set({ subAccountId: SA, name: "QA · future block", status: "published", puckDraftData: encodePuckData(futureData as unknown as Data), puckPublishedData: encodePuckData(futureData as unknown as Data) });
    await db.doc(`pages/${OK_PAGE}`).set({ subAccountId: SA, name: "QA · known", status: "draft", puckDraftData: encodePuckData(nested(block("Text", "t1", { text: "v1" })) as unknown as Data) });
    const before = JSON.stringify((await db.doc(`pages/${FUTURE_PAGE}`).get()).data());

    await check("Save Draft over a stored page with an unknown block is refused (409, plain reason)", async () => {
      const r = await savePuckDraft(SA, FUTURE_PAGE, knownEdit, {});
      assert.equal(r.ok, false);
      assert.equal((r as { status: number }).status, 409);
      assert.match((r as { error: string }).error, /newer content .*FutureBlockForCompatibilityTest/);
    });
    await check("Publish over it is refused too", async () => {
      const r = await publishPuckPage(SA, FUTURE_PAGE, knownEdit, {});
      assert.equal(r.ok, false);
      assert.equal((r as { status: number }).status, 409);
    });
    await check("stored page is byte-for-byte unchanged; the unknown block is still there", async () => {
      const after = (await db.doc(`pages/${FUTURE_PAGE}`).get()).data()!;
      assert.equal(JSON.stringify(after), before);
      assert.deepEqual(findUnknownBlockTypesInPage(after), [FUTURE]);
      assert.ok((after.puckDraftData as { json: string }).json.includes('"anything":{"deep":[1,2]}'));
    });
    await check("incoming content carrying an unknown block is refused (400) and nothing is written", async () => {
      const okBefore = JSON.stringify((await db.doc(`pages/${OK_PAGE}`).get()).data());
      const r = await savePuckDraft(SA, OK_PAGE, nested(block(FUTURE, "f")) as unknown as Data, {});
      assert.equal(r.ok, false);
      assert.equal((r as { status: number }).status, 400);
      const popup = createDefaultPopup("popup_a", "P");
      popup.content = { root: { props: {} }, content: [block(FUTURE, "in-popup")] } as unknown as Data;
      const rp = await savePuckDraft(SA, OK_PAGE, knownEdit, { popup_a: popup });
      assert.equal(rp.ok, false, "unknown block inside a Popup refused too");
      assert.equal(JSON.stringify((await db.doc(`pages/${OK_PAGE}`).get()).data()), okBefore);
    });
    await check("ordinary pages still save and publish", async () => {
      assert.equal((await savePuckDraft(SA, OK_PAGE, knownEdit, {})).ok, true);
      assert.equal((await publishPuckPage(SA, OK_PAGE, knownEdit, {})).ok, true);
    });
  } finally {
    await db.doc(`pages/${FUTURE_PAGE}`).delete().catch(() => {});
    await db.doc(`pages/${OK_PAGE}`).delete().catch(() => {});
  }
}

async function main() {
  await offline();
  const emu = process.env.FIRESTORE_EMULATOR_HOST && process.env.GCLOUD_PROJECT?.startsWith("demo-");
  if (emu) await emulator();
  console.log(`Unknown-block guard checks: ${passed} passed${emu ? " (incl. emulator save/publish)" : " (offline; set the emulator env for save/publish)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
