/**
 * Regression test for the 2026-09-15 incident: a real client-owner setup
 * email went out with a link to a dead `trycloudflare.com` dev-tunnel
 * hostname, because `NEXT_PUBLIC_APP_URL` had that value live in
 * production. This proves `getAuthEmailOrigin()` (and everything built on
 * it — `buildInviteUrl`, the invite/setup/added email templates) can NEVER
 * again produce a link containing `trycloudflare.com`, `localhost`, or a
 * Vercel preview hostname when `VERCEL_ENV=production` is set — by
 * actually reproducing the exact poisoned-env-var state that caused the
 * incident and asserting the canonical domain wins anyway.
 *
 * Pure function tests — no Firestore, no Firebase Auth, no real email
 * sent, no network. Run:
 *   pnpm exec tsx scripts/test-auth-email-origin.ts
 */
import {
  getAuthEmailOrigin,
  CANONICAL_APP_ORIGIN,
} from "../src/lib/server/app-origin";
import {
  buildInviteUrl,
  renderInviteHtml,
  renderInviteText,
  renderClientOwnerSetupHtml,
  renderClientOwnerSetupText,
} from "../src/lib/server/members-service";

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

const UNSAFE_HOSTNAMES = ["trycloudflare.com", "localhost", ".vercel.app"];

function containsUnsafeHostname(value: string): string | null {
  return UNSAFE_HOSTNAMES.find((h) => value.includes(h)) ?? null;
}

function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T
): T {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    original[key] = process.env[key];
  }
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function main() {
  console.log(
    "=== Reproducing the exact incident: a poisoned NEXT_PUBLIC_APP_URL in real production ==="
  );
  withEnv(
    {
      VERCEL_ENV: "production",
      NEXT_PUBLIC_APP_URL:
        "https://douglas-spatial-dow-villages.trycloudflare.com",
    },
    () => {
      const origin = getAuthEmailOrigin();
      check(
        "getAuthEmailOrigin() ignores the poisoned env var in production",
        origin === CANONICAL_APP_ORIGIN
      );
      check(
        "Canonical origin contains no unsafe hostname",
        containsUnsafeHostname(origin) === null
      );

      const inviteUrl = buildInviteUrl("client-owner@example.invalid");
      check(
        "buildInviteUrl() starts with the canonical CRM domain",
        inviteUrl.startsWith(CANONICAL_APP_ORIGIN)
      );
      check(
        "buildInviteUrl() contains no unsafe hostname",
        containsUnsafeHostname(inviteUrl) === null
      );

      const staffText = renderInviteText({
        inviterName: "Quiana",
        subAccountName: "Test",
        roleLabel: "Admin",
        inviteUrl,
        brandName: "Magnetix Studios",
      });
      const staffHtml = renderInviteHtml({
        inviterName: "Quiana",
        subAccountName: "Test",
        roleLabel: "Admin",
        inviteUrl,
        brandName: "Magnetix Studios",
      });
      check(
        "Generic staff invite text has no unsafe hostname",
        containsUnsafeHostname(staffText) === null
      );
      check(
        "Generic staff invite HTML has no unsafe hostname",
        containsUnsafeHostname(staffHtml) === null
      );
      check(
        "Generic staff invite HTML's CTA and fallback link both use the canonical domain",
        (staffHtml.match(new RegExp(CANONICAL_APP_ORIGIN, "g")) ?? []).length >=
          2
      );

      const ownerText = renderClientOwnerSetupText({
        subAccountName: "Test",
        inviteUrl,
        brandName: "Magnetix Studios",
      });
      const ownerHtml = renderClientOwnerSetupHtml({
        subAccountName: "Test",
        inviteUrl,
        brandName: "Magnetix Studios",
      });
      check(
        "Client-owner setup text has no unsafe hostname",
        containsUnsafeHostname(ownerText) === null
      );
      check(
        "Client-owner setup HTML has no unsafe hostname",
        containsUnsafeHostname(ownerHtml) === null
      );
      check(
        "Client-owner setup HTML's CTA and fallback link both use the canonical domain",
        (ownerHtml.match(new RegExp(CANONICAL_APP_ORIGIN, "g")) ?? []).length >=
          2
      );

      console.log(
        "\n=== The product/UX fix: client-owner copy vs. generic staff copy ==="
      );
      check(
        'Client-owner email does NOT say "invited you"',
        !ownerText.includes("invited you") && !ownerHtml.includes("invited you")
      );
      check(
        'Client-owner email does NOT emphasize "join as" a role',
        !ownerText.includes("join as") && !ownerHtml.includes("join as")
      );
      check(
        'Client-owner CTA reads "Set up your account"',
        ownerHtml.includes("Set up your account")
      );
      check(
        "Generic staff invite still says the inviter's name (unaffected)",
        staffText.includes("Quiana invited you") &&
          staffHtml.includes("Quiana") &&
          staffHtml.includes("invited you")
      );
      check(
        'Generic staff invite CTA is unchanged ("Accept invite")',
        staffHtml.includes("Accept invite")
      );
    }
  );

  console.log("\n=== Vercel preview: real preview URL, never a tunnel ===");
  withEnv(
    {
      VERCEL_ENV: "preview",
      VERCEL_URL: "magnetix-studios-git-feature-abc123.vercel.app",
      NEXT_PUBLIC_APP_URL:
        "https://douglas-spatial-dow-villages.trycloudflare.com",
    },
    () => {
      const origin = getAuthEmailOrigin();
      check(
        "Preview uses Vercel's own real preview URL, not the poisoned env var",
        origin === "https://magnetix-studios-git-feature-abc123.vercel.app"
      );
      check(
        "Preview origin contains no trycloudflare/localhost",
        !origin.includes("trycloudflare.com") && !origin.includes("localhost")
      );
    }
  );

  console.log(
    "\n=== Local dev: NEXT_PUBLIC_APP_URL respected (tunneling still works) ==="
  );
  withEnv(
    { VERCEL_ENV: undefined, NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
    () => {
      const origin = getAuthEmailOrigin();
      check(
        "Local dev falls back to NEXT_PUBLIC_APP_URL",
        origin === "http://localhost:3000"
      );
    }
  );
  withEnv({ VERCEL_ENV: undefined, NEXT_PUBLIC_APP_URL: undefined }, () => {
    const origin = getAuthEmailOrigin();
    check(
      "No env vars at all falls back to localhost:3000",
      origin === "http://localhost:3000"
    );
  });

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

main();
