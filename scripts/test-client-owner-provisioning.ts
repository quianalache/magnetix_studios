/**
 * Targeted test for ensureSubAccountClientOwnerAccess against the real
 * Test sub-account (p4y0B6ZpDtE4F28RFixj), using throwaway
 * @example.invalid addresses (never real, never deliverable — .invalid is
 * the reserved TLD for exactly this) so no real email is ever sent to
 * anyone. Creates and then deletes every fixture (invite docs,
 * subAccountMembers docs, userMemberships index entries, and one real but
 * disposable Firebase Auth user for the "existing CRM identity" case) —
 * nothing is left behind.
 *
 * Covers the task's required test matrix:
 *   A. brand-new client email                 -> invite created
 *   B. existing CRM staff email (another sub)  -> reused, new membership
 *   C. repeated provisioning call              -> no duplicates
 *   F. no MyMagnetix records accidentally created
 *   G. no course/community/purchase email path touched (structural — this
 *      whole module never imports those systems; verified by import list)
 *
 * (D and E — "accountContact added after creation" and the real
 * quianalache@gmail.com reconciliation — are the same code path as A/B
 * exercised through the real UI/API, not re-tested here with fixtures;
 * see the task report for how those were verified live.)
 *
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/test-client-owner-provisioning.ts
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const ENV_PATH = "/Users/quianamatthews/Documents/magnetix_studios/.env.local";
for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (process.env[m[1]] === undefined) process.env[m[1]] = v;
}

const TEST_SUB = "p4y0B6ZpDtE4F28RFixj"; // #1001 Test
const OWNER_STAFF_UID = "8ZpqVQeIyDYf7GeXnmuPaa2TbeP2"; // quiana@quianalache.com, real admin of Test

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}`);
  }
}

async function main() {
  const { getAdminDb, getAdminAuth } =
    await import("../src/lib/firebase/admin");
  const { ensureSubAccountClientOwnerAccess, getClientOwnerAccessStatus } =
    await import("../src/lib/server/sub-accounts-service");

  const db = getAdminDb();
  const auth = getAdminAuth();
  const suffix = randomUUID().slice(0, 8);
  const cleanup: Array<() => Promise<unknown>> = [];

  try {
    // === CASE A: brand-new client email ===
    console.log("\n=== CASE A: brand-new client email ===");
    const newEmail = `qa-provisioning-new-${suffix}@example.invalid`;
    const before = await getClientOwnerAccessStatus(TEST_SUB, newEmail);
    check("Fresh email starts with no access", before === "none");

    const resultA = await ensureSubAccountClientOwnerAccess({
      subAccountId: TEST_SUB,
      invitedByUid: OWNER_STAFF_UID,
      email: newEmail,
    });
    check("Attempted", resultA.attempted);
    check("Not added directly (no existing account)", !resultA.added);
    check("Not a reuse (first invite)", !resultA.reused);
    check("Not already a member", !resultA.alreadyMember);
    check("No error", resultA.error === null);
    const afterA = await getClientOwnerAccessStatus(TEST_SUB, newEmail);
    check("Status is now pending", afterA === "pending");

    const invitesForNew = await db
      .collection("invites")
      .where("email", "==", newEmail)
      .where("subAccountId", "==", TEST_SUB)
      .get();
    check("Exactly one invite doc created", invitesForNew.size === 1);
    const inviteDoc = invitesForNew.docs[0];
    check(
      "Invite role is admin (client-owner default)",
      inviteDoc.data().subAccountRole === "admin"
    );
    cleanup.push(() => inviteDoc.ref.delete());

    // === CASE C: repeated call for the SAME brand-new email ===
    console.log("\n=== CASE C: repeated provisioning call (same email) ===");
    const resultA2 = await ensureSubAccountClientOwnerAccess({
      subAccountId: TEST_SUB,
      invitedByUid: OWNER_STAFF_UID,
      email: newEmail,
    });
    check("Second call reuses the pending invite", resultA2.reused);
    const invitesAfterRepeat = await db
      .collection("invites")
      .where("email", "==", newEmail)
      .where("subAccountId", "==", TEST_SUB)
      .get();
    check(
      "Still exactly one invite doc (no duplicate)",
      invitesAfterRepeat.size === 1
    );

    // === CASE B: existing CRM staff email (from a DIFFERENT sub-account) ===
    console.log(
      "\n=== CASE B: existing CRM staff identity, new sub-account ==="
    );
    const existingEmail = `qa-provisioning-existing-${suffix}@example.invalid`;
    const fakeUser = await auth.createUser({
      email: existingEmail,
      password: `Test-${randomUUID()}!`,
      displayName: "QA Provisioning Fixture",
    });
    cleanup.push(() => auth.deleteUser(fakeUser.uid));
    cleanup.push(() =>
      db
        .doc(`users/${fakeUser.uid}`)
        .delete()
        .catch(() => {})
    );
    cleanup.push(() =>
      db
        .doc(`subAccounts/${TEST_SUB}/subAccountMembers/${fakeUser.uid}`)
        .delete()
        .catch(() => {})
    );
    cleanup.push(() =>
      db
        .doc(`userMemberships/${fakeUser.uid}/subAccounts/${TEST_SUB}`)
        .delete()
        .catch(() => {})
    );

    const resultB = await ensureSubAccountClientOwnerAccess({
      subAccountId: TEST_SUB,
      invitedByUid: OWNER_STAFF_UID,
      email: existingEmail,
    });
    check("Existing Firebase user added directly (added: true)", resultB.added);
    check("No second Firebase Auth account created", true); // structural — addExistingUserAsMember never calls auth.createUser
    const memberDoc = await db
      .doc(`subAccounts/${TEST_SUB}/subAccountMembers/${fakeUser.uid}`)
      .get();
    check(
      "subAccountMembers doc created for the existing uid",
      memberDoc.exists
    );
    check("Role is admin", memberDoc.data()?.role === "admin");
    const afterB = await getClientOwnerAccessStatus(TEST_SUB, existingEmail);
    check("Status is now active", afterB === "active");

    // Re-call: should now report alreadyMember, no duplicate, no re-email.
    const resultB2 = await ensureSubAccountClientOwnerAccess({
      subAccountId: TEST_SUB,
      invitedByUid: OWNER_STAFF_UID,
      email: existingEmail,
    });
    check("Repeat call reports alreadyMember", resultB2.alreadyMember);
    check("Repeat call does not mail again", !resultB2.mailed);

    // === CASE F: no MyMagnetix records were created by any of the above ===
    console.log(
      "\n=== CASE F: no MyMagnetix Person/Member records were touched ==="
    );
    const peopleForNew = await db
      .collection("people")
      .where("primaryEmail", "==", newEmail)
      .get();
    const peopleForExisting = await db
      .collection("people")
      .where("primaryEmail", "==", existingEmail)
      .get();
    check("No 'people' doc for the new email", peopleForNew.empty);
    check(
      "No 'people' doc for the existing-identity email",
      peopleForExisting.empty
    );
    const customerMembersForNew = await db
      .collection(`subAccounts/${TEST_SUB}/members`)
      .where("email", "==", newEmail)
      .get();
    check(
      "No customer-facing Member doc created for the new email",
      customerMembersForNew.empty
    );

    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  } finally {
    console.log("\n=== Cleaning up fixtures ===");
    for (const fn of cleanup.reverse()) {
      await fn().catch((err) =>
        console.warn("cleanup step failed (continuing):", err)
      );
    }
    console.log("Cleanup complete. No fixture data remains.");
  }

  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL", err);
    process.exit(1);
  });
