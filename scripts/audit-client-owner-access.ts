/**
 * Read-only audit: for every real sub-account with an accountContact email
 * set, report whether that email has real CRM/Business Center access
 * (active membership), a pending invite, or none at all. Uses the exact
 * same status function ("@/lib/server/sub-accounts-service"'s
 * getClientOwnerAccessStatus) the Settings → Admin UI and the
 * client-owner-access API route use, so this can never disagree with what
 * the product itself considers "provisioned".
 *
 * Counts only by default — never exposes secrets, never writes anything,
 * never sends an email. Pass a subAccountId as an argv to print that one
 * sub-account's accountContact email and status (useful for spot-checking
 * a single workspace) — still read-only.
 *
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/audit-client-owner-access.ts
 */
import { readFileSync } from "node:fs";

const ENV_PATH = "/Users/quianamatthews/Documents/magnetix_studios/.env.local";
for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (process.env[m[1]] === undefined) process.env[m[1]] = v;
}

async function main() {
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { getClientOwnerAccessStatus } =
    await import("../src/lib/server/sub-accounts-service");

  const db = getAdminDb();
  const snap = await db.collection("subAccounts").get();
  console.log(
    `=== Client-owner access audit (${snap.size} sub-account(s)) ===\n`
  );

  let withContact = 0;
  let active = 0;
  let pending = 0;
  let none = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const email = d.accountContact?.email ?? null;
    const label = `#${d.accountNumber} "${d.name}" (${doc.id})`;
    if (!email) {
      console.log(`${label}: no account contact set`);
      continue;
    }
    withContact += 1;
    const status = await getClientOwnerAccessStatus(doc.id, email);
    if (status === "active") active += 1;
    else if (status === "pending") pending += 1;
    else none += 1;
    console.log(
      `${label}: account contact set, CRM access = ${status.toUpperCase()}`
    );
  }

  console.log(`\n=== Summary ===`);
  console.log(`Sub-accounts with an account contact email: ${withContact}`);
  console.log(`  active:  ${active}`);
  console.log(`  pending: ${pending}`);
  console.log(`  none (real gap):  ${none}`);
  console.log(
    "\n=== DONE (read-only, no documents modified, no emails sent) ==="
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL", err);
    process.exit(1);
  });
