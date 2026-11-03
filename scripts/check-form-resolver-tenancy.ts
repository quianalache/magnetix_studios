/**
 * Form-block tenant safety (2026-11-03) — Firestore + Auth emulators only.
 * Exercises the REAL resolver route handler and the REAL server resolver the
 * public page uses. `x-user-uid` is set the way middleware sets it after
 * verifying a session (middleware strips client-supplied copies).
 *
 * Run:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   GCLOUD_PROJECT=demo-form-tenancy pnpm check:form-tenancy
 */
import assert from "node:assert/strict";
import { initializeApp, getApps } from "firebase-admin/app";
import type { Data } from "@puckeditor/core";
import { getAdminAuth, getAdminDb } from "../src/lib/firebase/admin";
import { GET as resolveFormRoute } from "../src/app/api/pages-funnels/puck/resolve-form/route";
import { GET as pocResolveFormRoute } from "../src/app/api/docs/design-prototypes/puck-poc/resolve-form/route";
import { resolveFormsForSubAccount } from "../src/lib/server/page-form-resolver";
import { collectPuckFormIds } from "../src/lib/pages-funnels/puck/resolve";
import { withPopupContent } from "../src/lib/pages-funnels/popup-content";
import { createDefaultPopup, encodePopupMapForStorage, normalizePopupMap } from "../src/types/pages-funnels-popup";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith("demo-")) {
  throw new Error("Refusing to run outside the demo Firestore + Auth emulators.");
}
if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });

let passed = 0;
const ok = (cond: unknown, label: string) => { assert.ok(cond, label); passed++; console.log(`  PASS  ${label}`); };

const db = getAdminDb();
const auth = getAdminAuth();
const run = `t${Date.now()}`;
const A = { agency: `ag_a_${run}`, sa: `sa_a_${run}`, uid: `u_a_${run}`, page: `pg_a_${run}`, form: `fm_a_${run}` };
const B = { agency: `ag_b_${run}`, sa: `sa_b_${run}`, uid: `u_b_${run}`, page: `pg_b_${run}`, form: `fm_b_${run}` };
const DELETED = `fm_deleted_${run}`;

const formBlock = (id: string, formId: string) => ({ type: "Form", props: { id, formId, formName: "x" } });
const pageData = (formIds: string[]) => ({ root: { props: {} }, content: formIds.map((f, i) => formBlock(`f${i}`, f)) }) as Data;
const popupWith = (id: string, formIds: string[]) => {
  const popup = createDefaultPopup(id, `Popup ${id}`);
  popup.content = pageData(formIds);
  return popup;
};

async function seed() {
  for (const t of [A, B]) {
    await auth.createUser({ uid: t.uid, email: `${t.uid}@example.com` });
    await auth.setCustomUserClaims(t.uid, { role: "user", status: "active", agencyId: t.agency, agencyRole: null });
    await db.doc(`subAccounts/${t.sa}`).set({ agencyId: t.agency, name: t.sa });
    await db.doc(`subAccounts/${t.sa}/subAccountMembers/${t.uid}`).set({ uid: t.uid, role: "admin", status: "active" });
    await db.doc(`forms/${t.form}`).set({ agencyId: t.agency, subAccountId: t.sa, createdByUid: t.uid, name: `Form of ${t.sa}`, fields: [{ id: "e", type: "email", label: "Email", required: true }], settings: {} });
  }
  // Page A: page Form A + foreign Form B; Popup A: Form A + foreign Form B. Published.
  const popups = encodePopupMapForStorage({ popup_a: popupWith("popup_a", [A.form, B.form]) });
  const dataA = pageData([A.form, B.form]);
  await db.doc(`pages/${A.page}`).set({ subAccountId: A.sa, agencyId: A.agency, name: "QA · A", status: "published", puckDraftData: dataA, puckPublishedData: dataA, puckDraftPopups: popups, puckPublishedPopups: popups });
  await db.doc(`pages/${B.page}`).set({ subAccountId: B.sa, agencyId: B.agency, name: "QA · B", status: "published", puckDraftData: pageData([A.form]), puckPublishedData: pageData([A.form]) });
}

async function cleanup() {
  for (const t of [A, B]) {
    await auth.deleteUser(t.uid).catch(() => {});
    await db.recursiveDelete(db.doc(`subAccounts/${t.sa}`)).catch(() => {});
    await db.doc(`forms/${t.form}`).delete().catch(() => {});
    await db.doc(`pages/${t.page}`).delete().catch(() => {});
  }
}

const call = async (handler: (req: Request) => Promise<Response>, query: string, uid?: string) => {
  const res = await handler(new Request(`http://localhost/api/pages-funnels/puck/resolve-form?${query}`, { headers: uid ? { "x-user-uid": uid } : {} }));
  return { status: res.status, body: await res.text() };
};
const q = (formId: string, pageId: string) => `formId=${encodeURIComponent(formId)}&pageId=${encodeURIComponent(pageId)}`;

async function main() {
  await seed();
  try {
    console.log("Builder / Preview resolver route (authenticated)");
    const aa = await call(resolveFormRoute, q(A.form, A.page), A.uid);
    ok(aa.status === 200 && JSON.parse(aa.body).id === A.form, "A member, Page A → Form A: resolves");
    const ab = await call(resolveFormRoute, q(B.form, A.page), A.uid);
    ok(ab.status === 404, "A member, Page A → Form B: blocked (404)");
    const missing = await call(resolveFormRoute, q(`fm_never_${run}`, A.page), A.uid);
    ok(ab.body === missing.body && ab.status === missing.status, "foreign Form answers exactly like a non-existent Form (existence not revealed)");
    ok(!ab.body.includes("Form of") && !ab.body.includes(B.sa), "no foreign Form metadata in the response");
    ok((await call(resolveFormRoute, q(A.form, B.page), B.uid)).status === 404, "B member, Page B → Form A: blocked");
    ok((await call(resolveFormRoute, q(B.form, B.page), A.uid)).status === 404, "A member naming Page B (not their workspace) → Form B: blocked");
    ok((await call(resolveFormRoute, q(B.form, A.page), B.uid)).status === 404, "B member naming Page A (not their workspace): blocked");
    ok((await call(resolveFormRoute, `formId=${A.form}`, A.uid)).status === 404, "no pageId → blocked (a bare form id is never enough)");
    ok((await call(resolveFormRoute, q(A.form, A.page))).status === 404, "unauthenticated → blocked");
    for (const bad of ["", "../forms/x", "a/b", "x".repeat(200), "fm a"]) {
      ok((await call(resolveFormRoute, q(bad, A.page), A.uid)).status === 404, `malformed Form id ${JSON.stringify(bad.slice(0, 12))} → safe 404`);
    }
    await db.doc(`forms/${DELETED}`).set({ agencyId: A.agency, subAccountId: A.sa, name: "to delete", fields: [] });
    await db.doc(`forms/${DELETED}`).delete();
    ok((await call(resolveFormRoute, q(DELETED, A.page), A.uid)).status === 404, "deleted Form → safe 404");
    ok((await call(pocResolveFormRoute, `formId=${B.form}`, A.uid)).status === 404, "prototype resolver route no longer reads arbitrary Forms");

    console.log("Published page + published Popup (the public page's own resolution path)");
    const pageA = (await db.doc(`pages/${A.page}`).get()).data()!;
    const published = normalizePopupMap(pageA.puckPublishedPopups);
    const ids = collectPuckFormIds(withPopupContent(pageA.puckPublishedData, published));
    ok(ids.includes(A.form) && ids.includes(B.form), "Page A + Popup A reference Form A and foreign Form B");
    const resolvedA = await resolveFormsForSubAccount(pageA.subAccountId, ids);
    ok(resolvedA[A.form]?.id === A.form, "published Page A / Popup A → Form A renders");
    ok(resolvedA[B.form] === null, "published Page A / Popup A → Form B never resolves (renders nothing)");
    const pageB = (await db.doc(`pages/${B.page}`).get()).data()!;
    const resolvedB = await resolveFormsForSubAccount(pageB.subAccountId, collectPuckFormIds(pageB.puckPublishedData));
    ok(resolvedB[A.form] === null, "published Page B → Form A never resolves");
    ok((await resolveFormsForSubAccount(null, [A.form]))[A.form] === null, "page without a workspace resolves no Forms");
    ok((await resolveFormsForSubAccount(A.sa, ["../x", DELETED]))["../x"] === null, "malformed / deleted ids resolve to nothing on public pages");

    console.log(`\nForm resolver tenancy QA: ${passed}/${passed} PASS`);
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
