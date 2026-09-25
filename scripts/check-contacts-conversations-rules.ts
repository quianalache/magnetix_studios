/**
 * Firestore security-rule checks for the Contacts + Conversations
 * integration (2026-09-25). EMULATOR ONLY — refuses to run unless
 * FIRESTORE_EMULATOR_HOST is set and the project id is a `demo-*` project,
 * so it can never touch a real database. Seeds isolated fixtures with the
 * Admin SDK (which bypasses rules), then exercises the rules with the
 * client SDK under mock auth tokens carrying our custom claims.
 *
 * Run:
 *   firebase emulators:exec --only firestore --project demo-contacts-rules \
 *     "pnpm exec tsx scripts/check-contacts-conversations-rules.ts"
 */
import { initializeApp as initAdmin } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  type Firestore,
} from "firebase/firestore";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-contacts-rules";
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST || !PROJECT.startsWith("demo-")) {
  console.error("Refusing to run: needs FIRESTORE_EMULATOR_HOST and a demo-* project.");
  process.exit(2);
}
const [host, portStr] = HOST.split(":");

const AG = "ag1";
const SA = "sa1"; // territory scoping ON
const SA_OTHER = "sa2";

async function seed() {
  const admin = getAdminFirestore(initAdmin({ projectId: PROJECT }, "seed"));
  const w = (path: string, data: Record<string, unknown>) => admin.doc(path).set(data);
  await w(`subAccounts/${SA}`, { agencyId: AG, name: "Scoped", territoryScopingEnabled: true });
  await w(`subAccounts/${SA_OTHER}`, { agencyId: AG, name: "Other" });
  await w(`subAccounts/${SA}/subAccountMembers/collab`, {
    status: "active", role: "collaborator", assignedTerritoryIds: ["t1"],
  });
  await w(`subAccounts/${SA}/subAccountMembers/admin`, { status: "active", role: "admin" });
  await w(`subAccounts/${SA_OTHER}/subAccountMembers/outsider`, { status: "active", role: "admin" });
  for (const [id, territoryId] of [["cT1", "t1"], ["cT2", "t2"]] as const) {
    await w(`contacts/${id}`, { subAccountId: SA, agencyId: AG, territoryId, name: id, tags: [] });
    await w(`contacts/${id}/notes/n1`, { content: "note", createdBy: "admin" });
    await w(`contacts/${id}/activities/a1`, { type: "email_sent", content: "x", createdBy: "admin" });
    await w(`contacts/${id}/messages/m1`, { body: "hi", direction: "inbound", readAt: null });
    await w(`conversations/${id}`, {
      subAccountId: SA, agencyId: AG, contactId: id, unreadCount: 1, status: "open",
    });
  }
  await w(`contactLists/l1`, { subAccountId: SA, agencyId: AG, name: "VIP" });
}

let appN = 0;
function clientAs(uid: string, claims: Record<string, unknown>): Firestore {
  const app: FirebaseApp = initializeApp({ projectId: PROJECT }, `u${appN++}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, Number(portStr), {
    mockUserToken: { sub: uid, user_id: uid, ...claims },
  });
  return db;
}

const member = { status: "active", agencyId: AG, agencyRole: null };
const users = {
  collab: clientAs("collab", member),
  admin: clientAs("admin", member),
  owner: clientAs("owner", { status: "active", agencyId: AG, agencyRole: "owner" }),
  outsider: clientAs("outsider", member),
};

let failures = 0;
let passes = 0;
async function expect(label: string, allowed: boolean, op: () => Promise<unknown>) {
  let ok: boolean;
  let detail = "";
  try {
    await op();
    ok = allowed;
    if (!ok) detail = "was ALLOWED";
  } catch (err) {
    const code = (err as { code?: string }).code;
    ok = !allowed && code === "permission-denied";
    if (!ok) detail = `threw ${code ?? String(err)}`;
  }
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${allowed ? "allow" : "deny "}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  await seed();
  const { collab, admin, owner, outsider } = users;

  // Notes — Codex's territory-scoped read + the Contacts branch's server-only writes.
  await expect("collab reads note on in-territory contact", true, () => getDoc(doc(collab, "contacts/cT1/notes/n1")));
  await expect("collab reads note on out-of-territory contact", false, () => getDoc(doc(collab, "contacts/cT2/notes/n1")));
  await expect("admin reads note on any contact", true, () => getDoc(doc(admin, "contacts/cT2/notes/n1")));
  await expect("outsider (other sub-account) reads note", false, () => getDoc(doc(outsider, "contacts/cT1/notes/n1")));
  await expect("collab creates note from the browser", false, () => addDoc(collection(collab, "contacts/cT1/notes"), { content: "x", createdBy: "collab" }));
  await expect("admin creates note with spoofed author", false, () => addDoc(collection(admin, "contacts/cT1/notes"), { content: "x", createdBy: "someone-else" }));
  await expect("owner edits a note from the browser", false, () => updateDoc(doc(owner, "contacts/cT1/notes/n1"), { content: "edited" }));
  await expect("admin deletes a note from the browser", false, () => deleteDoc(doc(admin, "contacts/cT1/notes/n1")));

  // Activities — read-only audit trail.
  await expect("collab reads activity", true, () => getDoc(doc(collab, "contacts/cT1/activities/a1")));
  await expect("admin writes activity from the browser", false, () => setDoc(doc(admin, "contacts/cT1/activities/a2"), { type: "note_added", content: "x" }));
  await expect("owner deletes activity from the browser", false, () => deleteDoc(doc(owner, "contacts/cT1/activities/a1")));

  // Message threads — Codex's territory scoping, readAt-only client update.
  await expect("collab reads SMS on in-territory contact", true, () => getDoc(doc(collab, "contacts/cT1/messages/m1")));
  await expect("collab reads SMS on out-of-territory contact", false, () => getDoc(doc(collab, "contacts/cT2/messages/m1")));
  await expect("collab marks SMS read (readAt only)", true, () => updateDoc(doc(collab, "contacts/cT1/messages/m1"), { readAt: new Date() }));
  await expect("collab edits SMS body", false, () => updateDoc(doc(collab, "contacts/cT1/messages/m1"), { body: "tampered" }));
  await expect("admin creates SMS from the browser", false, () => setDoc(doc(admin, "contacts/cT1/messages/m2"), { body: "spoof", direction: "inbound" }));

  // Conversations index — Codex's territory scoping.
  await expect("collab reads in-territory conversation", true, () => getDoc(doc(collab, "conversations/cT1")));
  await expect("collab reads out-of-territory conversation", false, () => getDoc(doc(collab, "conversations/cT2")));
  await expect("collab marks conversation read", true, () => updateDoc(doc(collab, "conversations/cT1"), { unreadCount: 0 }));
  await expect("collab re-tenants a conversation", false, () => updateDoc(doc(collab, "conversations/cT1"), { subAccountId: SA_OTHER }));
  await expect("admin edits denormalized preview", false, () => updateDoc(doc(admin, "conversations/cT1"), { lastMessagePreview: "x" }));

  // Contact Lists — server-only.
  await expect("owner reads a contact list directly", false, () => getDoc(doc(owner, "contactLists/l1")));
  await expect("admin writes a contact list directly", false, () => setDoc(doc(admin, "contactLists/l2"), { subAccountId: SA, name: "x" }));

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
