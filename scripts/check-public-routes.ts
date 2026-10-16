/**
 * Public-route contract (Tenant / Public Surfaces, 2026-10-16). Static — no
 * server, no Firebase.
 *
 *   - every top-level route segment the app owns is reserved, so the
 *     root-community rule (`/{communitySlug}` is public) can never expose a
 *     protected page — adding a new top-level route without reserving it
 *     fails here
 *   - webinar registration/join and root community links are public
 *   - protected CRM / agency / API routes stay protected
 *   - pre-existing public routes are unchanged
 *
 * Run: pnpm exec tsx scripts/check-public-routes.ts
 */
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { isPublicPath } from "../src/lib/routing/public-paths";
import { RESERVED_ROOT_SEGMENTS, isRootCommunityPath } from "../src/lib/routing/public-root";

let pass = 0;
function check(label: string, fn: () => void) {
  fn();
  pass++;
  console.log(`  ✓ ${label}`);
}

/** Top-level static segments under src/app, looking through (route groups). */
function topLevelSegments(dir: string, out = new Set<string>()): Set<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.startsWith("(") && name.endsWith(")")) {
      topLevelSegments(p, out);
      continue;
    }
    if (name.startsWith("[") || name.startsWith("_") || name.startsWith("@")) continue;
    out.add(name);
  }
  return out;
}

console.log("Reserved root segments");
check("every top-level app route segment is reserved (a new route must be added to RESERVED_ROOT_SEGMENTS)", () => {
  const missing = [...topLevelSegments("src/app")].filter((s) => !s.includes(".") && !s.startsWith("leadstack-vs-") && !RESERVED_ROOT_SEGMENTS.has(s));
  assert.deepEqual(missing, [], `unreserved top-level routes: ${missing.join(", ")}`);
});
check("no reserved segment is treated as a community slug", () => {
  for (const s of RESERVED_ROOT_SEGMENTS) assert.equal(isRootCommunityPath(`/${s}`), false, s);
});

console.log("\nNewly public (audit fixes)");
check("webinar registration + join pages and their APIs are public", () => {
  for (const p of ["/webinar/sa1/live-class", "/webinar/join/tok.sig", "/api/webinar/sa1/live-class/register", "/api/webinar/access/tok.sig"]) assert.ok(isPublicPath(p), p);
});
check("root community links are public: /{slug} only", () => {
  for (const p of ["/magnetic-visibility", "/q-test", "/magnetic-visibility/"]) assert.ok(isPublicPath(p), p);
  for (const p of ["/Magnetic", "/has.dot", "/a_b", "/-x", "/x/y"]) assert.equal(isRootCommunityPath(p), false, p);
});

console.log("\nStill protected");
check("CRM, agency, account and staff API routes are not public", () => {
  for (const p of [
    "/agency", "/agency/sub-accounts", "/dashboard", "/contacts", "/conversations", "/pipeline", "/tasks", "/calendar",
    "/reports", "/forms", "/me", "/me/settings", "/sa", "/sa/x/dashboard", "/sa/x/energetic-decoder",
    "/api/sub-accounts/x/contacts", "/api/sub-accounts/x/webinars", "/api/agency/plans", "/api/admin/x", "/api/contacts/x",
    "/api/tasks", "/api/conversations/x", "/report-builder-review",
  ]) assert.equal(isPublicPath(p), false, p);
});

console.log("\nUnchanged public routes");
check("existing public surfaces stay public", () => {
  for (const p of [
    "/", "/login", "/signup", "/b/sa/slug", "/booking/slug", "/e/tok", "/f/form1", "/p/page1", "/q/tok", "/pay/tok/status",
    "/offer/sa/o1", "/course/sa/c1", "/courses/slug", "/c/sa/group", "/communities", "/decoder/sa", "/portal/sa/login",
    "/my/login", "/gateway", "/u/tok", "/replay/tok.sig", "/member-password/sa/reset", "/affiliate/login", "/qr",
    "/api/forms/f1/submit", "/api/booking/sa/slug/book", "/leadstack-vs-gohighlevel",
  ]) assert.ok(isPublicPath(p), p);
});

console.log(`\n${pass} checks passed.`);
