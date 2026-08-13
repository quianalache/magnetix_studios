import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * One-time historical Energetic Profile migration — Phase 3 Task 3
 * (2026-08-13). Backfills `profileId` onto existing EnergeticDecoderReading
 * docs that predate Task 2, creating or reusing EnergeticProfile docs as
 * needed. Uses the SAME matching rule as live reading creation
 * (energetic-profile-service.ts's findMatchingProfile: exact birthDate +
 * birthTime + normalized birthPlace + timeZone, within one Contact, never
 * name/email alone) so migrated data and newly-created data agree on
 * "same person" identically.
 *
 * Modes:
 *   node scripts/migrate-energetic-profiles.mjs              -> dry run (default, zero writes)
 *   node scripts/migrate-energetic-profiles.mjs --live        -> REAL WRITES, requires --live explicitly
 *
 * Live mode is NOT invoked as part of Task 3 — dry run only, per explicit
 * instruction. The --live path below exists (so this script doesn't need
 * to be rewritten later) but is intentionally never run in this session.
 *
 * Idempotent: reruns are safe because (a) any Reading that already has a
 * profileId is skipped entirely, and (b) within one run, readings sharing
 * a (contactId, birth-signature) group are only ever assigned to ONE
 * newly-created Profile — a second migration run would find that Profile
 * already exists (its birth data matches) and reuse it via the same
 * matching rule live creation already uses, never creating a duplicate.
 *
 * Rollback design (not executed by this script): every live-mode write is
 * both printed to stdout AND tagged in Firestore itself, so a future
 * rollback script doesn't depend solely on a saved log file --
 *   - every Profile this migration creates gets `createdByMigration:
 *     "phase3-task3-2026-08-13"` (a real, queryable field, not a comment).
 *   - every Reading this migration touches is only ever moved from
 *     profileId === undefined/null to a real id -- rollback for a Reading
 *     is simply unsetting profileId, safe because a reading whose
 *     profileId still matches what migration wrote could not have been
 *     independently re-assigned since (nothing else in the app writes
 *     profileId onto an EXISTING reading).
 *   - rollback for a Profile: delete only if createdByMigration matches
 *     this run AND it currently has zero Readings pointing at it (re-check
 *     at rollback time, not just trust the original log, in case a real
 *     new reading reused it in the meantime via the normal matching path).
 * A separate rollback script would be written only if actually needed.
 */

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[m[1]] = v;
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = getFirestore();
const MIGRATION_TAG = "phase3-task3-2026-08-13";

function normalizePlace(place) {
  return (place || "").trim().toLowerCase();
}

function birthSignature(r) {
  return [r.birthDate, r.birthTime, normalizePlace(r.birthPlace), r.timeZone].join("|");
}

async function main() {
  const live = process.argv.includes("--live");

  console.log(`=== Energetic Profile Migration — ${live ? "LIVE MODE" : "DRY RUN"} ===\n`);

  // 1. All readings, split into already-migrated (has profileId) vs historical (doesn't).
  const allReadingsSnap = await db.collection("energeticDecoderReadings").get();
  const allReadings = allReadingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const alreadyMigrated = allReadings.filter((r) => !!r.profileId);
  const historical = allReadings.filter((r) => !r.profileId);

  console.log(`Total readings in production: ${allReadings.length}`);
  console.log(`Already have profileId (post-Task-2, skipped): ${alreadyMigrated.length}`);
  for (const r of alreadyMigrated) console.log(`  SKIP  ${r.id}  "${r.name}"  profileId=${r.profileId}`);
  console.log(`Historical readings needing migration: ${historical.length}\n`);

  // 2. GeneratedReports — read-only, for impact reporting only. Never mutated.
  const genSnap = await db.collection("generatedReports").get();
  const genByReading = new Map();
  for (const doc of genSnap.docs) {
    const d = doc.data();
    if (!genByReading.has(d.readingId)) genByReading.set(d.readingId, []);
    genByReading.get(d.readingId).push({ id: doc.id, title: d.reportDesignTitleAtGeneration });
  }

  // 3. Per-reading detail pass: contact existence, GeneratedReports, raw fields.
  const contactCache = new Map();
  async function contactExists(contactId) {
    if (!contactId) return false;
    if (contactCache.has(contactId)) return contactCache.get(contactId);
    const snap = await db.doc(`contacts/${contactId}`).get();
    contactCache.set(contactId, snap.exists);
    return snap.exists;
  }

  const detail = [];
  for (const r of historical) {
    detail.push({
      readingId: r.id,
      subAccountId: r.subAccountId,
      agencyId: r.agencyId,
      contactId: r.contactId,
      name: r.name,
      birthDate: r.birthDate,
      birthTime: r.birthTime,
      birthPlace: r.birthPlace,
      timeZone: r.timeZone,
      contactExists: await contactExists(r.contactId),
      generatedReports: genByReading.get(r.id) ?? [],
      createdAt: r.createdAt?.toDate ? r.createdAt.toDate().toISOString() : null,
    });
  }

  console.log("--- Historical readings, full detail ---");
  for (const d of detail) {
    console.log(
      `${d.readingId}  sub=${d.subAccountId}  contact=${d.contactId} (exists=${d.contactExists})  ` +
        `name="${d.name}"  birth=${d.birthDate} ${d.birthTime} @ "${d.birthPlace}" (${d.timeZone})  ` +
        `generatedReports=${d.generatedReports.length}${d.generatedReports.length ? " [" + d.generatedReports.map((g) => g.id).join(",") + "]" : ""}`,
    );
  }
  console.log("");

  // 4. Existing Profiles already in production (from Task 2 live usage, if any).
  const existingProfilesSnap = await db.collection("energeticProfiles").get();
  const existingProfiles = existingProfilesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Existing EnergeticProfile docs already in production (pre-migration): ${existingProfiles.length}`);
  for (const p of existingProfiles) {
    console.log(`  ${p.id}  contact=${p.contactId}  name="${p.name}"  birth=${p.birthDate} ${p.birthTime} @ "${p.birthPlace}"`);
  }
  console.log("");

  // 5. Group historical readings by (contactId, birth signature) -> one Profile each.
  const groups = new Map(); // key: contactId|signature -> { contactId, signature, readings: [] }
  for (const d of detail) {
    const key = `${d.contactId}|${birthSignature(d)}`;
    if (!groups.has(key)) groups.set(key, { contactId: d.contactId, signature: birthSignature(d), readings: [] });
    groups.get(key).readings.push(d);
  }

  console.log(`--- Grouping result: ${groups.size} distinct (Contact, birth-identity) group(s) ---\n`);

  const plan = []; // { action: 'reuse'|'create', contactId, profileId?, chosenName, competingNames, readingIds, ambiguous }
  for (const [, group] of groups) {
    const { contactId, readings } = group;
    const sample = readings[0];

    // Does a Profile already exist under this Contact matching this signature?
    // Same matching rule as findMatchingProfile — exact fields, within contact.
    const match = existingProfiles.find(
      (p) =>
        p.contactId === contactId &&
        p.birthDate === sample.birthDate &&
        p.birthTime === sample.birthTime &&
        normalizePlace(p.birthPlace) === normalizePlace(sample.birthPlace) &&
        p.timeZone === sample.timeZone,
    );

    const distinctNames = [...new Set(readings.map((r) => r.name))];
    const ambiguous = distinctNames.length > 1;
    // Deterministic name choice when readings disagree: the name on the
    // most-recently-created reading in the group — "most recent" is a
    // real, reproducible signal (later data is more likely a correction),
    // not a guess. Still flagged as ambiguous for owner review either way.
    const newestFirst = [...readings].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    const recommendedName = newestFirst[0].name;

    plan.push({
      action: match ? "reuse" : "create",
      contactId,
      subAccountId: sample.subAccountId,
      agencyId: sample.agencyId,
      matchedProfileId: match?.id ?? null,
      recommendedName,
      competingNames: distinctNames,
      ambiguous,
      readingIds: readings.map((r) => r.readingId),
      birthDate: sample.birthDate,
      birthTime: sample.birthTime,
      birthPlace: sample.birthPlace,
      timeZone: sample.timeZone,
    });
  }

  console.log("--- Migration plan ---");
  let creates = 0;
  let reuses = 0;
  let readingWrites = 0;
  for (const p of plan) {
    readingWrites += p.readingIds.length;
    if (p.action === "create") {
      creates++;
      console.log(
        `CREATE Profile  contact=${p.contactId}  name="${p.recommendedName}"${p.ambiguous ? `  ⚠ AMBIGUOUS NAMES: [${p.competingNames.join(", ")}] — recommending "${p.recommendedName}" (most recent reading), owner review requested` : ""}`,
      );
    } else {
      reuses++;
      console.log(`REUSE  Profile ${p.matchedProfileId}  contact=${p.contactId}  (already matches this birth signature)`);
    }
    for (const rid of p.readingIds) {
      console.log(`    -> backfill Reading ${rid}.profileId = ${p.action === "create" ? "<new profile id>" : p.matchedProfileId}`);
    }
  }
  console.log("");

  // 6. QA Verification Test reading — locate + dependency check, no action.
  const qaCandidates = allReadings.filter((r) => r.name === "QA Verification Test");
  console.log("--- QA Verification Test reading check ---");
  if (qaCandidates.length === 0) {
    console.log("Not found — does not exist in production. Nothing to delete, nothing blocking migration.");
  } else {
    for (const r of qaCandidates) {
      const gens = genByReading.get(r.id) ?? [];
      const hasProfile = !!r.profileId;
      const contactOk = await contactExists(r.contactId);
      console.log(`Found: ${r.id}  name="${r.name}"  contact=${r.contactId} (exists=${contactOk})  birth=${r.birthDate}`);
      console.log(`  GeneratedReports attached: ${gens.length}${gens.length ? " [" + gens.map((g) => g.id).join(",") + "]" : ""}`);
      console.log(`  Has profileId already: ${hasProfile}`);
      console.log(
        `  Safe to delete before migration: ${gens.length === 0 && !hasProfile ? "YES — no GeneratedReports, no Profile yet, no other dependency found." : "NOT YET SAFE — has a dependency, needs owner review before deletion."}`,
      );
    }
  }
  console.log("");

  // 7. Totals.
  console.log("--- Totals (what LIVE mode would do) ---");
  console.log(`Profiles to CREATE: ${creates}`);
  console.log(`Profiles to REUSE (already exist, matched): ${reuses}`);
  console.log(`Reading.profileId writes: ${readingWrites}`);
  console.log(`GeneratedReport writes: 0 (out of scope for this migration, by design)`);
  console.log(`Contact writes: 0 (never touched by this migration)`);
  console.log(`Chart recalculations: 0 (no reading is ever recomputed)`);
  console.log(`Ambiguous-name groups requiring owner review: ${plan.filter((p) => p.ambiguous).length}`);
  console.log("");

  if (!live) {
    console.log("=== DRY RUN COMPLETE — ZERO WRITES MADE. Pass --live to execute (not done in this session). ===");
    return;
  }

  // --- LIVE MODE (not invoked in Task 3) ---
  console.log("=== LIVE MODE — WRITING ===");
  for (const p of plan) {
    let profileId = p.matchedProfileId;
    if (p.action === "create") {
      const ref = await db.collection("energeticProfiles").add({
        subAccountId: p.subAccountId,
        agencyId: p.agencyId,
        contactId: p.contactId,
        name: p.recommendedName,
        relationshipLabel: null,
        birthDate: p.birthDate,
        birthTime: p.birthTime,
        birthPlace: p.birthPlace,
        timeZone: p.timeZone,
        lat: null,
        lng: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdByMigration: MIGRATION_TAG,
      });
      profileId = ref.id;
      console.log(`Created profile ${profileId} for contact ${p.contactId}`);
    }
    for (const rid of p.readingIds) {
      await db.doc(`energeticDecoderReadings/${rid}`).set({ profileId }, { merge: true });
      console.log(`  Reading ${rid} -> profileId ${profileId}`);
    }
  }
  console.log("=== LIVE MIGRATION COMPLETE ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
