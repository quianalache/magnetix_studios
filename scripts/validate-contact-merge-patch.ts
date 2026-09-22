/**
 * READ-ONLY validation of the contact-merge.ts patch's new query shapes.
 * Does not call performContactMerge and makes no writes. Confirms each new
 * repoint query (Member.contactId, ExternalSubscription.contactId,
 * ExternalPayment.contactId, Project.assignedContactId) actually finds the
 * real docs we know exist from the audits, and that the field names match
 * production data exactly (a typo'd field name would silently return zero
 * docs and pass a naive test, so every assertion below is checked against a
 * KNOWN NON-ZERO case first).
 *
 * Run:
 *   NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" \
 *     SUBACCOUNT_ID=xvnedVCmQpEvHrcPhEDI \
 *     pnpm exec tsx scripts/validate-contact-merge-patch.ts
 */
import { existsSync, readFileSync } from "node:fs";

function loadEnvLocal() {
  const envPath = "/Users/quianamatthews/Documents/magnetix_studios/.env.local";
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvLocal();

import { getAdminDb } from "../src/lib/firebase/admin";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`PASS: ${msg}`);
  } else {
    console.log(`FAIL: ${msg}`);
    failures++;
  }
}

async function main() {
  const subAccountId = process.env.SUBACCOUNT_ID;
  if (!subAccountId) throw new Error("SUBACCOUNT_ID env var required");
  const db = getAdminDb();

  // 1. Member.contactId — known case from the member-activation audit:
  // Heather Goodyear, memberId=2gq0cbtpssdrpNeRmC37, contactId=3NoDEmGY0nPKq45FAC1Z
  const knownMemberContactId = "3NoDEmGY0nPKq45FAC1Z";
  const memberSnap = await db
    .collection(`subAccounts/${subAccountId}/members`)
    .where("contactId", "==", knownMemberContactId)
    .get();
  assert(
    memberSnap.size === 1 && memberSnap.docs[0].id === "2gq0cbtpssdrpNeRmC37",
    `members query finds the known Heather Goodyear member doc via contactId=${knownMemberContactId} (found ${memberSnap.size})`,
  );

  // 2. ExternalSubscription.contactId — known case from the duplicate-
  // contact audit: quianalache@gmail.com's canonical contact.
  const knownSubContactId = "2IciPp3MZb6n0wSvFuVq";
  const subSnap = await db
    .collection("externalSubscriptions")
    .where("subAccountId", "==", subAccountId)
    .where("contactId", "==", knownSubContactId)
    .get();
  assert(
    subSnap.size >= 1,
    `externalSubscriptions query finds >=1 doc via contactId=${knownSubContactId} (found ${subSnap.size})`,
  );

  // 3. ExternalPayment.contactId — same known contact.
  const paySnap = await db
    .collection("externalPayments")
    .where("subAccountId", "==", subAccountId)
    .where("contactId", "==", knownSubContactId)
    .get();
  assert(
    paySnap.size >= 1,
    `externalPayments query finds >=1 doc via contactId=${knownSubContactId} (found ${paySnap.size})`,
  );

  // 4. Project.assignedContactId — no duplicate group touched this per the
  // audit, so instead confirm the query executes and the FIELD NAME is
  // real (not a typo) by checking at least one project in the sub-account
  // carries a non-null assignedContactId, then round-tripping a query for
  // THAT exact value.
  const anyProjectSnap = await db
    .collection("projects")
    .where("subAccountId", "==", subAccountId)
    .limit(50)
    .get();
  const assigned = anyProjectSnap.docs.find(
    (d) => typeof d.data().assignedContactId === "string" && d.data().assignedContactId,
  );
  if (assigned) {
    const targetId = assigned.data().assignedContactId as string;
    const projSnap = await db
      .collection("projects")
      .where("subAccountId", "==", subAccountId)
      .where("assignedContactId", "==", targetId)
      .get();
    assert(
      projSnap.size >= 1 && projSnap.docs.some((d) => d.id === assigned.id),
      `projects query finds the known assigned project via assignedContactId=${targetId} (found ${projSnap.size})`,
    );
  } else {
    console.log(
      "SKIP: no project in this sub-account currently has assignedContactId set — field-name correctness confirmed structurally (matches src/types/projects.ts) but not round-tripped against a live doc.",
    );
  }

  // 5. Negative check — a random non-existent contactId returns zero docs
  // for all four new queries (proves the queries are properly scoped, not
  // accidentally matching everything).
  const bogusId = "zzz-does-not-exist-zzz";
  const [m0, s0, p0, pr0] = await Promise.all([
    db.collection(`subAccounts/${subAccountId}/members`).where("contactId", "==", bogusId).get(),
    db.collection("externalSubscriptions").where("subAccountId", "==", subAccountId).where("contactId", "==", bogusId).get(),
    db.collection("externalPayments").where("subAccountId", "==", subAccountId).where("contactId", "==", bogusId).get(),
    db.collection("projects").where("subAccountId", "==", subAccountId).where("assignedContactId", "==", bogusId).get(),
  ]);
  assert(m0.size === 0, "members query returns 0 for a non-existent contactId");
  assert(s0.size === 0, "externalSubscriptions query returns 0 for a non-existent contactId");
  assert(p0.size === 0, "externalPayments query returns 0 for a non-existent contactId");
  assert(pr0.size === 0, "projects query returns 0 for a non-existent assignedContactId");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
