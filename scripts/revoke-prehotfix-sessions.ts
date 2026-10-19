/**
 * Option B from the 2026-10-19 sign-up security follow-up — selectively
 * revoke sessions that MAY have been minted by the pre-hotfix instant
 * sign-up flow. OWNER APPROVAL REQUIRED before running with --apply.
 *
 * Scope (the only identities a vulnerable flow could have issued sessions
 * for):
 *  - Members of sub-accounts whose Offer/course sign-up was publicly
 *    reachable (Standalone Courses on + at least one published Offer or
 *    course). Their member sessions get `sessionsValidAfter = HOTFIX_MS`.
 *  - The MyMagnetix person linked to each of those Members (a member
 *    session could be bridged into a person session). Same stamp.
 *  - Agency Offers/courses: only included if any were published.
 *
 * Effect: sessions issued before the hotfix deployed stop working; anyone
 * affected signs in again with an email link or password. Sessions issued
 * after the hotfix are untouched. An existing later `sessionsValidAfter`
 * is never moved backwards.
 *
 * Dry run (default — reads only, prints counts):
 *   node --env-file=.env.local --import tsx scripts/revoke-prehotfix-sessions.ts
 * Apply (writes; owner-approved only):
 *   node --env-file=.env.local --import tsx scripts/revoke-prehotfix-sessions.ts --apply
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";

/** Production deploy of 03746ce (dpl_6BNcQEPucRBCnFH2V1f7cGViCGSS) went
 *  live at 2026-10-19 14:19:05 UTC; earlier sessions are in scope. */
const HOTFIX_MS = Date.parse("2026-10-19T14:19:05Z");
const APPLY = process.argv.includes("--apply");

delete process.env.FIRESTORE_EMULATOR_HOST;
initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

async function main() {
  const targets = new Map<string, DocumentReference>();
  const reachable: string[] = [];
  const courseSubs = await db
    .collection("subAccounts")
    .where("standaloneCoursesEnabledByAgency", "==", true)
    .get();
  for (const sa of courseSubs.docs) {
    const [offers, courses] = await Promise.all([
      sa.ref.collection("courseOffers").where("visibility", "==", "published").limit(1).get(),
      sa.ref.collection("standaloneCourses").where("published", "==", true).limit(1).get(),
    ]);
    if (offers.empty && courses.empty) continue;
    reachable.push(sa.id);
    const members = await sa.ref.collection("members").get();
    for (const m of members.docs) {
      targets.set(m.ref.path, m.ref);
      const personId = m.get("personId");
      if (typeof personId === "string" && personId) {
        const ref = db.doc(`people/${personId}`);
        targets.set(ref.path, ref);
      }
    }
  }

  let agencyPublished = 0;
  for (const a of (await db.collection("agencies").get()).docs) {
    agencyPublished += (await a.ref.collection("courseOffers").where("visibility", "==", "published").get()).size;
    agencyPublished += (await a.ref.collection("standaloneCourses").where("published", "==", true).get()).size;
  }
  if (agencyPublished > 0) {
    console.log(`Agency Offers/courses published: ${agencyPublished} — every person is in scope.`);
    for (const p of (await db.collection("people").get()).docs) targets.set(p.ref.path, p.ref);
  }

  const members = [...targets.keys()].filter((k) => k.startsWith("subAccounts/")).length;
  const people = targets.size - members;
  console.log(`Sub-accounts with public sign-up: ${reachable.length}`);
  console.log(`In scope: ${members} members, ${people} people`);

  if (!APPLY) {
    console.log("Dry run — nothing written. Re-run with --apply after owner approval.");
    return;
  }
  let written = 0;
  for (const ref of targets.values()) {
    const changed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const current = snap.get("sessionsValidAfter");
      if (typeof current === "number" && current >= HOTFIX_MS) return false;
      tx.set(ref, { sessionsValidAfter: HOTFIX_MS }, { merge: true });
      return true;
    });
    if (changed) written++;
  }
  console.log(`Applied: ${written} records now reject sessions issued before ${new Date(HOTFIX_MS).toISOString()}.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
