/**
 * Contacts & Tags (2026-11) — tag registry migration for ONE workspace.
 *
 * Step 1 (default): DRY RUN, read-only. Reports every tag name found on
 * contacts and in settings, spelling variants of the same tag, look-alike
 * names, contact counts, configuration references, names the registry
 * can't hold, and what a backfill would register.
 *
 * Step 2 (--apply): registers each tag that has no registry entry, under
 * its most-used spelling. Never merges or rewrites anything: contacts and
 * settings are untouched, so segmentation results cannot change. Spelling
 * variants stay as they are for the creator to review in Contacts → Tags.
 *
 * Step 3: the run re-reads the library afterwards and checks that every
 * tag is registered (or reported as legacy-only) and that no contact
 * count moved.
 *
 * Safety: runs against the Firestore EMULATOR by default. Production needs
 * BOTH --allow-production and the owner's explicit approval for the
 * workspace — this script is never run by the build or by deploys.
 *
 * Emulator run (from the repo root):
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore --project demo-tags \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/contact-tags-backfill.ts --sub-account <id> [--apply]"
 */
import { initializeApp } from "firebase-admin/app";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const SA = arg("sub-account");
const APPLY = flag("apply");
const ALLOW_PROD = flag("allow-production");
const PROJECT = process.env.GCLOUD_PROJECT ?? "";
const onEmulator = !!process.env.FIRESTORE_EMULATOR_HOST && PROJECT.startsWith("demo-");

if (!SA) {
  console.error("Usage: --sub-account <id> [--apply] [--allow-production]");
  process.exit(1);
}
if (!onEmulator && !ALLOW_PROD) {
  console.error("Refusing to run outside the Firestore emulator. Production needs --allow-production and the owner's approval.");
  process.exit(1);
}

async function main() {
  if (onEmulator) {
    process.env.FIREBASE_ADMIN_PROJECT_ID ??= PROJECT;
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= PROJECT;
    initializeApp({ projectId: PROJECT });
  }
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const service = await import("../src/lib/server/contact-tags/service");
  const registry = await import("../src/lib/server/contact-tags/registry");
  const sub = await getAdminDb().doc(`subAccounts/${SA}`).get();
  if (!sub.exists) throw new Error(`Workspace ${SA} not found.`);
  const agencyId = String(sub.get("agencyId") ?? "");

  const before = await service.listTags({ subAccountId: SA!, territoryIds: null, canManage: true });
  const groups = await service.listDuplicateGroups(SA!, null);
  const unregistered = before.tags.filter((t) => !t.registered);
  const legacy = before.tags.filter((t) => t.legacyOnly);

  console.log(`\nTag inventory — workspace ${SA} (${sub.get("name") ?? ""})`);
  console.log(`  tags found:            ${before.tags.length}`);
  console.log(`  already registered:    ${before.tags.length - unregistered.length}`);
  console.log(`  would register:        ${unregistered.filter((t) => !t.legacyOnly).length}`);
  console.log(`  legacy-only names:     ${legacy.length} (too long or contain a comma — kept on contacts, not registered)`);
  console.log(`  possible duplicates:   ${groups.length} group(s) — review in Contacts → Tags, never merged automatically`);
  console.log("\n  name | contacts | settings | registered | spelling variants");
  for (const t of before.tags) {
    const variants = t.variants.map((v) => `${v.name} (${v.contactCount})`).join(", ");
    console.log(`  ${t.name} | ${t.contactCount} | ${t.usageCount} | ${t.registered ? "yes" : "no"}${variants ? ` | ${variants}` : ""}`);
  }
  if (groups.length) {
    console.log("\n  Look-alike groups:");
    for (const g of groups) console.log(`    - ${g.tags.map((t) => t.name).join("  ≈  ")}`);
  }

  if (!APPLY) {
    console.log("\nDry run only — nothing written. Re-run with --apply to register the tags above.");
    return;
  }

  let registered = 0;
  for (const t of unregistered) {
    if (t.legacyOnly) continue;
    const res = await registry.createRegistryTag({
      subAccountId: SA!,
      agencyId,
      name: t.name,
      createdByUid: null,
      createdVia: "backfill",
    });
    if (res.status === "created") registered++;
  }
  const after = await service.listTags({ subAccountId: SA!, territoryIds: null, canManage: true });
  const stillMissing = after.tags.filter((t) => !t.registered && !t.legacyOnly);
  const countBefore = new Map(before.tags.map((t) => [t.name.toLowerCase(), t.contactCount]));
  const moved = after.tags.filter((t) => countBefore.has(t.name.toLowerCase()) && countBefore.get(t.name.toLowerCase()) !== t.contactCount);
  console.log(`\nRegistered ${registered} tag(s).`);
  console.log(`Validation: unregistered (non-legacy) tags left: ${stillMissing.length}; contact counts changed: ${moved.length}.`);
  if (stillMissing.length || moved.length) {
    console.error("Validation FAILED — investigate before continuing.");
    process.exit(1);
  }
  console.log("Validation passed — contacts and settings were not modified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
