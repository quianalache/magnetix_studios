import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Phase 3 Task 7 (2026-08-13) — one-time backfill of GeneratedReport.profileId
 * for reports created before Task 7 wired profileId into createGeneratedReport.
 * Committed (not a throwaway) for the same reason migrate-energetic-profiles.mjs
 * was: an auditable, rerunnable record of exactly what this did.
 *
 * Logic: for each GeneratedReport missing profileId, resolve its readingId ->
 * Reading -> profileId, and backfill that value. NEVER touches snapshot,
 * resolvedNameAtGeneration-style fields, readingId, contactId, generatedAt,
 * reportDesignTitleAtGeneration, or anything else — profileId is the only
 * field ever written.
 *
 * Safety gate (per Task 7 instructions): proceeds without a second owner
 * approval ONLY if every GeneratedReport missing profileId has a Reading
 * that (a) exists, (b) belongs to the same sub-account, and (c) itself has
 * a valid profileId. Any GeneratedReport that fails any of those checks is
 * reported and left untouched — the whole run still completes for the safe
 * ones, but flags the unsafe ones instead of guessing.
 *
 * Modes:
 *   node scripts/generated-report-profile-backfill.mjs           -> dry run (default, zero writes)
 *   node scripts/generated-report-profile-backfill.mjs --live     -> REAL WRITES, requires --live explicitly
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

async function main() {
  const live = process.argv.includes("--live");
  console.log(`=== GeneratedReport profileId backfill — ${live ? "LIVE MODE" : "DRY RUN"} ===\n`);

  const allSnap = await db.collection("generatedReports").get();
  const all = allSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const alreadyHas = all.filter((r) => r.profileId !== undefined && r.profileId !== null);
  const missing = all.filter((r) => r.profileId === undefined || r.profileId === null);

  console.log(`Total GeneratedReports: ${all.length}`);
  console.log(`Already have profileId: ${alreadyHas.length}`);
  console.log(`Missing profileId: ${missing.length}\n`);

  const safe = [];
  const unsafe = [];

  for (const gr of missing) {
    const readingSnap = gr.readingId ? await db.doc(`energeticDecoderReadings/${gr.readingId}`).get() : null;
    if (!readingSnap || !readingSnap.exists) {
      unsafe.push({ gr, reason: "source Reading does not exist" });
      continue;
    }
    const reading = readingSnap.data();
    if (reading.subAccountId !== gr.subAccountId) {
      unsafe.push({ gr, reason: `source Reading belongs to a different sub-account (${reading.subAccountId} vs ${gr.subAccountId})` });
      continue;
    }
    if (!reading.profileId) {
      unsafe.push({ gr, reason: "source Reading has no profileId of its own" });
      continue;
    }
    safe.push({ gr, profileId: reading.profileId, readingName: reading.name });
  }

  console.log(`--- Plan ---`);
  console.log(`Safe to backfill: ${safe.length}`);
  for (const s of safe) {
    console.log(`  ${s.gr.id}  (reading "${s.readingName}", ${s.gr.readingId})  -> profileId ${s.profileId}`);
  }
  console.log(`Unsafe / needs owner review: ${unsafe.length}`);
  for (const u of unsafe) {
    console.log(`  ⚠ ${u.gr.id}  readingId=${u.gr.readingId}  reason: ${u.reason}`);
  }
  console.log("");

  if (unsafe.length > 0) {
    console.log("=== STOPPING BEFORE ANY WRITES — unsafe GeneratedReport(s) found above. ===");
    console.log("No backfill performed for ANY report this run, per instruction (report and stop on ambiguity).");
    return;
  }

  if (safe.length === 0) {
    console.log("=== Nothing to backfill. ===");
    return;
  }

  if (!live) {
    console.log("=== DRY RUN COMPLETE — ZERO WRITES MADE. Pass --live to execute. ===");
    return;
  }

  console.log("=== LIVE MODE — WRITING profileId ONLY (snapshot/readingId/contactId/generatedAt untouched) ===");
  for (const s of safe) {
    await db.doc(`generatedReports/${s.gr.id}`).set({ profileId: s.profileId }, { merge: true });
    console.log(`  Backfilled ${s.gr.id} -> profileId ${s.profileId}`);
  }
  console.log("=== LIVE BACKFILL COMPLETE ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
