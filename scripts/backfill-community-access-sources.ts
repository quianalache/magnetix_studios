/**
 * Legacy Product -> Community access-source reconciliation (2026-09-11).
 *
 * Backfills `communityGroups/{groupId}/memberships/{memberId}/accessSources/
 * product:{courseId}` for members who currently hold PROVEN, real
 * Standalone Product entitlement — using the exact same canonical
 * `checkStandaloneCourseEntitlementForMember` the live app uses everywhere
 * else, imported directly from `src/lib/standalone-courses/course-access.ts`
 * (not a reimplementation) — to a course linked to a Community they were
 * already a member of before the 2026-09-11 lifecycle fix (commit 77302fe)
 * existed.
 *
 * Deliberately narrow scope, matching the task's own framing of the
 * problem ("an existing customer may currently have ... Community
 * membership but no accessSources record"):
 *   - Only writes a source for a (member, course, group) triple where a
 *     membership document ALREADY EXISTS. It never creates a new
 *     Community membership for someone entitled to a linked Product but
 *     never actually a member of that Community — doing that would also
 *     fire the live grant flow's join notification/webhook for something
 *     that, from the member's perspective, isn't happening right now;
 *     that's a real product decision for the owner, not something to make
 *     unilaterally inside a backfill. Counted and reported separately,
 *     never written.
 *   - Never sets `membership.origin`. Proving "this membership was
 *     created SOLELY by Product access, with no independent membership
 *     existing before it" would need an audit trail this data doesn't
 *     have — a membership's `joinedAt` next to an enrollment's
 *     `enrolledAt` is not proof of which came first or why. Per this
 *     task's own instruction: when provenance can't be proven, leave
 *     `origin` untouched — accurate bookkeeping now, without ever risking
 *     a manual member's membership becoming silently auto-revocable later.
 *
 * Idempotent: writes through the real
 * `upsertProductAccessSourceServerSide` (same deterministic
 * `product:{courseId}` doc id, same upsert semantics the live grant flow
 * uses) — running this script twice produces the same end state, no
 * duplicates, no behavioral difference.
 *
 * Usage — NODE_OPTIONS loads _server-only-shim.cjs BEFORE tsx starts (see
 * that file's own comment for why this can't be done from inside this
 * script instead: it needs to intercept "server-only" before tsx's own
 * module hooks are set up, and Module._load patched here would be too late):
 *   NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/backfill-community-access-sources.ts                 # dry run (default)
 *   NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/backfill-community-access-sources.ts --apply         # write
 *   NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/backfill-community-access-sources.ts --subaccount=ID # scope to one sub-account
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Minimal, dependency-free .env.local loader — this script is committed,
// reusable tooling, so it avoids relying on `dotenv` (present in
// node_modules only transitively, not a listed dependency; fine for a
// throwaway script, not safe to depend on for something meant to keep
// working after a future `pnpm install`).
function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
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

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();

// Real production code, imported unmodified — not reimplemented.
import { checkStandaloneCourseEntitlementForMember } from "../src/lib/standalone-courses/course-access";
import { upsertProductAccessSourceServerSide } from "../src/lib/server/community-access-source-service";
import type { StandaloneCourse } from "../src/types/standalone-courses";

const APPLY = process.argv.includes("--apply");
const subAccountArg = process.argv.find((a) => a.startsWith("--subaccount="));
const SCOPE_SUB_ACCOUNT_ID = subAccountArg ? subAccountArg.split("=")[1] : null;

interface Counters {
  productsWithLinks: number;
  linkedRelationships: number;
  candidatePairsChecked: number;
  currentlyEntitledPairs: number;
  expectedSourceRelationships: number;
  alreadyPresent: number;
  missingWithMembership: number;
  missingWithoutMembership: number;
  affectedMemberships: Set<string>;
}

async function main() {
  const counters: Counters = {
    productsWithLinks: 0,
    linkedRelationships: 0,
    candidatePairsChecked: 0,
    currentlyEntitledPairs: 0,
    expectedSourceRelationships: 0,
    alreadyPresent: 0,
    missingWithMembership: 0,
    missingWithoutMembership: 0,
    affectedMemberships: new Set(),
  };
  const toWrite: {
    subAccountId: string;
    groupId: string;
    memberId: string;
    courseId: string;
  }[] = [];
  const anomalies: string[] = [];

  const subAccountsSnap = SCOPE_SUB_ACCOUNT_ID
    ? [await db.doc(`subAccounts/${SCOPE_SUB_ACCOUNT_ID}`).get()]
    : (await db.collection("subAccounts").get()).docs;

  for (const saDoc of subAccountsSnap) {
    if (!saDoc.exists) continue;
    const saId = saDoc.id;
    const coursesSnap = await db
      .collection(`subAccounts/${saId}/standaloneCourses`)
      .get();

    for (const courseDoc of coursesSnap.docs) {
      const data = courseDoc.data() as Omit<StandaloneCourse, "id">;
      const linkedCommunityGroupIds = data.linkedCommunityGroupIds ?? [];
      if (linkedCommunityGroupIds.length === 0) continue;
      counters.productsWithLinks += 1;
      counters.linkedRelationships += linkedCommunityGroupIds.length;

      const course: StandaloneCourse = { id: courseDoc.id, ...data };
      if (!course.published) {
        anomalies.push(
          `SA ${saId} course ${course.id}: linked but NOT published (skipped — an unpublished course isn't the live entitlement source of truth right now).`
        );
        continue;
      }

      // Candidate pool = real enrollment docs only — proves an actual
      // relationship exists. Never inferred from Community membership
      // (task section 4), and never assumed for "open" access just
      // because it's free (task section 10) — an "open" course still
      // needs a real enrollment doc here; checkStandaloneCourseEntitlementForMember
      // itself doesn't require one (nothing to check for "open"), so the
      // enrollment-doc requirement is what keeps this scoped to members
      // who actually enrolled.
      const enrollmentsSnap = await db
        .collection(
          `subAccounts/${saId}/standaloneCourses/${course.id}/enrollments`
        )
        .get();

      for (const enrollDoc of enrollmentsSnap.docs) {
        const memberId = enrollDoc.id;
        counters.candidatePairsChecked += 1;
        const entitled = await checkStandaloneCourseEntitlementForMember(
          course,
          memberId
        );
        if (!entitled) continue;
        counters.currentlyEntitledPairs += 1;

        for (const groupId of linkedCommunityGroupIds) {
          counters.expectedSourceRelationships += 1;
          const memRef = db.doc(
            `subAccounts/${saId}/communityGroups/${groupId}/memberships/${memberId}`
          );
          const memSnap = await memRef.get();
          if (!memSnap.exists) {
            counters.missingWithoutMembership += 1;
            continue;
          }
          const sourceSnap = await memRef
            .collection("accessSources")
            .doc(`product:${course.id}`)
            .get();
          if (sourceSnap.exists && sourceSnap.data()?.status === "active") {
            counters.alreadyPresent += 1;
            continue;
          }
          counters.missingWithMembership += 1;
          counters.affectedMemberships.add(`${saId}:${groupId}:${memberId}`);
          toWrite.push({
            subAccountId: saId,
            groupId,
            memberId,
            courseId: course.id,
          });
        }
      }
    }
  }

  console.log("=== DRY-RUN INVENTORY ===");
  console.log(
    "Standalone Products with linked Community Groups:",
    counters.productsWithLinks
  );
  console.log(
    "Linked Product<->Community relationships:",
    counters.linkedRelationships
  );
  console.log(
    "Candidate (member, course) pairs checked (real enrollments):",
    counters.candidatePairsChecked
  );
  console.log(
    "Currently-entitled (member, course) pairs (proven via canonical check):",
    counters.currentlyEntitledPairs
  );
  console.log(
    "Expected accessSource relationships (entitled pair x linked group):",
    counters.expectedSourceRelationships
  );
  console.log("Already present + active:", counters.alreadyPresent);
  console.log(
    "Missing, membership EXISTS (will backfill):",
    counters.missingWithMembership
  );
  console.log(
    "Missing, NO membership exists (NOT backfilled — see doc comment):",
    counters.missingWithoutMembership
  );
  console.log(
    "Distinct affected memberships:",
    counters.affectedMemberships.size
  );
  console.log(
    "origin backfill: NONE — see doc comment (provenance cannot be proven from this data)"
  );
  if (anomalies.length) {
    console.log("\nAnomalies:");
    anomalies.forEach((a) => console.log(" -", a));
  }

  if (!APPLY) {
    console.log(
      "\nDry run only — no writes made. Re-run with --apply to write."
    );
    return;
  }

  console.log(`\n=== APPLYING ${toWrite.length} writes ===`);
  for (const w of toWrite) {
    await upsertProductAccessSourceServerSide({
      subAccountId: w.subAccountId,
      groupId: w.groupId,
      memberId: w.memberId,
      courseId: w.courseId,
    });
  }
  console.log(
    `Wrote/confirmed ${toWrite.length} accessSource records. origin left untouched on every membership.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
