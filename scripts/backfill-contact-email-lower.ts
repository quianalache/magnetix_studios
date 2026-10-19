/**
 * Case-insensitive Contact matching (Public Reading Tool, 2026-10-19) —
 * adds `emailLower` to Contacts written before that field existed, so
 * `findExistingContactId` matches `Maya@Example.com` and `maya@example.com`
 * as one Contact. Additive only: writes nothing but `emailLower` on docs
 * that have an email and no `emailLower`.
 *
 * Dry run (default — reads only, prints counts):
 *   node --env-file=.env.local --import tsx scripts/backfill-contact-email-lower.ts
 * Apply:
 *   node --env-file=.env.local --import tsx scripts/backfill-contact-email-lower.ts --apply
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
} else {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_ADMIN_PROJECT_ID });
}
const db = getFirestore();

async function main() {
  const snap = await db.collection("contacts").select("email", "emailLower").get();
  const todo = snap.docs.filter((d) => {
    const email = d.get("email");
    return typeof email === "string" && email.trim() && typeof d.get("emailLower") !== "string";
  });
  const mixedCase = todo.filter((d) => (d.get("email") as string).trim() !== (d.get("email") as string).trim().toLowerCase()).length;
  console.log(`Contacts: ${snap.size} · missing emailLower: ${todo.length} · of those with mixed-case email: ${mixedCase}`);
  if (!APPLY) {
    console.log("Dry run — nothing written. Re-run with --apply to backfill.");
    return;
  }
  let written = 0;
  for (let i = 0; i < todo.length; i += 400) {
    const batch = db.batch();
    for (const d of todo.slice(i, i + 400)) {
      batch.update(d.ref, { emailLower: (d.get("email") as string).trim().toLowerCase() });
      written++;
    }
    await batch.commit();
  }
  console.log(`Applied: emailLower added to ${written} contacts.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
