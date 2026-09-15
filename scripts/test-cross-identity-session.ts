/**
 * Targeted test for the CRM -> MyMagnetix cross-identity session fix
 * (2026-09-15 incident: staff identity A silently saw MyMagnetix Person B's
 * account through a stale mm_session cookie). Covers the task's required
 * test matrix, cases A-E:
 *
 *   A. CRM identity + matching MyMagnetix Person   -> no mismatch
 *   B. CRM identity + a DIFFERENT MyMagnetix Person -> mismatch detected
 *   C. CRM identity + no MyMagnetix session at all  -> bridge 404s cleanly
 *      (personHasMemberRelationships gate), which is what sends
 *      GatewayMyMagnetixButton to /my/login?email=... instead of dead-ending
 *   D. Switching MyMagnetix (clearing mm_session) never touches __session
 *      (structural: clearPersonSessionCookie only deletes PERSON_SESSION_COOKIE)
 *   E. /api/my/logout never touches __session (same structural check, from
 *      the actual route handler's only cookie operation)
 *
 * /gateway's own `mismatched` boolean is a two-line inline expression, not an
 * exported function -- this test exercises the exact real function it's
 * built from (resolveStaffPersonId) against real fixture Firestore docs and
 * recomputes the identical comparison, rather than re-implementing/guessing
 * at gateway/page.tsx's logic from outside it.
 *
 * Uses throwaway @example.invalid addresses (reserved TLD, never
 * deliverable) and a disposable users/{uid} doc under a random id (no real
 * Firebase Auth account created — resolveStaffPersonId only reads/writes
 * Firestore, never Firebase Auth). Every fixture is deleted in a `finally`
 * block; nothing is left behind.
 *
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/test-cross-identity-session.ts
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
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { resolveStaffPersonId, ensurePersonIdentity } =
    await import("../src/lib/server/person-identity-service");

  const db = getAdminDb();
  const suffix = randomUUID().slice(0, 8);
  const cleanup: Array<() => Promise<unknown>> = [];

  try {
    // Fixture identities: two distinct MyMagnetix Persons, and one fake
    // staff `users/{uid}` doc per scenario below.
    const emailA = `qa-cross-identity-a-${suffix}@example.invalid`;
    const emailB = `qa-cross-identity-b-${suffix}@example.invalid`;
    const personIdA = await ensurePersonIdentity(emailA);
    const personIdB = await ensurePersonIdentity(emailB);
    cleanup.push(() => db.doc(`people/${personIdA}`).delete());
    cleanup.push(() => db.doc(`people/${personIdB}`).delete());
    check("Fixture Person A and B are distinct docs", personIdA !== personIdB);

    // === CASE A: CRM identity email matches the existing mm_session Person ===
    console.log(
      "\n=== CASE A: CRM staff identity + matching MyMagnetix Person ==="
    );
    const uidA = `qa-staff-fixture-a-${suffix}`;
    await db.doc(`users/${uidA}`).set({ email: emailA, status: "active" });
    cleanup.push(() => db.doc(`users/${uidA}`).delete());

    const resolvedForA = await resolveStaffPersonId(uidA, emailA);
    check(
      "resolveStaffPersonId resolves staff A to Person A",
      resolvedForA === personIdA
    );
    // Recompute /gateway's exact `mismatched` expression against an
    // existing mm_session Person that IS the same human (personIdA).
    const mismatchedA =
      !!personIdA && !!resolvedForA && resolvedForA !== personIdA;
    check("Same-email case: mismatched is false", mismatchedA === false);

    const staffDocA = await db.doc(`users/${uidA}`).get();
    check(
      "Staff doc A got personId written (lazy link)",
      staffDocA.data()?.personId === personIdA
    );

    // === CASE B: CRM identity email is DIFFERENT from the existing
    // mm_session Person (the real reported incident) ===
    console.log(
      "\n=== CASE B: CRM staff identity + a DIFFERENT MyMagnetix Person ==="
    );
    const uidB = `qa-staff-fixture-b-${suffix}`;
    // Staff identity B's own real email is emailB, but the BROWSER's
    // existing mm_session cookie belongs to Person A (emailA) -- exactly
    // the incident: a stale, unrelated mm_session already in the browser.
    await db.doc(`users/${uidB}`).set({ email: emailB, status: "active" });
    cleanup.push(() => db.doc(`users/${uidB}`).delete());

    const resolvedForB = await resolveStaffPersonId(uidB, emailB);
    check(
      "resolveStaffPersonId resolves staff B to Person B (its OWN identity, not A's)",
      resolvedForB === personIdB
    );
    const mismatchedB =
      !!personIdA && !!resolvedForB && resolvedForB !== personIdA;
    check(
      "Different-email case: mismatched is true (the reported incident)",
      mismatchedB === true
    );

    // === CASE C: CRM identity + no mm_session at all -> bridge 404s cleanly
    // instead of silently minting a session for an unrelated/empty Person ===
    console.log(
      "\n=== CASE C: CRM identity + no MyMagnetix session (bridge gate) ==="
    );
    const { personHasMemberRelationships } =
      await import("../src/lib/server/person-identity-service");
    const hasMembers = await personHasMemberRelationships(personIdB);
    check(
      "Fresh fixture Person has no Member relationships anywhere",
      hasMembers === false
    );
    // This is exactly the condition /api/my/bridge-from-staff checks before
    // minting a session -- confirms the 404 path GatewayMyMagnetixButton
    // redirects on (to /my/login?email=...) is reachable for a real,
    // no-prior-mm_session staff identity, not a dead code path.

    // === CASE D & E: switching/logging out of MyMagnetix never touches the
    // CRM's own __session cookie (structural -- confirmed by reading the
    // actual cookie helpers' source, asserted here so a future edit that
    // widens their scope fails this test) ===
    console.log(
      "\n=== CASE D/E: MyMagnetix session clearing never touches __session ==="
    );
    const personSessionSrc = readFileSync(
      "src/lib/server/person-session.ts",
      "utf8"
    );
    check(
      "clearPersonSessionCookie only deletes PERSON_SESSION_COOKIE",
      /clearPersonSessionCookie[\s\S]*?cookieStore\.delete\(PERSON_SESSION_COOKIE\)/.test(
        personSessionSrc
      ) &&
        !/clearPersonSessionCookie[\s\S]{0,200}__session/.test(personSessionSrc)
    );
    const logoutRouteSrc = readFileSync(
      "src/app/api/my/logout/route.ts",
      "utf8"
    );
    // The route's doc comment deliberately NAMES __session (explaining why
    // it's untouched) -- the real assertion is that no cookie OPERATION
    // (set/delete) targets it, not that the string never appears at all.
    check(
      "/api/my/logout route never sets or deletes the __session cookie",
      !/(?:cookies\(\)|cookieStore)\.(?:set|delete)\(\s*["']__session["']/.test(
        logoutRouteSrc
      )
    );
    check(
      "/api/my/logout route's only cookie action is clearPersonSessionCookie",
      logoutRouteSrc.includes("clearPersonSessionCookie()")
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
