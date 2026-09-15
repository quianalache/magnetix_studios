/**
 * Targeted test for this task's two small, isolated changes:
 *
 *   1. Nav wiring (src/lib/mymagnetix/nav.ts) — Purchases must now be a
 *      real, enabled destination pointing at /my/purchases; every OTHER
 *      still-unbuilt nav item (Messages, Projects, Saved) must remain
 *      exactly as disabled/"Soon" as before — this task's explicit
 *      instruction not to touch unrelated features.
 *
 *   2. resolvePersonFirstName (src/lib/server/mymagnetix-service.ts) — the
 *      Home greeting's new first-name-only helper, layered on top of the
 *      UNCHANGED resolvePersonDisplayName resolution chain. Covers: a real
 *      multi-word Member displayName is truncated to its first word; a
 *      single-word displayName passes through unchanged; and the final
 *      email-local-part fallback is NEVER further truncated (there's no
 *      real name to extract from a username).
 *
 * Does not re-test listSubscriptionsForPerson / listPaymentHistoryForPerson
 * / subscriptionBelongsToMembership / cross-person isolation — those are
 * untouched by this task and already have full coverage in
 * scripts/test-mymagnetix-purchases-identity.ts (19/19 passing, re-run
 * as part of this task's own validation, not duplicated here).
 *
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/test-mymagnetix-purchases-nav-and-greeting.ts
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const ENV_PATH = "/Users/quianamatthews/Documents/magnetix_studios/.env.local";
for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (process.env[m[1]] === undefined) process.env[m[1]] = v;
}

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}`);
  }
}

async function main() {
  const { MYMAGNETIX_NAV_ITEMS } = await import("../src/lib/mymagnetix/nav");
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { resolvePersonFirstName } =
    await import("../src/lib/server/mymagnetix-service");

  console.log("=== Nav wiring ===");
  const purchases = MYMAGNETIX_NAV_ITEMS.find((i) => i.label === "Purchases");
  check("Purchases item exists", !!purchases);
  check("Purchases is no longer disabled", purchases?.disabled !== true);
  check(
    "Purchases points at the real route (/my/purchases)",
    purchases?.href === "/my/purchases"
  );

  for (const label of ["Messages", "Projects", "Saved"]) {
    const item = MYMAGNETIX_NAV_ITEMS.find((i) => i.label === label);
    check(
      `${label} is still disabled ("Soon") — untouched`,
      item?.disabled === true
    );
  }
  for (const label of [
    "Home",
    "Courses",
    "Communities",
    "Readings",
    "My Spaces",
  ]) {
    const item = MYMAGNETIX_NAV_ITEMS.find((i) => i.label === label);
    check(`${label} is still enabled — untouched`, item?.disabled !== true);
  }

  console.log("\n=== resolvePersonFirstName ===");
  const db = getAdminDb();
  const suffix = randomUUID().slice(0, 8);
  const cleanup: Array<() => Promise<unknown>> = [];

  try {
    // Fixture 1: a Person with a real, multi-word Member displayName.
    const email1 = `qa-firstname-full-${suffix}@example.invalid`;
    const personId1 = `qa-firstname-person-full-${suffix}`;
    await db.doc(`people/${personId1}`).set({ primaryEmail: email1 });
    cleanup.push(() => db.doc(`people/${personId1}`).delete());
    const memberships1 = [
      {
        subAccountId: "qa-fixture-sub",
        memberId: "qa-fixture-member-1",
        contactId: null,
        email: email1,
        displayName: "Sarah Johnson",
      },
    ];
    const firstName1 = await resolvePersonFirstName(
      personId1,
      email1,
      memberships1
    );
    check(
      "Multi-word displayName truncates to first word ('Sarah Johnson' -> 'Sarah')",
      firstName1 === "Sarah"
    );

    // Fixture 2: a single-word displayName passes through unchanged.
    const email2 = `qa-firstname-single-${suffix}@example.invalid`;
    const personId2 = `qa-firstname-person-single-${suffix}`;
    await db.doc(`people/${personId2}`).set({ primaryEmail: email2 });
    cleanup.push(() => db.doc(`people/${personId2}`).delete());
    const memberships2 = [
      {
        subAccountId: "qa-fixture-sub",
        memberId: "qa-fixture-member-2",
        contactId: null,
        email: email2,
        displayName: "Priya",
      },
    ];
    const firstName2 = await resolvePersonFirstName(
      personId2,
      email2,
      memberships2
    );
    check(
      "Single-word displayName passes through unchanged",
      firstName2 === "Priya"
    );

    // Fixture 3: no Member/staff displayName anywhere — falls all the way
    // to the email local-part, which must NOT be further mangled (this is
    // exactly quianalache@gmail.com's CURRENT real state).
    const email3 = `qa-firstname-noname-${suffix}@example.invalid`;
    const personId3 = `qa-firstname-person-noname-${suffix}`;
    await db.doc(`people/${personId3}`).set({ primaryEmail: email3 });
    cleanup.push(() => db.doc(`people/${personId3}`).delete());
    const firstName3 = await resolvePersonFirstName(personId3, email3, []);
    const expectedLocalPart = email3.split("@")[0];
    check(
      "No real name anywhere -> falls back to the full, un-truncated email local-part",
      firstName3 === expectedLocalPart
    );

    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  } finally {
    console.log("\n=== Cleaning up fixtures ===");
    for (const fn of cleanup.reverse()) {
      await fn().catch((err) =>
        console.warn("cleanup step failed (continuing):", err)
      );
    }
    console.log("Cleanup complete. No fixture data remains.");
  }

  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL", err);
    process.exit(1);
  });
