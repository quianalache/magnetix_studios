import type { FunnelStep, FunnelStepType, PostPurchaseDestination, StepRoute, StepRouting } from "@/types/checkout";

/**
 * Funnel routing — PURE rules (Funnel Phase 2, 2026-11). Shared by the
 * server (save / reorder / publish validation) and the funnel hub (route
 * summaries, warnings). No Firestore here.
 *
 * Where a buyer goes after each step:
 *   Page, Thank you   → the next step in order (unchanged sequential model)
 *   Checkout          → its post-purchase destination (Checkout Settings stay
 *                       the one place that edits it; the hub only shows it)
 *   Upsell, Downsell  → Accept and Decline routes stored on the step
 * A route is "next step" or a chosen step in the SAME funnel. Routes to a
 * missing step, to the step itself, or that make buyers loop are refused.
 */

export const NEXT_STEP: StepRoute = { type: "funnel_next_step" };
export const DEFAULT_ROUTING: StepRouting = { accept: NEXT_STEP, decline: NEXT_STEP };

export const STEP_TYPE_LABELS: Record<FunnelStepType, string> = {
  page: "Page",
  checkout: "Checkout",
  upsell: "Upsell",
  downsell: "Downsell",
  thank_you: "Thank you",
};

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function hasRouting(type: FunnelStepType): boolean {
  return type === "upsell" || type === "downsell";
}

/** Each step type that shows a page needs one; Checkout can use the hosted checkout. */
export function needsPage(type: FunnelStepType): boolean {
  return type !== "checkout";
}

export function normalizeRoute(raw: unknown): StepRoute | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.type === "funnel_next_step") return NEXT_STEP;
  if (r.type === "funnel_step" && typeof r.stepId === "string" && ID.test(r.stepId)) return { type: "funnel_step", stepId: r.stepId };
  return null;
}

/** Stored routing with defaults (absent / malformed → next step). */
export function normalizeRouting(raw: unknown): StepRouting {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { accept: normalizeRoute(r.accept) ?? NEXT_STEP, decline: normalizeRoute(r.decline) ?? NEXT_STEP };
}

export type RoutingStep = Pick<FunnelStep, "id" | "name" | "type" | "pageId" | "routing">;

/** One outgoing route of a step, resolved against the funnel's current order. */
export interface RouteEdge {
  /** accept / decline (upsell, downsell) · after_purchase (checkout) · next (page, thank you) */
  key: "accept" | "decline" | "after_purchase" | "next";
  /** Target step id; null = the funnel ends here; "missing" = points at a step that doesn't exist. */
  target: string | null | "missing";
  /** True when the route is "next step" rather than a chosen step. */
  sequential: boolean;
  /** Checkout only: leaves the funnel (Space, a page or a URL). */
  external?: "space" | "page" | "url";
}

export function edgesFor(steps: RoutingStep[], index: number, checkoutDest: PostPurchaseDestination | null | undefined): RouteEdge[] {
  const step = steps[index];
  const next = steps[index + 1]?.id ?? null;
  const ids = new Set(steps.map((s) => s.id));
  const resolve = (route: StepRoute, key: RouteEdge["key"]): RouteEdge =>
    route.type === "funnel_next_step"
      ? { key, target: next, sequential: true }
      : { key, target: ids.has(route.stepId) && route.stepId !== step.id ? route.stepId : "missing", sequential: false };
  if (hasRouting(step.type)) {
    const r = normalizeRouting(step.routing);
    return [resolve(r.accept, "accept"), resolve(r.decline, "decline")];
  }
  if (step.type === "checkout") {
    const d = checkoutDest ?? { type: "space" as const };
    if (d.type === "funnel_next_step") return [resolve(NEXT_STEP, "after_purchase")];
    if (d.type === "funnel_step") return [resolve({ type: "funnel_step", stepId: d.stepId }, "after_purchase")];
    return [{ key: "after_purchase", target: null, sequential: false, external: d.type }];
  }
  return [{ key: "next", target: next, sequential: true }];
}

/** Steps that sit on a loop (strongly connected components with a cycle). */
export function stepsInLoops(steps: RoutingStep[], checkoutDest: Record<string, PostPurchaseDestination | null>): Set<string> {
  const adj = new Map<string, string[]>();
  steps.forEach((s, i) => adj.set(s.id, edgesFor(steps, i, checkoutDest[s.id]).map((e) => e.target).filter((t): t is string => !!t && t !== "missing")));
  // Tarjan's SCC.
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  const out = new Set<string>();
  const visit = (v: string) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    on.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1 || (adj.get(v) ?? []).includes(v)) comp.forEach((c) => out.add(c));
    }
  };
  for (const s of steps) if (!idx.has(s.id)) visit(s.id);
  return out;
}

export interface FunnelIssue {
  level: "error" | "warning";
  code: "route_missing" | "checkout_route_missing" | "loop" | "unreachable" | "no_page" | "page_missing" | "page_unpublished" | "page_shared" | "offer_missing" | "offer_unavailable" | "crm_needs_attention";
  stepId: string | null;
  message: string;
}

export interface FunnelAnalysisInput {
  steps: RoutingStep[];
  checkoutDestinations: Record<string, PostPurchaseDestination | null>;
  /** This workspace's pages (id → name / status). */
  pages: Record<string, { name: string; status: string }>;
  /** pageId → how many funnel steps in the workspace use it (incl. this funnel). */
  pageUses?: Record<string, number>;
}

/** "Step 3 · Thank you" */
export function stepLabel(steps: RoutingStep[], id: string): string {
  const i = steps.findIndex((s) => s.id === id);
  return i < 0 ? "a missing step" : `Step ${i + 1} · ${steps[i].name}`;
}

export function describeEdge(steps: RoutingStep[], edge: RouteEdge): string {
  if (edge.external === "space") return "their Space";
  if (edge.external === "page") return "a page outside this funnel";
  if (edge.external === "url") return "a web address";
  if (edge.target === "missing") return "a step that no longer exists";
  if (edge.target === null) return "end of funnel";
  return `${edge.sequential ? "next step · " : ""}${stepLabel(steps, edge.target)}`;
}

/** Everything the hub needs to warn about; errors also block publishing. */
export function analyzeFunnel(input: FunnelAnalysisInput): FunnelIssue[] {
  const { steps, checkoutDestinations: dest, pages, pageUses = {} } = input;
  const issues: FunnelIssue[] = [];
  const name = (i: number) => `Step ${i + 1} · ${steps[i].name}`;
  steps.forEach((s, i) => {
    for (const e of edgesFor(steps, i, dest[s.id])) {
      if (e.target !== "missing") continue;
      if (e.key === "after_purchase") issues.push({ level: "error", code: "checkout_route_missing", stepId: s.id, message: `${name(i)}: after purchase, buyers are sent to a step that no longer exists. Choose a new destination in its Checkout settings.` });
      else issues.push({ level: "error", code: "route_missing", stepId: s.id, message: `${name(i)}: the ${e.key === "accept" ? "Accept" : "Decline"} route points to a step that no longer exists.` });
    }
    if (needsPage(s.type)) {
      if (!s.pageId) issues.push({ level: "warning", code: "no_page", stepId: s.id, message: `${name(i)}: no page yet. Choose one so visitors have something to see.` });
      else if (!pages[s.pageId]) issues.push({ level: "warning", code: "page_missing", stepId: s.id, message: `${name(i)}: its page was deleted. Choose another page.` });
      else if (pages[s.pageId].status !== "published") issues.push({ level: "warning", code: "page_unpublished", stepId: s.id, message: `${name(i)}: “${pages[s.pageId].name}” isn't published, so visitors can't see it yet.` });
      if (s.pageId && hasRouting(s.type) && (pageUses[s.pageId] ?? 0) > 1) issues.push({ level: "warning", code: "page_shared", stepId: s.id, message: `${name(i)}: its page is also used by another funnel step. Give this ${s.type} its own copy so the two can be edited separately.` });
    }
  });
  const loops = stepsInLoops(steps, dest);
  if (loops.size) {
    const names = steps.map((s, i) => (loops.has(s.id) ? name(i) : null)).filter(Boolean);
    issues.push({ level: "error", code: "loop", stepId: null, message: `These steps send buyers in a loop: ${names.join(", ")}. Change one of their routes.` });
  }
  // Reachability from the first step.
  if (steps.length > 1) {
    const seen = new Set<string>([steps[0].id]);
    const queue = [0];
    while (queue.length) {
      const i = queue.shift()!;
      for (const e of edgesFor(steps, i, dest[steps[i].id])) {
        if (!e.target || e.target === "missing" || seen.has(e.target)) continue;
        seen.add(e.target);
        queue.push(steps.findIndex((s) => s.id === e.target));
      }
    }
    steps.forEach((s, i) => {
      if (!seen.has(s.id)) issues.push({ level: "warning", code: "unreachable", stepId: s.id, message: `${name(i)}: can't be reached, because no step sends buyers to it.` });
    });
  }
  return issues;
}

/**
 * Validate new routing for ONE step against the funnel as it would be after
 * the save. Returns a plain-language problem, or null when it's fine. Only
 * problems this step causes are reported (an unrelated existing issue never
 * blocks the save).
 */
export function routingProblem(steps: RoutingStep[], stepId: string, routing: StepRouting, checkoutDestinations: Record<string, PostPurchaseDestination | null>): string | null {
  const ids = new Set(steps.map((s) => s.id));
  for (const [key, route] of [["Accept", routing.accept], ["Decline", routing.decline]] as const) {
    if (route.type !== "funnel_step") continue;
    if (route.stepId === stepId) return `The ${key} route can't send buyers back to this same step.`;
    if (!ids.has(route.stepId)) return `The ${key} route must point to a step in this funnel.`;
  }
  const after = steps.map((s) => (s.id === stepId ? { ...s, routing } : s));
  if (stepsInLoops(after, checkoutDestinations).has(stepId)) return "That route would send buyers in a loop. Choose a step that doesn't lead back here.";
  return null;
}

/** Steps that would newly sit on a loop after a change (e.g. a reorder). */
export function newLoopSteps(before: RoutingStep[], after: RoutingStep[], checkoutDestinations: Record<string, PostPurchaseDestination | null>): string[] {
  const old = stepsInLoops(before, checkoutDestinations);
  return [...stepsInLoops(after, checkoutDestinations)].filter((id) => !old.has(id));
}
