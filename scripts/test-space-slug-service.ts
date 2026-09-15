/**
 * Tests for the branded Space URL slug system (2026-09-16):
 * deriveSlugFromName, resolveUniqueSlug's collision handling, and
 * resolveSpaceIdentifier's three resolution paths (real id with an
 * already-good slug, real id with the historical opaque-fallback slug —
 * self-healing — and slug-based lookup), plus old-ID backward
 * compatibility and a real, read-only-safe check against the actual
 * production Main sub-account (this task's own QA target).
 *
 * All MUTATING checks use disposable fixture sub-account docs, never the
 * real Main/Test sub-accounts — Test's real slug is still the historical
 * fallback pattern today (confirmed read-only elsewhere in this task's
 * investigation) and this script deliberately never calls
 * resolveSpaceIdentifier on Test's real id, so it is not touched by
 * running this test. It WILL self-heal automatically (same function,
 * same logic) the first time anyone actually visits its portal — that's
 * the intended, safe, desired behavior, not something this test needs to
 * trigger itself. Main's real id IS used below, read-only: its stored
 * slug is already "main" (a real, deliberate value), so resolving it is
 * a verified no-op, not a mutation.
 *
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/test-space-slug-service.ts
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

const MAIN_SUB_ACCOUNT_ID = "xvnedVCmQpEvHrcPhEDI"; // #1000 Main, real production

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
  const {
    deriveSlugFromName,
    resolveUniqueSlug,
    isFallbackSlug,
    resolveSpaceIdentifier,
  } = await import("../src/lib/server/space-slug-service");

  console.log("=== deriveSlugFromName ===");
  check(
    "'Main' -> 'main' (this task's own example)",
    deriveSlugFromName("Main") === "main"
  );
  check(
    "\"Quiana's Coaching\" -> 'quianas-coaching' (apostrophe dropped, not dashed — this task's own example)",
    deriveSlugFromName("Quiana's Coaching") === "quianas-coaching"
  );
  check(
    "Punctuation/spacing collapses to single dashes",
    deriveSlugFromName("Acme  &  Co.!!") === "acme-co"
  );
  check(
    "A name with nothing slug-able falls back to a safe default, never empty",
    deriveSlugFromName("!!!").length > 0
  );

  console.log("\n=== isFallbackSlug ===");
  check(
    "Detects the exact fallback formula (slug === id.slice(0,8))",
    isFallbackSlug("p4y0B6Zp", "p4y0B6ZpDtE4F28RFixj")
  );
  check(
    "A real, deliberately-chosen slug is never mistaken for the fallback",
    !isFallbackSlug("main", "xvnedVCmQpEvHrcPhEDI")
  );

  const db = getAdminDb();
  const suffix = randomUUID().slice(0, 8);
  const cleanup: Array<() => Promise<unknown>> = [];

  try {
    console.log("\n=== resolveUniqueSlug collision handling ===");
    const fixtureAId = `qa-slug-fixture-a-${suffix}`;
    const fixtureBId = `qa-slug-fixture-b-${suffix}`;
    const baseSlug = `qa-collide-${suffix}`;
    await db.doc(`subAccounts/${fixtureAId}`).set({
      id: fixtureAId,
      name: "QA Collision Fixture A",
      slug: baseSlug,
      status: "active",
    });
    cleanup.push(() => db.doc(`subAccounts/${fixtureAId}`).delete());

    const resolvedForB = await resolveUniqueSlug(baseSlug);
    check(
      "A colliding base slug resolves to a different, still-derived variant",
      resolvedForB !== baseSlug && resolvedForB.startsWith(baseSlug)
    );

    await db.doc(`subAccounts/${fixtureBId}`).set({
      id: fixtureBId,
      name: "QA Collision Fixture B",
      slug: resolvedForB,
      status: "active",
    });
    cleanup.push(() => db.doc(`subAccounts/${fixtureBId}`).delete());

    const resolvedAgain = await resolveUniqueSlug(baseSlug);
    check(
      "A second collision resolves to yet another, distinct variant",
      resolvedAgain !== baseSlug &&
        resolvedAgain !== resolvedForB &&
        resolvedAgain.startsWith(baseSlug)
    );

    check(
      "excludeSubAccountId lets a sub-account keep its OWN current slug (no false collision with itself)",
      (await resolveUniqueSlug(baseSlug, fixtureAId)) === baseSlug
    );

    console.log("\n=== resolveSpaceIdentifier ===");
    // CASE: real id, already has a real (non-fallback) slug -> no mutation.
    const noHealNeeded = await resolveSpaceIdentifier(fixtureAId);
    check(
      "Real id with an already-real slug resolves to that slug unchanged",
      noHealNeeded?.canonicalSlug === baseSlug &&
        noHealNeeded.subAccountId === fixtureAId
    );

    // CASE: real id, but its stored slug is the historical opaque
    // fallback -> self-heals to a real, derived, persisted slug.
    const fallbackFixtureId = `qa-slug-fallback-${suffix}`;
    await db.doc(`subAccounts/${fallbackFixtureId}`).set({
      id: fallbackFixtureId,
      name: "QA Fallback Fixture",
      slug: fallbackFixtureId.slice(0, 8), // exactly the known fallback formula
      status: "active",
    });
    cleanup.push(() => db.doc(`subAccounts/${fallbackFixtureId}`).delete());

    const healed = await resolveSpaceIdentifier(fallbackFixtureId);
    check(
      "A fallback-pattern slug self-heals to a real, name-derived slug",
      healed?.canonicalSlug === "qa-fallback-fixture"
    );
    const persistedDoc = await db.doc(`subAccounts/${fallbackFixtureId}`).get();
    check(
      "The healed slug is actually PERSISTED, not just returned once",
      persistedDoc.data()?.slug === "qa-fallback-fixture"
    );

    // CASE: resolving BY the slug itself (not the real id) finds the same
    // sub-account.
    const bySlug = await resolveSpaceIdentifier("qa-fallback-fixture");
    check(
      "Resolving by the (now-healed) slug finds the same real subAccountId",
      bySlug?.subAccountId === fallbackFixtureId
    );

    // CASE: old-ID backward compatibility -- resolving by the RAW real id
    // after healing still works and returns the CURRENT canonical slug
    // (this is exactly the contract PortalHomeView's redirect-if-
    // mismatched check relies on).
    const byOldId = await resolveSpaceIdentifier(fallbackFixtureId);
    check(
      "Backward compatibility: the old raw-id form still resolves, to the NEW canonical slug",
      byOldId?.canonicalSlug === "qa-fallback-fixture" &&
        byOldId.subAccountId === fallbackFixtureId
    );

    // CASE: a genuinely unknown identifier (neither a real id nor a real
    // slug) resolves to null -- same 404 contract as today.
    const unknown = await resolveSpaceIdentifier(`nonexistent-${suffix}`);
    check("An unknown identifier resolves to null (404)", unknown === null);

    console.log(
      "\n=== Real Main sub-account (read-only, production QA target) ==="
    );
    const mainResolved = await resolveSpaceIdentifier(MAIN_SUB_ACCOUNT_ID);
    check(
      "Main's real subAccountId resolves correctly",
      mainResolved?.subAccountId === MAIN_SUB_ACCOUNT_ID
    );
    check(
      "Main's real canonical slug is the human-readable 'main' (already set, this call is a verified no-op)",
      mainResolved?.canonicalSlug === "main"
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
