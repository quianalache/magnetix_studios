/**
 * Agency Communications "Sub-account owners" audience = each sub-account's
 * Account Contact email (owner decision 2026-10-16) — EMULATOR ONLY
 * (Firestore, `demo-*` project, no production credentials). Exercises the
 * REAL resolver (agency-communications-audience-service.resolveAgencyAudience)
 * against isolated fixtures. Sends nothing.
 *
 * Run:
 *   echo '{"emulators":{"firestore":{"port":8080}}}' > /tmp/emu-ao/firebase.json
 *   firebase emulators:exec --config /tmp/emu-ao/firebase.json --only firestore --project demo-owner-audience \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' ./node_modules/.bin/tsx scripts/check-agency-owner-audience.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-owner-audience";
if (!process.env.FIRESTORE_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: needs the Firestore emulator, a demo-* project and no production credentials.");
  process.exit(2);
}
initializeApp({ projectId: PROJECT });
const db = getFirestore();

const AG = "ag-1";
const OTHER_AG = "ag-2";
const OWNER_UID = "agency-owner-uid";
const OWNER_EMAIL = "owner@agency.test";

async function seedSub(id: string, data: Record<string, unknown>, admins: { uid: string; email: string }[] = []) {
  await db.doc(`subAccounts/${id}`).set({ name: id, agencyId: AG, createdByUid: OWNER_UID, ...data });
  for (const a of admins) {
    await db.doc(`subAccounts/${id}/subAccountMembers/${a.uid}`).set({ uid: a.uid, subAccountId: id, agencyId: data.agencyId ?? AG, role: "admin", status: "active", email: a.email, addedByUid: a.uid });
  }
}

async function main() {
  const { resolveAgencyAudience } = await import("../src/lib/server/agency-communications-audience-service");
  const ownerAdmin = { uid: OWNER_UID, email: OWNER_EMAIL };

  // A: valid Account Contact; F: agency owner has an admin row (access) but is NOT the Account Contact.
  await seedSub("sa-a", { accountContact: { name: "Client A", email: "  Client.A@Example.COM ", phone: null }, billing: { planId: "plan-pro" } }, [ownerAdmin, { uid: "client-a-admin", email: "admin-a@example.com" }]);
  // B: no Account Contact email (name/phone only) and a null Account Contact.
  await seedSub("sa-b1", { accountContact: { name: "No Email", email: null, phone: "+15550000" }, billing: { planId: "plan-pro" } }, [ownerAdmin]);
  await seedSub("sa-b2", { accountContact: null }, [ownerAdmin]);
  // Invalid email (fails the same rule the Account Contact form saves with).
  await seedSub("sa-bad", { accountContact: { name: "Bad", email: "not-an-email", phone: null } }, [ownerAdmin]);
  // C: two sub-accounts share one Account Contact email.
  await seedSub("sa-c1", { accountContact: { name: "Shared", email: "shared@example.com", phone: null }, billing: { planId: "plan-basic" } }, [ownerAdmin]);
  await seedSub("sa-c2", { accountContact: { name: "Shared Too", email: "SHARED@example.com", phone: null }, billing: { planId: "plan-basic" } }, [ownerAdmin]);
  // E: Account Contact differs from createdByUid (creator is someone else entirely).
  await seedSub("sa-e", { createdByUid: "provisioner-uid", accountContact: { name: "E Contact", email: "e-contact@example.com", phone: null } }, [{ uid: "provisioner-uid", email: "provisioner@example.com" }]);
  // G: the agency owner IS the Account Contact on their own sub-account.
  await seedSub("sa-g", { accountContact: { name: "Agency Owner", email: OWNER_EMAIL, phone: null } }, [ownerAdmin]);
  // Tenancy: another agency's sub-account with a valid Account Contact.
  await seedSub("sa-other", { agencyId: OTHER_AG, accountContact: { name: "Other Agency", email: "other-agency@example.com", phone: null }, billing: { planId: "plan-pro" } }, [{ uid: "x", email: "x@example.com" }]);
  // Regression: an existing Agency audience (Standalone Course roster via people/{id}).
  await db.doc(`agencies/${AG}/standaloneCourses/course-1`).set({ title: "Course One", agencyId: AG });
  await db.doc(`agencies/${AG}/standaloneCourses/course-1/enrollments/person-1`).set({ personId: "person-1" });
  await db.doc(`people/person-1`).set({ primaryEmail: "learner@example.com" });

  let pass = 0;
  const check = async (label: string, fn: () => Promise<void>) => {
    await fn();
    pass++;
    console.log(`  PASS  ${label}`);
  };

  const all = await resolveAgencyAudience(AG, [{ kind: "subAccountOwners" }]);
  const emails = all.map((r) => r.email).sort();

  await check("A: valid Account Contact email included (trimmed + lowercased)", async () => {
    assert.ok(emails.includes("client.a@example.com"));
  });
  await check("B: missing / null Account Contact email excluded", async () => {
    assert.ok(!all.some((r) => ["sa-b1", "sa-b2"].includes(r.identity.id)));
  });
  await check("invalid Account Contact email excluded", async () => {
    assert.ok(!emails.includes("not-an-email"));
  });
  await check("C: shared Account Contact email → one recipient", async () => {
    assert.equal(emails.filter((e) => e === "shared@example.com").length, 1);
  });
  await check("E: Account Contact wins over createdByUid / admin rows", async () => {
    assert.ok(emails.includes("e-contact@example.com"));
    assert.ok(!emails.includes("provisioner@example.com"));
  });
  await check("F: agency owner NOT included through admin access alone; admin members never used", async () => {
    // The owner holds an admin row in every fixture sub-account, but is the
    // Account Contact only on sa-g — they appear exactly once, from sa-g.
    const ownerRows = all.filter((r) => r.email === OWNER_EMAIL);
    assert.equal(ownerRows.length, 1);
    assert.equal(ownerRows[0].identity.id, "sa-g");
    assert.ok(!emails.includes("admin-a@example.com"));
  });
  await check("G: agency owner included as the Account Contact of their own sub-account", async () => {
    assert.ok(emails.includes(OWNER_EMAIL));
  });
  await check("identity is the Account Contact of a sub-account (audit)", async () => {
    assert.ok(all.every((r) => r.identity.kind === "accountContact"));
  });
  await check("tenancy: another agency's Account Contact never appears", async () => {
    assert.ok(!emails.includes("other-agency@example.com"));
  });
  await check("exact All sub-account owners result", async () => {
    assert.deepEqual(emails, ["client.a@example.com", "e-contact@example.com", OWNER_EMAIL, "shared@example.com"].sort());
  });

  await check("D: plan-filtered → only matching sub-accounts, agency-scoped", async () => {
    const pro = (await resolveAgencyAudience(AG, [{ kind: "planCohort", planIds: ["plan-pro"] }])).map((r) => r.email);
    assert.deepEqual(pro, ["client.a@example.com"]); // sa-b1 (no email) + sa-other (other agency) excluded
    const basic = (await resolveAgencyAudience(AG, [{ kind: "planCohort", planIds: ["plan-basic"] }])).map((r) => r.email);
    assert.deepEqual(basic, ["shared@example.com"]); // deduped across sa-c1 + sa-c2
    const both = (await resolveAgencyAudience(AG, [{ kind: "planCohort", planIds: ["plan-pro", "plan-basic"] }])).map((r) => r.email).sort();
    assert.deepEqual(both, ["client.a@example.com", "shared@example.com"]);
    const none = await resolveAgencyAudience(AG, [{ kind: "planCohort", planIds: ["plan-nobody"] }]);
    assert.equal(none.length, 0);
  });

  await check("H: an agency with no Account Contact emails → 0 recipients", async () => {
    assert.equal((await resolveAgencyAudience("ag-empty", [{ kind: "subAccountOwners" }])).length, 0);
  });

  await check("regression: existing Course audience unchanged + merges/dedupes with owners", async () => {
    const course = await resolveAgencyAudience(AG, [{ kind: "course", courseId: "course-1" }]);
    assert.deepEqual(course.map((r) => r.email), ["learner@example.com"]);
    const merged = await resolveAgencyAudience(AG, [{ kind: "subAccountOwners" }, { kind: "course", courseId: "course-1" }]);
    assert.equal(merged.length, 5);
  });

  await check("no write happened: resolver is read-only (fixture docs untouched)", async () => {
    const snap = await db.doc("subAccounts/sa-a").get();
    assert.equal(snap.data()?.accountContact?.email, "  Client.A@Example.COM ");
  });

  console.log(`\nAgency owner audience (Account Contact): ${pass} passed, 0 failed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
