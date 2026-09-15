/**
 * Regression test for the "Switch MyMagnetix account" bug (2026-09-16):
 * clicking Switch on the cross-identity mismatch screen cleared the old
 * mm_session correctly, hard-navigated to /my/login?email=..., but then
 * bounced straight back to the SAME mismatch screen instead of rendering
 * the login form with the CRM email prefilled.
 *
 * ROOT CAUSE (traced by code reading + this test, no production credential
 * probing needed): /my/login's own PRE-EXISTING Portal-Member -> MyMagnetix
 * auto-bridge (2026-08-16, unrelated to this task) redirects to
 * /api/my/bridge-from-member whenever an `ls_member_session` cookie is
 * merely PRESENT -- completely independent of the new `email` query param.
 * If the browser also happens to hold a stale/unrelated ls_member_session
 * (very plausible after this much Member/Portal QA), that auto-bridge
 * fires immediately after the intentional mm_session clear, silently
 * mints a BRAND NEW mm_session for whatever Person that Member session
 * resolves to, and redirects straight to /gateway -- reproducing the
 * mismatch screen again without the login form ever rendering. This
 * matches the reported symptom exactly (no prefill ever seen, "switch"
 * appears to silently no-op).
 *
 * THE FIX (src/app/my/login/page.tsx): an `email` query param means a
 * caller (this mismatch screen's "Switch" action, or
 * GatewayMyMagnetixButton's no-relationships-yet redirect) is requesting
 * a SPECIFIC identity -- both existing callers exist precisely because
 * the active session is wrong or absent. Whenever that param is present,
 * /my/login now (a) skips the Portal-Member auto-bridge entirely, and
 * (b) only takes its own "already signed in, skip the form" shortcut if
 * the ALREADY-active MyMagnetix session already matches the requested
 * email. The unrelated default behavior (no email param -- the normal
 * Portal -> MyMagnetix convenience bridge most visitors hit) is
 * unchanged, verified below.
 *
 * This test starts a REAL local `next dev` server (no .env.local in this
 * worktree, so the Firebase auth middleware self-disables and every
 * request bypasses it entirely -- see middleware.ts's own explicit `if
 * (!apiKey || !projectId) return NextResponse.next()` escape hatch,
 * exercised here, not worked around). It sends an arbitrary, structurally
 * invalid ls_member_session cookie VALUE -- never a real or fabricated
 * credential -- because the bug/fix under test is entirely about cookie
 * PRESENCE deciding whether to redirect, not about that cookie's
 * cryptographic validity (verifyMemberSessionToken is never reached by
 * either code path this test exercises). Nothing here touches production,
 * mints a working session for any real or fixture identity, or requires
 * Firebase credentials of any kind.
 *
 * Run: pnpm exec tsx scripts/test-mymagnetix-switch.ts
 * (deliberately NOT run through the _server-only-shim/tsx-with-Firebase
 * pattern other scripts use -- this one starts its own throwaway dev
 * server instead of importing app code directly.)
 */
import { spawn, type ChildProcess } from "node:child_process";

const PORT = 3912;
const BASE = `http://localhost:${PORT}`;
const GARBAGE_MEMBER_COOKIE =
  "ls_member_session=not-a-real-token-this-is-only-testing-cookie-presence";

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

async function waitForServer(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/my/login`, { redirect: "manual" });
      if (res.status > 0) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  let server: ChildProcess | null = null;
  try {
    console.log("Starting throwaway local dev server (no Firebase env)...");
    server = spawn("pnpm", ["exec", "next", "dev", "-p", String(PORT)], {
      stdio: "ignore",
      detached: true,
    });

    const up = await waitForServer(60_000);
    check("Local dev server came up", up);
    if (!up) throw new Error("Dev server never became reachable");

    // === CASE: default behavior unchanged (no `email` param) ===
    console.log(
      "\n=== Default behavior: no email param + stale member cookie ==="
    );
    const resDefault = await fetch(`${BASE}/my/login`, {
      redirect: "manual",
      headers: { Cookie: GARBAGE_MEMBER_COOKIE },
    });
    check(
      "Still auto-bridges (307) when no explicit identity was requested",
      resDefault.status === 307
    );
    check(
      "Bridge redirect still targets /api/my/bridge-from-member",
      (resDefault.headers.get("location") ?? "").startsWith(
        "/api/my/bridge-from-member"
      )
    );

    // === CASE: the actual reported bug -- email param + stale member
    // cookie must NOT auto-bridge, must render the form instead ===
    console.log(
      "\n=== Fixed case: email param + stale member cookie (the reported bug) ==="
    );
    const resSwitch = await fetch(
      `${BASE}/my/login?email=${encodeURIComponent("quianalache@gmail.com")}`,
      { redirect: "manual", headers: { Cookie: GARBAGE_MEMBER_COOKIE } }
    );
    check(
      "No longer redirects away (renders the form directly)",
      resSwitch.status === 200
    );
    const switchBody = await resSwitch.text();
    check(
      "Email is prefilled as the input's actual value",
      switchBody.includes('value="quianalache@gmail.com"')
    );

    // === CASE: email param + no member cookie at all (baseline, should
    // always have worked, confirms the fix didn't only work by accident
    // alongside the member cookie) ===
    console.log("\n=== email param, no member cookie at all ===");
    const resNoMember = await fetch(
      `${BASE}/my/login?email=${encodeURIComponent("quianalache@gmail.com")}`,
      { redirect: "manual" }
    );
    check("Renders the form (200)", resNoMember.status === 200);
    const noMemberBody = await resNoMember.text();
    check(
      "Email is prefilled here too",
      noMemberBody.includes('value="quianalache@gmail.com"')
    );

    // === CASE: malformed email param is never trusted/reflected ===
    console.log("\n=== Malformed email param is rejected, not reflected ===");
    const resBadEmail = await fetch(`${BASE}/my/login?email=not-an-email`, {
      redirect: "manual",
      headers: { Cookie: GARBAGE_MEMBER_COOKIE },
    });
    check(
      "Malformed email still auto-bridges (treated as no explicit request)",
      resBadEmail.status === 307
    );

    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  } finally {
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        server.kill("SIGTERM");
      }
    }
  }

  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL", err);
    process.exit(1);
  });
