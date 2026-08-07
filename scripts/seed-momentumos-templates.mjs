// One-off: seed the real MomentumOS project templates into the CRM's new
// Projects feature — pulled directly from the actual "Momentum OS — Daily
// Flow" Claude Artifact (fetched 2026-08-06), not invented. Corrects a real
// gap: the Projects build shipped with an empty Templates tab instead of
// actually porting these over, which wasn't what "model exactly after
// MomentumOS" meant.
//
// Run once: node scripts/seed-momentumos-templates.mjs
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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

// title, category, durationDays — exactly what the real MomentumOS
// Templates tab shows ("Category · N days"). Steps aren't visible in the
// artifact snapshot (template cards don't expand there), so templates seed
// with zero steps — same as a blank template she can fill in from the CRM.
const TEMPLATES = [
  { title: "YouTube Video Workflow", category: "Content Workflow", durationDays: 14 },
  { title: "Product Launch", category: "Launch", durationDays: 30 },
  { title: "Weekly CEO Reset", category: "Weekly Planning", durationDays: 7 },
  { title: "Challenge Launch", category: "Challenge / Event", durationDays: 21 },
  { title: "Content Repurposing Workflow", category: "Content Workflow", durationDays: 7 },
  { title: "Podcast Episode Workflow", category: "Content Workflow", durationDays: 10 },
  { title: "Offer Creation Workflow", category: "Product Creation", durationDays: 21 },
  { title: "Monthly Planning Reset", category: "CEO Operations", durationDays: 3 },
  { title: "Offer Funnel Buildout", category: "Product Creation", durationDays: null },
];

async function main() {
  const subSnap = await db.collection("subAccounts").limit(10).get();
  if (subSnap.size !== 1) {
    console.error(
      `Expected exactly one sub-account, found ${subSnap.size} — bailing rather than guess which one gets the templates.`,
    );
    process.exit(1);
  }
  const sub = subSnap.docs[0];
  const subAccountId = sub.id;
  const agencyId = sub.data().agencyId;

  const existing = await db
    .collection("projectTemplates")
    .where("subAccountId", "==", subAccountId)
    .get();
  if (!existing.empty) {
    console.log(`${existing.size} template(s) already exist for ${subAccountId} — skipping seed to avoid duplicates.`);
    process.exit(0);
  }

  const batch = db.batch();
  for (const t of TEMPLATES) {
    const ref = db.collection("projectTemplates").doc();
    batch.set(ref, {
      agencyId,
      subAccountId,
      title: t.title,
      category: t.category,
      durationDays: t.durationDays,
      description: "",
      steps: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`Seeded ${TEMPLATES.length} templates for sub-account ${subAccountId}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
