import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * One-time data update (owner-approved 2026-10-01): turn the two automatic
 * lesson-NAVIGATION settings OFF on existing Standalone Courses —
 *   learningExperience.autoplayFirstLesson -> false
 *   learningExperience.autoplayNextLesson  -> false
 *
 * Nothing else is written: not autoplayLessonVideos (video autoplay is a
 * separate, untouched setting), not autoCompleteLessons, not updatedAt, no
 * course content, lessons, enrollments or progress. Only those two field
 * paths, via Firestore field-path updates.
 *
 * Scope: every Standalone Course (tenant `subAccounts/{sa}/standaloneCourses`
 * and Agency `agencies/{ag}/standaloneCourses`, via one collection-group
 * query) whose saved `learningExperience` has either setting not already
 * `false`. Courses with NO saved `learningExperience` are skipped: they read
 * the shared default, which is now OFF for both, and writing two fields
 * into an absent map would create a partial object that drops their
 * `autoCompleteLessons` default.
 *
 * Modes:
 *   node scripts/course-navigation-settings-off.mjs                 -> dry run (default, zero writes)
 *   node scripts/course-navigation-settings-off.mjs --live --expect N
 *        -> REAL WRITES. Refuses unless N equals the number of courses
 *           the dry run plans to change (re-computed at run time), so a
 *           live run can't silently touch a different set than reviewed.
 *
 * Idempotent: each course is re-read inside its own transaction and only
 * written if a setting is still not `false`; a rerun plans zero changes.
 *
 * Rollback: every planned/applied change is printed with the course path
 * and the previous values. Restoring is setting those two field paths back
 * to the printed values for the printed paths (no other field changed).
 */
const env = {};
for (const line of (process.env.FIRESTORE_EMULATOR_HOST ? "" : readFileSync(new URL("../.env.local", import.meta.url), "utf8")).split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}

const args = process.argv.slice(2);
const live = args.includes("--live");
const expectIdx = args.indexOf("--expect");
const expected = expectIdx >= 0 ? Number(args[expectIdx + 1]) : null;
if (live && !Number.isInteger(expected)) {
  console.error("--live requires --expect <number of courses the dry run reported>.");
  process.exit(1);
}

// Emulator runs (tests) never touch production credentials.
if (process.env.FIRESTORE_EMULATOR_HOST) {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-course-progression" });
} else {
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();

const NAV_FIELDS = ["autoplayFirstLesson", "autoplayNextLesson"];

/** The two-field change a course needs, or null (already off / no saved settings). */
function planFor(learningExperience) {
  if (!learningExperience || typeof learningExperience !== "object") return null;
  const update = {};
  for (const f of NAV_FIELDS) {
    if (learningExperience[f] !== false) update[`learningExperience.${f}`] = false;
  }
  return Object.keys(update).length ? update : null;
}

const snap = await db.collectionGroup("standaloneCourses").get();
const planned = [];
const skippedNoSettings = [];
let alreadyOff = 0;
for (const doc of snap.docs) {
  const data = doc.data();
  const le = data.learningExperience;
  if (!le) {
    skippedNoSettings.push(doc.ref.path);
    continue;
  }
  const update = planFor(le);
  if (!update) {
    alreadyOff++;
    continue;
  }
  planned.push({
    ref: doc.ref,
    title: data.title ?? "",
    previous: Object.fromEntries(NAV_FIELDS.map((f) => [f, le[f]])),
    update,
  });
}

console.log(`Mode: ${live ? "LIVE (writes)" : "DRY RUN (no writes)"}`);
console.log(`Courses scanned: ${snap.size}`);
console.log(`Courses to change: ${planned.length}`);
console.log(`Already off: ${alreadyOff}`);
console.log(`Skipped, no saved learningExperience (read the new OFF default): ${skippedNoSettings.length}`);
for (const p of skippedNoSettings) console.log(`  skip  ${p}`);
for (const p of planned) {
  console.log(`  change  ${p.ref.path}  "${p.title}"  previous=${JSON.stringify(p.previous)}  set=${JSON.stringify(p.update)}`);
}

if (!live) {
  console.log("\nDry run complete. Re-run with --live --expect " + planned.length + " to apply (owner approval required).");
  process.exit(0);
}

if (planned.length !== expected) {
  console.error(`\nRefusing to write: planned ${planned.length} courses but --expect ${expected}. Re-run the dry run and review.`);
  process.exit(1);
}

let written = 0;
for (const p of planned) {
  const changed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(p.ref);
    const update = planFor(fresh.data()?.learningExperience);
    if (!update) return false;
    tx.update(p.ref, update);
    return true;
  });
  if (changed) {
    written++;
    console.log(`  applied  ${p.ref.path}`);
  } else {
    console.log(`  no-op    ${p.ref.path} (already off at write time)`);
  }
}
console.log(`\nLive run complete: ${written} course(s) updated.`);
process.exit(0);
