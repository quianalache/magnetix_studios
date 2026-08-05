// One-off backfill: every subAccounts/{saId}/standaloneCourses and
// subAccounts/{saId}/courseOffers doc created before the `slug` field
// existed gets one generated from its `title`, unique within its own
// sub-account/collection (matches src/lib/slug.ts's ensureUniqueSlug, but
// reimplemented standalone here since scripts/ isn't compiled through
// Next's module graph and can't import "server-only" app code directly).
//
// Run once: node scripts/backfill-course-offer-slugs.mjs
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

function slugify(input) {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "item"
  );
}

async function backfillCollection(saId, collectionPath) {
  const col = db.collection(collectionPath);
  const snap = await col.get();
  const usedSlugs = new Set(
    snap.docs.map((d) => d.data().slug).filter((s) => typeof s === "string"),
  );
  let updated = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (typeof data.slug === "string" && data.slug) continue;
    const root = slugify(data.title || "item");
    let candidate = root;
    let attempt = 1;
    while (usedSlugs.has(candidate)) {
      attempt += 1;
      candidate = `${root}-${attempt}`;
    }
    usedSlugs.add(candidate);
    await doc.ref.update({ slug: candidate });
    console.log(`  ${collectionPath}/${doc.id}: "${data.title}" -> slug "${candidate}"`);
    updated += 1;
  }
  return updated;
}

const subAccounts = await db.collection("subAccounts").get();
let totalCourses = 0;
let totalOffers = 0;
for (const sa of subAccounts.docs) {
  const saId = sa.id;
  totalCourses += await backfillCollection(saId, `subAccounts/${saId}/standaloneCourses`);
  totalOffers += await backfillCollection(saId, `subAccounts/${saId}/courseOffers`);
}
console.log(`\nDone. Backfilled ${totalCourses} standalone course(s), ${totalOffers} offer(s).`);
process.exit(0);
