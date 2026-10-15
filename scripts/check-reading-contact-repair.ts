/**
 * Legacy reading → contact repair + contact Decoder card — EMULATOR ONLY
 * (Firestore, `demo-*` project, no production credentials). Exercises the
 * REAL services (reading-contact-repair-service, readings-library-service)
 * against isolated fixtures.
 *
 * Run:
 *   echo '{"emulators":{"firestore":{"port":8080}}}' > /tmp/emu-rr/firebase.json
 *   firebase emulators:exec --config /tmp/emu-rr/firebase.json --only firestore --project demo-reading-repair \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' ./node_modules/.bin/tsx scripts/check-reading-contact-repair.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-reading-repair";
if (!process.env.FIRESTORE_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: needs the Firestore emulator, a demo-* project and no production credentials.");
  process.exit(2);
}
initializeApp({ projectId: PROJECT });
const db = getFirestore();

async function main() {
  const { relinkLegacyReadingContact, readingContactIsBroken } = await import("../src/lib/server/reading-contact-repair-service");
  const { listContactDecoderSummaries } = await import("../src/lib/server/readings-library-service");


  let pass = 0;
  async function check(label: string, fn: () => Promise<void>) {
    await fn();
    pass++;
    console.log(`  PASS  ${label}`);
  }

  const SA = "sa-1";
  const OTHER_SA = "sa-2";
  const reading = {
    subAccountId: SA,
    agencyId: "ag-1",
    contactId: "deleted-contact",
    profileId: "profile-1",
    system: "geneKeys",
    name: "ethan ross",
    birthDate: "1991-02-27",
    birthTime: "08:31",
    birthPlace: "Grand Rapids",
    timeZone: "America/Detroit",
    spheres: [],
    humanDesign: { type: "Manifesting Generator", authority: "Sacral", profile: "4/1" },
    astrology: { placements: [{ body: "sun", sign: "Pisces" }] },
  };
  await db.doc("energeticDecoderReadings/r-legacy").set(reading);
  await db.doc("energeticProfiles/profile-1").set({ subAccountId: SA, agencyId: "ag-1", contactId: "deleted-contact", name: "ethan ross", relationshipLabel: null });
  await db.doc("contacts/new-ethan").set({ subAccountId: SA, name: "ethan forrest ross" });
  await db.doc("contacts/other-sa-contact").set({ subAccountId: OTHER_SA, name: "someone else" });
  await db.doc("contacts/healthy").set({ subAccountId: SA, name: "Healthy" });
  await db.doc("energeticDecoderReadings/r-healthy").set({ ...reading, contactId: "healthy", profileId: null, name: "Healthy" });

  await check("legacy reading with a deleted contact reads as broken", async () => {
    assert.equal(await readingContactIsBroken(SA, "deleted-contact"), true);
    assert.equal(await readingContactIsBroken(SA, "healthy"), false);
    assert.equal(await readingContactIsBroken(SA, "other-sa-contact"), true);
  });

  await check("refuses a contact from another sub-account (404, nothing written)", async () => {
    const r = await relinkLegacyReadingContact(SA, "r-legacy", "other-sa-contact");
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.status, 404);
    assert.equal((await db.doc("energeticDecoderReadings/r-legacy").get()).get("contactId"), "deleted-contact");
  });

  await check("refuses a reading from another sub-account (404)", async () => {
    const r = await relinkLegacyReadingContact(OTHER_SA, "r-legacy", "new-ethan");
    assert.equal(!r.ok && r.status, 404);
  });

  await check("refuses to reassign a HEALTHY link (409) — not a general reassignment tool", async () => {
    const r = await relinkLegacyReadingContact(SA, "r-healthy", "new-ethan");
    assert.equal(!r.ok && r.status, 409);
    assert.equal((await db.doc("energeticDecoderReadings/r-healthy").get()).get("contactId"), "healthy");
  });

  await check("repairs the broken link: reading + its profile re-pointed", async () => {
    const before = (await db.doc("energeticDecoderReadings/r-legacy").get()).data()!;
    const r = await relinkLegacyReadingContact(SA, "r-legacy", "new-ethan");
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.profileUpdated, true);
    const after = (await db.doc("energeticDecoderReadings/r-legacy").get()).data()!;
    assert.equal(after.contactId, "new-ethan");
    assert.equal((await db.doc("energeticProfiles/profile-1").get()).get("contactId"), "new-ethan");
    // Reading content untouched — only contactId changed.
    const restBefore: Record<string, unknown> = { ...before };
    delete restBefore.contactId;
    const restAfter: Record<string, unknown> = { ...after };
    delete restAfter.contactId;
    assert.deepEqual(restAfter, restBefore);
  });

  await check("once repaired, the same link can't be changed again (409)", async () => {
    const r = await relinkLegacyReadingContact(SA, "r-legacy", "healthy");
    assert.equal(!r.ok && r.status, 409);
  });

  await check("contact card summary: real chart facts from the latest reading, nothing invented", async () => {
    const people = await listContactDecoderSummaries(SA, "new-ethan");
    assert.equal(people.length, 1);
    assert.equal(people[0].kind, "profile");
    assert.equal(people[0].energyType, "Manifesting Generator");
    assert.equal(people[0].authority, "Sacral");
    assert.equal(people[0].hdProfile, "4/1");
    assert.equal(people[0].sunSign, "Pisces");
    assert.equal(people[0].latestReadingId, "r-legacy");
  });

  await check("contact with no Decoder data returns no people (card hidden)", async () => {
    assert.deepEqual(await listContactDecoderSummaries(SA, "other-sa-contact"), []);
  });

  console.log(`\n${pass} passed, 0 failed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
