/**
 * Regression test for the Stripe Billing Portal return_url fix
 * (2026-09-16): /api/my/billing/portal used to build its return_url from
 * NEXT_PUBLIC_APP_URL directly — the same env var behind the
 * trycloudflare.com auth-email incident (see app-origin.ts's own doc
 * comment and scripts/test-auth-email-origin.ts, which already covers
 * getAuthEmailOrigin()'s own VERCEL_ENV-based resolution in full — not
 * duplicated here).
 *
 * This test is structural (reads the actual route source) rather than
 * invoking the real function, since createPersonBillingPortalSession
 * requires a real Stripe Connect account + a real subscription/billing
 * customer trio to reach the return_url line at all — exercising that
 * live is exactly the "do not build a new purchase-detail subsystem" /
 * "do not duplicate URL-origin logic" task boundary; the thing actually
 * worth asserting here is simply "this route now goes through the one
 * canonical helper, not the poisoned env var, and duplicates no origin
 * logic of its own."
 *
 * Run: pnpm exec tsx scripts/test-purchases-billing-portal-origin.ts
 */
import { readFileSync } from "node:fs";

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

function main() {
  const routeSrc = readFileSync(
    "src/app/api/my/billing/portal/route.ts",
    "utf8"
  );

  console.log("=== /api/my/billing/portal return_url origin ===");
  check(
    "Imports the canonical getAuthEmailOrigin helper",
    /import\s*\{\s*getAuthEmailOrigin\s*\}\s*from\s*["']@\/lib\/server\/app-origin["']/.test(
      routeSrc
    )
  );
  check(
    "return_url is built from getAuthEmailOrigin(), not NEXT_PUBLIC_APP_URL directly",
    // The route's own doc comment names NEXT_PUBLIC_APP_URL (explaining
    // what this fixed) — the real assertion is that no CODE reads it,
    // not that the string never appears at all.
    routeSrc.includes("getAuthEmailOrigin()") &&
      !routeSrc.includes("process.env.NEXT_PUBLIC_APP_URL")
  );
  check(
    "No local duplicate origin-resolution helper remains in this route",
    !/function\s+appOrigin\s*\(/.test(routeSrc)
  );
  check(
    "Return destination is the canonical Purchases URL",
    routeSrc.includes("${getAuthEmailOrigin()}/my/purchases")
  );

  const appOriginSrc = readFileSync("src/lib/server/app-origin.ts", "utf8");
  check(
    "The canonical helper itself still resolves to the stable production domain in production (VERCEL_ENV) — unchanged by this task",
    appOriginSrc.includes(
      'CANONICAL_APP_ORIGIN = "https://crm.magnetixstudios.com"'
    ) && appOriginSrc.includes('VERCEL_ENV === "production"')
  );

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

main();
