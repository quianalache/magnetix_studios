import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * Business Brain architecture migration — moves the strategic-context
 * document Phase 0 imported at `subAccounts/{id}/ytcs/brain` to its new
 * canonical, sub-account-owned location `subAccounts/{id}/businessBrain/
 * main`. See docs/product/youtube-content-studio-migration-spec.md's
 * Business Brain Architecture section for the full rationale.
 *
 * This is a COPY, not a destructive move: the source `ytcs/brain` doc is
 * never deleted. In --live mode it is additionally marked (merge-only,
 * every original field untouched) with `deprecated: true` and
 * `supersededBy` so nothing that might still read it mistakes it for a
 * live, independently-editable source — Business Brain at the new path
 * is the only canonical, editable Brain from this point forward.
 *
 * Same dry-run-by-default / --live pattern as
 * scripts/migrate-youtube-content-studio.mjs and
 * scripts/migrate-energetic-profiles.mjs — reused deliberately.
 *
 * Usage:
 *   node scripts/migrate-business-brain.mjs --subAccountId=<id>            (dry run)
 *   node scripts/migrate-business-brain.mjs --subAccountId=<id> --live      (real write)
 */

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    return [k, rest.length ? rest.join("=") : true];
  }),
);

const LIVE = args.live === true;
const SUB_ACCOUNT_ID = typeof args.subAccountId === "string" ? args.subAccountId : null;

if (!SUB_ACCOUNT_ID) {
  console.error("Missing required --subAccountId=<id>. This migration never guesses the target sub-account.");
  process.exit(1);
}

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

const OLD_PATH = (id) => `subAccounts/${id}/ytcs/brain`;
const NEW_PATH = (id) => `subAccounts/${id}/businessBrain/main`;

function byteSize(obj) {
  return Buffer.byteLength(JSON.stringify(obj ?? {}), "utf8");
}

// Every top-level key this migration knows how to carry across verbatim.
// Anything else on the source doc is still copied (this migration copies
// the WHOLE document, not a hand-picked subset) but flagged loudly if it
// isn't in this list, since Phase 0 already confirmed 0 unknown fields at
// that layer and a new one appearing here would be worth a human look.
const KNOWN_TOP_LEVEL_KEYS = [
  "vision", "audience", "offers", "frameworks", "stories", "voice",
  "topics", "subtopics", "positioning", "legacy", "unknownFields",
  "migratedFromExport", "migratedAt",
];

async function main() {
  console.log(`=== Business Brain Migration — ${LIVE ? "LIVE MODE" : "DRY RUN"} ===`);
  console.log(`Sub-account: ${SUB_ACCOUNT_ID}`);
  console.log(`Source: ${OLD_PATH(SUB_ACCOUNT_ID)}`);
  console.log(`Target: ${NEW_PATH(SUB_ACCOUNT_ID)}\n`);

  const subSnap = await db.doc(`subAccounts/${SUB_ACCOUNT_ID}`).get();
  if (!subSnap.exists) {
    console.error(`Sub-account ${SUB_ACCOUNT_ID} does not exist. Aborting — nothing written.`);
    process.exit(1);
  }
  console.log(`Target sub-account confirmed: ${subSnap.data()?.name ?? "(unnamed)"}\n`);

  const oldSnap = await db.doc(OLD_PATH(SUB_ACCOUNT_ID)).get();
  if (!oldSnap.exists) {
    console.error(`Source doc ${OLD_PATH(SUB_ACCOUNT_ID)} does not exist. Nothing to migrate — aborting.`);
    process.exit(1);
  }
  const oldData = oldSnap.data();
  console.log("Source doc found. Top-level keys:", Object.keys(oldData).join(", "));

  const unexpectedKeys = Object.keys(oldData).filter((k) => !KNOWN_TOP_LEVEL_KEYS.includes(k));
  if (unexpectedKeys.length) {
    console.log(`⚠ Unexpected top-level key(s) not in the known list — copied anyway, flagged for review: ${unexpectedKeys.join(", ")}`);
  } else {
    console.log("All top-level keys match the known Business Brain shape.");
  }

  const newSnap = await db.doc(NEW_PATH(SUB_ACCOUNT_ID)).get();
  if (newSnap.exists) {
    console.log(`\nTarget doc already exists (${byteSize(newSnap.data())} bytes). This run will overwrite it with a fresh copy of the current source — same idempotent .set() pattern as Phase 0.`);
  } else {
    console.log("\nTarget doc does not exist yet — will be created.");
  }

  const migrated = {
    ...oldData,
    movedFromYtcsBrain: true,
    movedFromYtcsBrainAt: LIVE ? FieldValue.serverTimestamp() : "<serverTimestamp>",
  };

  console.log(`\nMigrated doc size: ${byteSize(migrated)} bytes`);
  console.log("Section counts — offers:", migrated.offers?.length ?? 0,
    "| frameworks:", migrated.frameworks?.length ?? 0,
    "| stories:", migrated.stories?.length ?? 0,
    "| topics:", migrated.topics?.length ?? 0,
    "| subtopics:", migrated.subtopics?.length ?? 0,
    "| legacy sections:", Object.keys(migrated.legacy ?? {}).join(",") || "(none)");

  if (!LIVE) {
    console.log("\n=== DRY RUN COMPLETE — ZERO WRITES MADE. Pass --live to execute. ===");
    return;
  }

  console.log("\n=== LIVE MODE — WRITING ===");
  await db.doc(NEW_PATH(SUB_ACCOUNT_ID)).set(migrated);
  console.log(`Wrote Business Brain to ${NEW_PATH(SUB_ACCOUNT_ID)}`);

  // Additive-only: every original field on the old doc is untouched; this
  // only adds deprecation markers so the old location is never mistaken
  // for a second live source of truth.
  await db.doc(OLD_PATH(SUB_ACCOUNT_ID)).set(
    {
      deprecated: true,
      supersededBy: NEW_PATH(SUB_ACCOUNT_ID),
      supersededAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`Marked ${OLD_PATH(SUB_ACCOUNT_ID)} as deprecated (merge-only, original fields untouched).`);

  console.log("=== LIVE MIGRATION COMPLETE ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
