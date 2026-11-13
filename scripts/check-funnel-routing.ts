/**
 * Funnel Phase 2 — PURE routing checks (no Firestore): route resolution,
 * loop detection, funnel warnings / errors and the save validators.
 *
 * Run: pnpm exec tsx scripts/check-funnel-routing.ts
 */
import assert from "node:assert/strict";
import { analyzeFunnel, describeEdge, edgesFor, newLoopSteps, normalizeRouting, routingProblem, stepsInLoops, type RoutingStep } from "../src/lib/checkout/funnel-routing";
import type { PostPurchaseDestination } from "../src/types/checkout";

let passes = 0;
let failures = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    passes++;
    console.log(`  ok  ${label}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL ${label}\n       ${(err as Error).message}`);
  }
}

const step = (id: string, type: RoutingStep["type"], extra: Partial<RoutingStep> = {}): RoutingStep => ({ id, name: id.toUpperCase(), type, pageId: `p_${id}`, routing: null, ...extra });
const to = (stepId: string) => ({ type: "funnel_step" as const, stepId });
const next = { type: "funnel_next_step" as const };
// sales → checkout → upsell → downsell → thanks
const base = (): RoutingStep[] => [step("sales", "page"), step("co", "checkout", { pageId: null }), step("up", "upsell"), step("down", "downsell"), step("ty", "thank_you")];
const coNext: Record<string, PostPurchaseDestination | null> = { co: { type: "funnel_next_step" } };
const pages = { p_sales: { name: "Sales", status: "published" }, p_up: { name: "Up", status: "published" }, p_down: { name: "Down", status: "published" }, p_ty: { name: "TY", status: "published" } };

console.log("\nRoutes");
check("defaults: routing absent → next step for Accept and Decline", () => assert.deepEqual(normalizeRouting(undefined), { accept: next, decline: next }));
check("malformed routing falls back to next step", () => assert.deepEqual(normalizeRouting({ accept: { type: "x" }, decline: { type: "funnel_step", stepId: "bad id!" } }), { accept: next, decline: next }));
check("page step → next step; last step → end", () => {
  const s = base();
  assert.equal(edgesFor(s, 0, null)[0].target, "co");
  assert.equal(edgesFor(s, 4, null)[0].target, null);
});
check("upsell accept/decline resolve", () => {
  const s = base();
  s[2].routing = { accept: to("ty"), decline: to("down") };
  const e = edgesFor(s, 2, null);
  assert.deepEqual(e.map((x) => [x.key, x.target]), [["accept", "ty"], ["decline", "down"]]);
  assert.equal(describeEdge(s, e[0]), "Step 5 · TY");
});
check("checkout uses its post-purchase destination; Space is external", () => {
  const s = base();
  assert.equal(edgesFor(s, 1, { type: "funnel_next_step" })[0].target, "up");
  assert.equal(edgesFor(s, 1, { type: "space" })[0].external, "space");
  assert.equal(edgesFor(s, 1, null)[0].external, "space");
});
check("a route to a removed step reads as missing", () => {
  const s = base();
  s[2].routing = { accept: to("gone"), decline: next };
  assert.equal(edgesFor(s, 2, null)[0].target, "missing");
});

console.log("\nLoops");
check("normal funnel has no loop", () => assert.equal(stepsInLoops(base(), coNext).size, 0));
check("decline back to the sales page loops through checkout", () => {
  const s = base();
  s[3].routing = { accept: next, decline: to("sales") };
  assert.deepEqual([...stepsInLoops(s, coNext)].sort(), ["co", "down", "sales", "up"]);
});
check("routingProblem refuses a looping route, self route and foreign step", () => {
  const s = base();
  assert.match(routingProblem(s, "down", { accept: next, decline: to("sales") }, coNext) ?? "", /loop/);
  assert.match(routingProblem(s, "up", { accept: to("up"), decline: next }, coNext) ?? "", /same step/);
  assert.match(routingProblem(s, "up", { accept: to("other-funnel-step"), decline: next }, coNext) ?? "", /this funnel/);
  assert.equal(routingProblem(s, "up", { accept: to("ty"), decline: to("down") }, coNext), null);
});
check("reorder that creates a loop is detected; a harmless reorder isn't", () => {
  // Upsell declines to "next step"; downsell declines back to the upsell.
  const s = base();
  s[2].routing = { accept: to("ty"), decline: next };
  s[3].routing = { accept: to("ty"), decline: to("up") };
  const downFirst = [s[0], s[1], s[3], s[2], s[4]]; // up's next = ty → no loop
  assert.equal(stepsInLoops(downFirst, coNext).size, 0);
  // Moving the upsell before the downsell makes up → (next) down → up.
  assert.deepEqual(newLoopSteps(downFirst, s, coNext).sort(), ["down", "up"]);
  // A thank-you page placed BEFORE the pair also loops: accept → thank you → (next) downsell → (decline) upsell → (accept) thank you.
  assert.deepEqual(newLoopSteps(downFirst, [s[0], s[1], s[4], s[3], s[2]], coNext).sort(), ["down", "ty", "up"]);
  // Re-saving the same order adds nothing.
  assert.deepEqual(newLoopSteps(downFirst, [...downFirst], coNext), []);
});

console.log("\nFunnel analysis");
check("valid funnel: no errors", () => assert.equal(analyzeFunnel({ steps: base(), checkoutDestinations: coNext, pages }).filter((i) => i.level === "error").length, 0));
check("missing route target is an error", () => {
  const s = base();
  s[2].routing = { accept: to("gone"), decline: next };
  assert.ok(analyzeFunnel({ steps: s, checkoutDestinations: coNext, pages }).some((i) => i.code === "route_missing" && i.level === "error"));
});
check("checkout post-purchase to a missing step is an error", () => {
  assert.ok(analyzeFunnel({ steps: base(), checkoutDestinations: { co: { type: "funnel_step", stepId: "gone" } }, pages }).some((i) => i.code === "checkout_route_missing"));
});
check("loop is an error", () => {
  const s = base();
  s[3].routing = { accept: next, decline: to("sales") };
  assert.ok(analyzeFunnel({ steps: s, checkoutDestinations: coNext, pages }).some((i) => i.code === "loop" && i.level === "error"));
});
check("unreachable step is a warning", () => {
  const s = base();
  s[2].routing = { accept: to("ty"), decline: to("ty") }; // nothing reaches "down"
  const issues = analyzeFunnel({ steps: s, checkoutDestinations: coNext, pages });
  assert.ok(issues.some((i) => i.code === "unreachable" && i.stepId === "down" && i.level === "warning"));
});
check("checkout to Space makes later steps unreachable (warning, not error)", () => {
  const issues = analyzeFunnel({ steps: base(), checkoutDestinations: { co: { type: "space" } }, pages });
  assert.ok(issues.some((i) => i.code === "unreachable" && i.stepId === "up"));
  assert.equal(issues.filter((i) => i.level === "error").length, 0);
});
check("page warnings: none, deleted, draft, shared upsell page", () => {
  const s = base();
  s[0].pageId = null;
  s[4].pageId = "p_deleted";
  const issues = analyzeFunnel({ steps: s, checkoutDestinations: coNext, pages: { ...pages, p_down: { name: "Down", status: "draft" } }, pageUses: { p_up: 2 } });
  const codes = issues.map((i) => `${i.code}:${i.stepId}`);
  for (const c of ["no_page:sales", "page_missing:ty", "page_unpublished:down", "page_shared:up"]) assert.ok(codes.includes(c), c);
  assert.ok(issues.filter((i) => ["no_page", "page_missing", "page_unpublished", "page_shared"].includes(i.code)).every((i) => i.level === "warning"));
});
check("checkout with the hosted page needs no page", () => assert.ok(!analyzeFunnel({ steps: base(), checkoutDestinations: coNext, pages }).some((i) => i.stepId === "co" && i.code === "no_page")));

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
