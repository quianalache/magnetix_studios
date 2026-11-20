import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { CheckoutConfig, Funnel, FunnelStatus, FunnelStep, FunnelStepType, PostPurchaseDestination, StepRouting } from "@/types/checkout";
import { CheckoutError, agencyIdFor, assertId } from "./common";
import { createStepCheckoutConfig, deleteCheckoutConfig, getCheckoutConfigDoc, saveStepCheckoutConfig } from "./config-service";
import { listWorkspacePages } from "./pages";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import { clearPageCheckoutConnections, countPageCheckoutBlocks, createPuckPage, duplicatePuckPage, remapPageCheckoutConfigs } from "@/lib/server/pages-funnels-puck-service";
import { PageTemplateError, createPageFromTemplate } from "@/lib/server/pages-funnels/page-template-service";
import { pageNameProblem } from "@/lib/pages-funnels/page-settings";
import { loadPagesLibrary } from "@/lib/server/pages-funnels/library-service";
import { checkoutContextsForPage } from "@/lib/server/page-checkout-resolver";
import { normalizeStepOffer, sanitizeStepOfferInput, savedOfferAttention } from "@/lib/checkout/funnel-offer";
import { offerFacts, offerPaymentMode, stripeReadiness, validateStepOffer } from "./funnel-offer-service";
import { funnelPostPurchaseChargingEnabled } from "@/lib/checkout/capabilities";
import {
  DEFAULT_ROUTING,
  analyzeFunnel,
  hasRouting,
  newLoopSteps,
  normalizeRoute,
  normalizeRouting,
  reachableSteps,
  routingProblem,
  stepLabel,
  type FunnelIssue,
  unpublishedPagesSummary,
} from "@/lib/checkout/funnel-routing";

/**
 * Funnels. A Funnel is a named, ordered list of steps in one workspace. The
 * order is entirely user-defined. Server-only storage:
 * funnels/{funnelId} + funnels/{funnelId}/steps/{stepId}.
 *
 * Funnel Phase 2 (2026-11): Upsell / Downsell routing (Accept / Decline),
 * step duplication, loop checks on every change that can create one, and
 * validation before publishing. Routing rules: lib/checkout/funnel-routing.ts.
 */

const STEP_TYPES: FunnelStepType[] = ["page", "checkout", "upsell", "downsell", "thank_you"];
const MAX_STEPS = 30;
const funnelsCol = () => getAdminDb().collection("funnels");
const stepsCol = (funnelId: string) => funnelsCol().doc(funnelId).collection("steps");

const cleanName = (v: unknown, fallback: string) => {
  const s = typeof v === "string" ? v.trim().slice(0, 80) : "";
  return s || fallback;
};

export async function getFunnelForWorkspace(subAccountId: string, funnelId: string): Promise<Funnel> {
  assertId(funnelId, "funnel");
  const snap = await funnelsCol().doc(funnelId).get();
  const data = snap.data();
  // A foreign or missing funnel reads as not found — never reveals another workspace.
  if (!snap.exists || data?.subAccountId !== subAccountId) throw new CheckoutError("Funnel not found.", 404);
  return { id: snap.id, ...(data as Omit<Funnel, "id">) };
}

export async function listFunnels(subAccountId: string): Promise<Array<Funnel & { stepCount: number }>> {
  const snap = await funnelsCol().where("subAccountId", "==", subAccountId).get();
  const funnels = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Funnel, "id">) }))
    .filter((f) => f.status !== "archived")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const counts = await Promise.all(funnels.map((f) => stepsCol(f.id).count().get()));
  return funnels.map((f, i) => ({ ...f, stepCount: counts[i].data().count }));
}

export async function listSteps(funnelId: string): Promise<FunnelStep[]> {
  const snap = await stepsCol(funnelId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<FunnelStep, "id">) }))
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/** stepId → the checkout step's post-purchase destination (checkout steps only). */
export async function checkoutDestinations(steps: FunnelStep[]): Promise<Record<string, PostPurchaseDestination | null>> {
  const out: Record<string, PostPurchaseDestination | null> = {};
  await Promise.all(
    steps
      .filter((s) => s.type === "checkout" && s.checkoutConfigId)
      .map(async (s) => {
        out[s.id] = (await getCheckoutConfigDoc(s.checkoutConfigId!).catch(() => null))?.postPurchase ?? null;
      }),
  );
  return out;
}

export interface FunnelHub {
  funnel: Funnel;
  steps: FunnelStep[];
  pages: Array<{ id: string; name: string; status: string; updatedAt?: number | null }>;
  /** pageId → names of the (non-archived) funnels whose steps show it (Add a page → Use existing page). */
  pageFunnels?: Record<string, string[]>;
  /** Checkout steps: post-purchase destination + primary Offer title (read-only here). */
  checkout: Record<string, { postPurchase: PostPurchaseDestination | null; offerTitle: string | null }>;
  /** pageId → number of funnel steps in the workspace using it. */
  pageUses: Record<string, number>;
  /** pageId → how many of those are Upsell / Downsell steps (those pages can't be shared). */
  pageExclusiveUses: Record<string, number>;
  issues: FunnelIssue[];
}

/** Everything the funnel hub shows, in one tenancy-checked read. */
export async function getFunnelHub(subAccountId: string, funnelId: string): Promise<FunnelHub> {
  const funnel = await getFunnelForWorkspace(subAccountId, funnelId);
  const [steps, pages, library] = await Promise.all([listSteps(funnel.id), listWorkspacePages(subAccountId), loadPagesLibrary(subAccountId)]);
  const dest = await checkoutDestinations(steps);
  const checkout: FunnelHub["checkout"] = {};
  /** How each checkout step takes payment (for one-click Offer compatibility). */
  const checkoutPay: Record<string, { free: boolean; mode: "test" | "live" } | null> = {};
  await Promise.all(
    steps
      .filter((s) => s.type === "checkout")
      .map(async (s) => {
        const config = s.checkoutConfigId ? await getCheckoutConfigDoc(s.checkoutConfigId).catch(() => null) : null;
        const offer = config?.primaryOfferId ? await getCourseOffer(subAccountId, config.primaryOfferId).catch(() => null) : null;
        checkout[s.id] = { postPurchase: dest[s.id] ?? null, offerTitle: offer && offer.subAccountId === subAccountId ? offer.title : null };
        checkoutPay[s.id] = offer && offer.subAccountId === subAccountId ? { free: offer.type === "free", mode: offerPaymentMode(offer) } : null;
      }),
  );
  const pageUses = Object.fromEntries(Object.entries(library.usage).map(([id, uses]) => [id, uses.length]));
  const pageExclusiveUses = Object.fromEntries(Object.entries(library.usage).map(([id, uses]) => [id, uses.filter((u) => u.stepType === "upsell" || u.stepType === "downsell").length]));
  const pageMap = Object.fromEntries(pages.map((p) => [p.id, { name: p.name, status: p.status }]));
  const issues = analyzeFunnel({ steps, checkoutDestinations: dest, pages: pageMap, pageUses });
  // Upsell / Downsell steps. On a step a buyer can reach after paying, any
  // reason the one-click offer couldn't run (platform emergency stop, no
  // Offer, an unusable Offer, Stripe not ready for the Offer's payment mode,
  // a different payment mode than the checkout / a free checkout, an
  // unconfirmed subscription disclosure) is an ERROR: the buyer would land on Accept / Decline buttons
  // that can't work. Funnels are never published into that state, and offer
  // pages are never skipped automatically. Unreachable steps: warnings.
  const reach = reachableSteps(steps, dest);
  for (const [i, s] of steps.entries()) {
    if (!hasRouting(s.type)) continue;
    const label = `Step ${i + 1} · ${s.name}`;
    const level = reach.has(s.id) ? "error" : "warning";
    const o = normalizeStepOffer(s.offer);
    const offer = o.offerId ? await getCourseOffer(subAccountId, o.offerId).catch(() => null) : null;
    const ownOffer = offer && offer.subAccountId === subAccountId ? offer : null;
    // Available to every workspace; false only during the platform emergency stop.
    const chargingOn = funnelPostPurchaseChargingEnabled({ subAccountId, paymentMode: ownOffer ? offerPaymentMode(ownOffer) : "test" });
    if (!chargingOn) {
      issues.push({
        level,
        code: "offer_charging_off",
        stepId: s.id,
        message:
          level === "error"
            ? `${label}: one-click payments are temporarily paused across Magnetix, so a buyer sent here after paying couldn't buy this offer. Publish once they're back on, or send buyers somewhere else after checkout.`
            : `${label}: one-click payments are temporarily paused across Magnetix.`,
      });
    }
    if (ownOffer && ownOffer.type !== "free") {
      const mode = offerPaymentMode(ownOffer);
      const modeLabel = mode === "live" ? "Live" : "Test";
      const ready = await stripeReadiness(subAccountId, ownOffer);
      if (ready !== "ready") {
        issues.push({
          level,
          code: "offer_payments_not_ready",
          stepId: s.id,
          message: ready === "charges_disabled"
            ? `${label}: your ${modeLabel} Stripe account can't take payments yet. Finish setup in Stripe, then publish.`
            : `${label}: card payments aren't set up for ${modeLabel} mode yet. Connect Stripe in Settings → Payments, then publish.`,
        });
      }
      // The buyer's saved card belongs to the checkout's Stripe account + mode.
      const pays = Object.values(checkoutPay).filter((c): c is { free: boolean; mode: "test" | "live" } => !!c);
      if (pays.length && pays.every((c) => c.free)) {
        issues.push({ level, code: "offer_mode_mismatch", stepId: s.id, message: `${label}: the checkout before this step is free, so no card is saved for a one-click purchase. Use a paid checkout Offer or remove this step.` });
      } else if (pays.some((c) => !c.free && c.mode !== mode)) {
        const other = pays.find((c) => !c.free && c.mode !== mode)!.mode === "live" ? "Live" : "Test";
        issues.push({ level, code: "offer_mode_mismatch", stepId: s.id, message: `${label}: this Offer takes ${modeLabel} payments but the funnel's checkout takes ${other} payments, so the buyer's saved card can't be used. Choose Offers in the same payment mode.` });
      }
    }
    if (!o.offerId) {
      issues.push({ level, code: "offer_missing", stepId: s.id, message: `${label}: no Offer chosen yet. Choose one in Step settings.` });
    } else {
      const attention = savedOfferAttention(ownOffer ? offerFacts(ownOffer) : null, subAccountId);
      if (attention) issues.push({ level, code: "offer_unavailable", stepId: s.id, message: `${label}: ${attention}` });
      else if (ownOffer?.type === "recurring" && !o.payment.recurringDisclosureAcknowledged) issues.push({ level, code: "offer_unavailable", stepId: s.id, message: `${label}: confirm the subscription disclosure in Step settings.` });
    }
    const invalid = [...(o.onAccept.invalidTags ?? []), ...(o.onDecline.invalidTags ?? [])];
    if (invalid.length) issues.push({ level: "warning", code: "crm_needs_attention", stepId: s.id, message: `${label}: “${invalid[0].tag}” was deleted from your Tags library. Review its CRM actions in Step settings.` });
  }
  const pageFunnels = Object.fromEntries(Object.entries(library.usage).map(([id, uses]) => [id, [...new Set(uses.map((u) => u.funnelName || "Untitled funnel"))]]));
  return { funnel, steps, pages, pageFunnels, checkout, pageUses, pageExclusiveUses, issues };
}

export async function createFunnel(input: { subAccountId: string; uid: string; body: Record<string, unknown> }): Promise<{ funnel: Funnel; steps: FunnelStep[] }> {
  const agencyId = await agencyIdFor(input.subAccountId);
  const now = Date.now();
  const ref = funnelsCol().doc();
  const funnel: Omit<Funnel, "id"> = {
    agencyId,
    subAccountId: input.subAccountId,
    name: cleanName(input.body.name, "Untitled funnel"),
    status: "draft",
    createdByUid: input.uid,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(funnel);
  const steps: FunnelStep[] = [];
  // Optional starter: a single Checkout step, so the common case is one click.
  if (input.body.withCheckoutStep === true) {
    steps.push(await addStep({ subAccountId: input.subAccountId, funnelId: ref.id, uid: input.uid, body: { type: "checkout", name: "Checkout" } }));
  }
  return { funnel: { id: ref.id, ...funnel }, steps };
}

export async function updateFunnel(subAccountId: string, funnelId: string, body: Record<string, unknown>): Promise<Funnel> {
  const funnel = await getFunnelForWorkspace(subAccountId, funnelId);
  const patch: Partial<Funnel> = { updatedAt: Date.now() };
  if (typeof body.name === "string") patch.name = cleanName(body.name, funnel.name);
  if (body.status === "draft" || body.status === "published" || body.status === "archived") patch.status = body.status as FunnelStatus;
  // Never publish a funnel whose routes are broken or loop.
  if (patch.status === "published" && funnel.status !== "published") {
    const hub = await getFunnelHub(subAccountId, funnelId);
    const errors = hub.issues.filter((i) => i.level === "error");
    if (errors.length) {
      const summary = unpublishedPagesSummary(errors);
      throw new CheckoutError(`${summary ? `${summary} ` : ""}Fix this before publishing: ${errors.map((e) => e.message).join(" ")}`, 409, null, "funnel_invalid");
    }
  }
  await funnelsCol().doc(funnelId).update(patch);
  return { ...funnel, ...patch };
}

/** Archive, never hard-delete: orders keep pointing at their funnel. */
export async function archiveFunnel(subAccountId: string, funnelId: string): Promise<void> {
  await getFunnelForWorkspace(subAccountId, funnelId);
  await funnelsCol().doc(funnelId).update({ status: "archived", updatedAt: Date.now() });
}

/**
 * Check a page may be shown by this step. An Upsell / Downsell page belongs
 * to ONE step (its Accept / Decline buttons answer for that step), so it
 * can't be shared in either direction; ordinary pages can be reused freely.
 * A copy is made ONLY when the caller explicitly asks (`copyPage`, the
 * "Duplicate & Use" action) — a restricted page is otherwise refused, never
 * silently copied. Returns the page to assign and the copy's id when one was
 * made (so a later failure can remove it again).
 */
async function resolvePageForStep(input: { subAccountId: string; uid: string; stepId: string | null; type: FunnelStepType; pageId: string; copyPage: boolean }): Promise<{ pageId: string; createdCopyId: string | null }> {
  const pageId = assertId(input.pageId, "page");
  const page = await getAdminDb().doc(`pages/${pageId}`).get();
  if (!page.exists || page.data()?.subAccountId !== input.subAccountId) throw new CheckoutError("That page isn't in this workspace.", 400, { pageId: "Choose a page from this workspace." });
  if (input.copyPage) {
    const dup = await duplicatePuckPage(input.subAccountId, pageId, input.uid);
    if (!dup.ok) throw new CheckoutError(dup.error, dup.status === 404 ? 400 : dup.status);
    return { pageId: dup.pageId, createdCopyId: dup.pageId };
  }
  const { usage } = await loadPagesLibrary(input.subAccountId);
  const others = (usage[pageId] ?? []).filter((u) => u.stepId !== input.stepId);
  const exclusive = hasRouting(input.type) ? others : others.filter((u) => u.stepType === "upsell" || u.stepType === "downsell");
  if (exclusive.length) {
    throw new CheckoutError(
      hasRouting(input.type)
        ? "This page is already used by another funnel step. To keep each offer page independent, use Duplicate & Use to give this step its own copy."
        : "This page is already being used by an upsell or downsell step. To keep each offer page independent, use Duplicate & Use to give this step its own copy.",
      409,
      { pageId: "This page needs to be copied before it can be used here." },
      "page_in_use",
    );
  }
  return { pageId, createdCopyId: null };
}

/** Remove a page copy this request made, when the step write that needed it failed. */
async function discardCopy(pageId: string | null): Promise<void> {
  if (pageId) await getAdminDb().doc(`pages/${pageId}`).delete().catch(() => undefined);
}

export async function addStep(input: { subAccountId: string; funnelId: string; uid?: string; body: Record<string, unknown> }): Promise<FunnelStep> {
  const funnel = await getFunnelForWorkspace(input.subAccountId, input.funnelId);
  const type = STEP_TYPES.includes(input.body.type as FunnelStepType) ? (input.body.type as FunnelStepType) : null;
  if (!type) throw new CheckoutError("Choose a step type.", 400, { type: "Choose a step type." });
  const existing = await listSteps(funnel.id);
  if (existing.length >= MAX_STEPS) throw new CheckoutError(`A funnel can have up to ${MAX_STEPS} steps.`);
  const now = Date.now();
  const ref = stepsCol(funnel.id).doc();
  const step: Omit<FunnelStep, "id"> = {
    funnelId: funnel.id,
    subAccountId: input.subAccountId,
    name: cleanName(input.body.name, defaultStepName(type)),
    type,
    order: existing.length,
    pageId: null,
    checkoutConfigId: null,
    ...(hasRouting(type) ? { routing: DEFAULT_ROUTING } : {}),
    createdAt: now,
    updatedAt: now,
  };
  let createdCopyId: string | null = null;
  if (typeof input.body.pageId === "string" && input.body.pageId) {
    const resolved = await resolvePageForStep({ subAccountId: input.subAccountId, uid: input.uid ?? "", stepId: null, type, pageId: input.body.pageId, copyPage: input.body.copyPage === true });
    step.pageId = resolved.pageId;
    createdCopyId = resolved.createdCopyId;
  }
  try {
    if (type === "checkout") {
      const config = await createStepCheckoutConfig({ subAccountId: input.subAccountId, agencyId: funnel.agencyId, funnelId: funnel.id, stepId: ref.id });
      step.checkoutConfigId = config.id;
    }
    await ref.set(step);
  } catch (err) {
    await discardCopy(createdCopyId);
    throw err;
  }
  await funnelsCol().doc(funnel.id).update({ updatedAt: now });
  return { id: ref.id, ...step };
}

function defaultStepName(type: FunnelStepType): string {
  return { page: "Page", checkout: "Checkout", upsell: "Upsell", downsell: "Downsell", thank_you: "Thank you" }[type];
}

export async function getStep(subAccountId: string, funnelId: string, stepId: string): Promise<{ funnel: Funnel; step: FunnelStep }> {
  const funnel = await getFunnelForWorkspace(subAccountId, funnelId);
  assertId(stepId, "step");
  const snap = await stepsCol(funnelId).doc(stepId).get();
  if (!snap.exists) throw new CheckoutError("Step not found.", 404);
  return { funnel, step: { id: snap.id, ...(snap.data() as Omit<FunnelStep, "id">) } };
}

/** Rename, set / change / clear the page, or set Accept / Decline routing. */
export async function updateStep(subAccountId: string, funnelId: string, stepId: string, body: Record<string, unknown>, uid = ""): Promise<FunnelStep> {
  const { step } = await getStep(subAccountId, funnelId, stepId);
  const patch: Partial<FunnelStep> = { updatedAt: Date.now() };
  if (typeof body.name === "string") patch.name = cleanName(body.name, step.name);
  if (body.pageId === null) patch.pageId = null;
  let createdCopyId: string | null = null;
  if (typeof body.pageId === "string") {
    const resolved = await resolvePageForStep({ subAccountId, uid, stepId, type: step.type, pageId: body.pageId, copyPage: body.copyPage === true });
    patch.pageId = resolved.pageId;
    createdCopyId = resolved.createdCopyId;
  }
  if (body.routing !== undefined) {
    if (!hasRouting(step.type)) throw new CheckoutError("Only Upsell and Downsell steps have Accept / Decline routes.", 400);
    const raw = (body.routing ?? {}) as Record<string, unknown>;
    const accept = normalizeRoute(raw.accept);
    const decline = normalizeRoute(raw.decline);
    if (!accept || !decline) throw new CheckoutError("Choose where buyers go after accepting and after declining.", 400, { routing: "Choose both routes." });
    const routing: StepRouting = { accept, decline };
    const steps = await listSteps(funnelId);
    const problem = routingProblem(steps, stepId, routing, await checkoutDestinations(steps));
    if (problem) {
      await discardCopy(createdCopyId);
      throw new CheckoutError(problem, 400, { routing: problem }, "routing_invalid");
    }
    patch.routing = routing;
  }
  // Upsell / Downsell Offer, payment and CRM settings. Saving only stores
  // them: nothing is charged, granted, tagged or started.
  if (body.offer !== undefined) {
    if (!hasRouting(step.type)) {
      await discardCopy(createdCopyId);
      throw new CheckoutError("Only Upsell and Downsell steps sell an Offer here.", 400);
    }
    const previous = normalizeStepOffer(step.offer);
    const shaped = sanitizeStepOfferInput(body.offer, previous);
    const checked = await validateStepOffer({ subAccountId, value: shaped.value, previous });
    const errors = { ...shaped.errors, ...checked.errors };
    if (Object.keys(errors).length) {
      await discardCopy(createdCopyId);
      throw new CheckoutError("Fix the highlighted settings.", 400, errors, "offer_settings_invalid");
    }
    patch.offer = checked.value;
  }
  try {
    if (createdCopyId) {
      // A copy was just made for this step: assign it only if nobody changed the
      // step's page meanwhile (e.g. a second "Duplicate & Use" click), otherwise
      // keep what's there and remove this request's copy.
      const ref = stepsCol(funnelId).doc(stepId);
      await getAdminDb().runTransaction(async (tx) => {
        const fresh = (await tx.get(ref)).data() as Omit<FunnelStep, "id"> | undefined;
        if (!fresh) throw new CheckoutError("Step not found.", 404);
        if ((fresh.pageId ?? null) !== (step.pageId ?? null)) throw new CheckoutError("This step's page was just changed. Reload to see the latest version.", 409, null, "step_changed");
        tx.update(ref, patch);
      });
    } else {
      await stepsCol(funnelId).doc(stepId).update(patch);
    }
  } catch (err) {
    await discardCopy(createdCopyId);
    throw err;
  }
  await funnelsCol().doc(funnelId).update({ updatedAt: Date.now() });
  return { ...step, ...patch };
}

/**
 * Remove a step. The page itself is never deleted. Accept / Decline routes in
 * this funnel that pointed at the removed step go back to "next step" (the
 * hub's confirmation lists them first), so nothing is left pointing nowhere.
 */
export async function deleteStep(subAccountId: string, funnelId: string, stepId: string): Promise<{ reroutedStepIds: string[] }> {
  const { step } = await getStep(subAccountId, funnelId, stepId);
  await stepsCol(funnelId).doc(stepId).delete();
  if (step.checkoutConfigId) await deleteCheckoutConfig(step.checkoutConfigId);
  // Re-number the remaining steps so order stays dense.
  const rest = await listSteps(funnelId);
  const batch = getAdminDb().batch();
  const rerouted: string[] = [];
  rest.forEach((s, i) => {
    const patch: Record<string, unknown> = {};
    if (s.order !== i) patch.order = i;
    if (hasRouting(s.type)) {
      const r = normalizeRouting(s.routing);
      const fix = (route: StepRouting["accept"]) => (route.type === "funnel_step" && route.stepId === stepId ? DEFAULT_ROUTING.accept : route);
      const next = { accept: fix(r.accept), decline: fix(r.decline) };
      if (JSON.stringify(next) !== JSON.stringify(r)) {
        patch.routing = next;
        rerouted.push(s.id);
      }
    }
    if (Object.keys(patch).length) batch.update(stepsCol(funnelId).doc(s.id), patch);
  });
  batch.update(funnelsCol().doc(funnelId), { updatedAt: Date.now() });
  await batch.commit();
  return { reroutedStepIds: rerouted };
}

/** Persist a new step order. `stepIds` must be exactly the funnel's steps. */
export async function reorderSteps(subAccountId: string, funnelId: string, stepIds: unknown): Promise<FunnelStep[]> {
  await getFunnelForWorkspace(subAccountId, funnelId);
  const steps = await listSteps(funnelId);
  const ids = Array.isArray(stepIds) ? stepIds.filter((x): x is string => typeof x === "string") : [];
  const current = new Set(steps.map((s) => s.id));
  if (ids.length !== steps.length || new Set(ids).size !== ids.length || ids.some((id) => !current.has(id))) {
    throw new CheckoutError("The step list changed. Reload and try again.", 409);
  }
  // "Next step" routes follow the order, so a new order can create a loop.
  const after = ids.map((id) => steps.find((s) => s.id === id)!);
  const looping = newLoopSteps(steps, after, await checkoutDestinations(steps));
  if (looping.length) {
    throw new CheckoutError(`That order would send buyers in a loop (${looping.map((id) => stepLabel(after, id)).join(", ")}). Change a route first.`, 409, null, "routing_loop");
  }
  const batch = getAdminDb().batch();
  ids.forEach((id, i) => batch.update(stepsCol(funnelId).doc(id), { order: i, updatedAt: Date.now() }));
  batch.update(funnelsCol().doc(funnelId), { updatedAt: Date.now() });
  await batch.commit();
  return listSteps(funnelId);
}

export type DuplicatePageMode = "copy" | "same" | "none";

/** A checkout configuration's creator settings (no identity, context or version), for copying into another step's checkout. */
function copyableCheckoutFields(source: CheckoutConfig): Record<string, unknown> {
  const fields: Partial<CheckoutConfig> = {
    primaryOfferId: source.primaryOfferId,
    enabled: source.enabled,
    format: source.format,
    nameFormat: source.nameFormat,
    phone: source.phone,
    billingAddress: source.billingAddress,
    agreement: source.agreement,
    couponsEnabled: source.couponsEnabled,
    bumps: source.bumps,
    display: source.display,
    postPurchase: source.postPurchase,
    internalNotes: source.internalNotes,
    crm: source.crm,
  };
  return fields as Record<string, unknown>;
}

/**
 * Duplicate a step, placed right after the original. The page is either an
 * independent copy (the existing page duplicate: new draft, no shared
 * content), the same page (ordinary pages only, never an Upsell /
 * Downsell page), or none. A Checkout step gets its own new checkout with
 * the same settings, saved through the normal validated save. Routing is
 * copied when it stays valid, otherwise reset to "next step" (reported).
 * Nothing customer-specific is copied: orders, sessions and purchases stay
 * with the original.
 */
export async function duplicateStep(input: { subAccountId: string; funnelId: string; stepId: string; uid: string; pageMode: unknown }): Promise<{ step: FunnelStep; notes: string[] }> {
  const { funnel, step } = await getStep(input.subAccountId, input.funnelId, input.stepId);
  const mode: DuplicatePageMode | null = input.pageMode === "copy" || input.pageMode === "same" || input.pageMode === "none" ? input.pageMode : null;
  // A page is never copied (or shared) unless the creator chose to.
  if (step.pageId && !mode) throw new CheckoutError("Choose what to do with this step's page.", 400, { pageMode: "Choose an option." });
  if (mode === "same" && hasRouting(step.type)) throw new CheckoutError(`An ${step.type} needs its own page. Choose “Make a copy of the page”.`, 400, null, "page_in_use");
  const steps = await listSteps(funnel.id);
  if (steps.length >= MAX_STEPS) throw new CheckoutError(`A funnel can have up to ${MAX_STEPS} steps.`);
  const notes: string[] = [];

  const copyPage = !!step.pageId && mode === "copy";
  const created = await addStep({
    subAccountId: input.subAccountId,
    funnelId: funnel.id,
    uid: input.uid,
    body: {
      type: step.type,
      name: `${step.name} (copy)`.slice(0, 80),
      ...(step.pageId && mode && mode !== "none" ? { pageId: step.pageId, copyPage } : {}),
    },
  });

  try {
    if (step.type === "checkout" && step.checkoutConfigId && created.checkoutConfigId) {
      const source = await getCheckoutConfigDoc(step.checkoutConfigId);
      if (source) {
        try {
          await saveStepCheckoutConfig({ subAccountId: input.subAccountId, funnelId: funnel.id, stepId: created.id, uid: input.uid, body: copyableCheckoutFields(source) });
        } catch {
          // e.g. the Offer was archived since: keep a blank checkout rather than an invalid copy.
          notes.push("The checkout settings couldn't be copied as they are (an Offer or Workflow may no longer be available), so the copy starts with blank checkout settings.");
        }
      }
    }
    // The copied page belongs to the copy: its explicit Checkout blocks that
    // pointed at the ORIGINAL step's checkout now point at the copy's own
    // (2026-11-16 fix — previously the copy kept selling through the original).
    if (copyPage && created.pageId && step.type === "checkout" && step.checkoutConfigId && created.checkoutConfigId) {
      await remapPageCheckoutConfigs(input.subAccountId, created.pageId, { [step.checkoutConfigId]: created.checkoutConfigId });
    }
    // Place the copy right after the original.
    const ids = (await listSteps(funnel.id)).map((s) => s.id).filter((id) => id !== created.id);
    ids.splice(ids.indexOf(step.id) + 1, 0, created.id);
    const batch = getAdminDb().batch();
    ids.forEach((id, i) => batch.update(stepsCol(funnel.id).doc(id), { order: i }));
    await batch.commit();

    // Copy routing only if it stays valid in the new position.
    if (hasRouting(step.type)) {
      const routing = normalizeRouting(step.routing);
      const now = await listSteps(funnel.id);
      if (routingProblem(now, created.id, routing, await checkoutDestinations(now))) notes.push("Its routes would have looped, so the copy uses “next step” for Accept and Decline.");
      else await stepsCol(funnel.id).doc(created.id).update({ routing });
      // Offer, payment and CRM settings: an independent copy (no shared objects).
      if (step.offer) await stepsCol(funnel.id).doc(created.id).update({ offer: JSON.parse(JSON.stringify(normalizeStepOffer(step.offer))) });
    }
  } catch (err) {
    await deleteStep(input.subAccountId, funnel.id, created.id).catch(() => undefined);
    if (copyPage) await discardCopy(created.pageId);
    throw err;
  }
  if (copyPage) notes.push("The page was copied as a new draft. Publish it when it's ready.");
  return { step: (await getStep(input.subAccountId, funnel.id, created.id)).step, notes };
}

/* ------------------------- Page-first funnels (2026-11-17) ------------------------- */

/**
 * Page-first funnels (owner-approved mockups, 2026-11-17). Creators add PAGES
 * to a funnel; the step's internal role (page / checkout / one-click offer)
 * comes from what the page holds and from explicit, server-checked choices —
 * never from a type picked before the page exists. The stored step types,
 * checkout configurations, Offer settings, routing and the payment engine are
 * unchanged: a "checkout" step whose page holds the Checkout block IS the
 * sales page with embedded checkout (no separate, hidden Checkout step), so
 * the order, routing and analytics all belong to the page the buyer saw.
 */

export type AddPageSource = "blank" | "template" | "existing";

async function pageInWorkspace(subAccountId: string, pageId: string): Promise<{ name: string; status: string } | null> {
  const snap = await getAdminDb().doc(`pages/${pageId}`).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) return null;
  return { name: (snap.data()?.name as string) || "Untitled page", status: (snap.data()?.status as string) ?? "draft" };
}

const CHECKOUT_PAGE_NOTE = "This page has a Checkout block, so buyers pay on it. Choose the Offer in Checkout settings.";
const extraCheckoutsNote = (n: number) => `This page has ${n} Checkout blocks. A page can publish with one — remove the extras in the Page Builder.`;

/**
 * Add a page to the end of a funnel — "Add a page" (mockups 1–3):
 *  - `blank`: a new Draft page (the existing Create Page writer);
 *  - `template`: a new independent Draft page from a saved template (the
 *    existing Saved Page Templates writer — Checkout blocks made automatic);
 *  - `existing`: an explicit DRAFT COPY of a workspace page (the existing
 *    duplicate writer). The original is never changed or shared.
 * A page holding a Checkout block becomes this funnel's checkout page (its own
 * new, blank checkout settings — another funnel's payment setup is never
 * inherited); every other page is an ordinary page step. If anything fails
 * after the page was made, the new page is removed again.
 */
export async function addPageStep(input: { subAccountId: string; funnelId: string; uid: string; body: Record<string, unknown> }): Promise<{ step: FunnelStep; notes: string[] }> {
  const funnel = await getFunnelForWorkspace(input.subAccountId, input.funnelId);
  if (funnel.status === "archived") throw new CheckoutError("This funnel is archived.", 409);
  if ((await listSteps(funnel.id)).length >= MAX_STEPS) throw new CheckoutError(`A funnel can have up to ${MAX_STEPS} steps.`);
  const source = input.body.source;
  let pageId: string;
  if (source === "blank" || source === "template") {
    const problem = pageNameProblem(input.body.name);
    if (problem) throw new CheckoutError(problem, 400, { name: problem });
  }
  if (source === "blank") {
    const created = await createPuckPage({ subAccountId: input.subAccountId, uid: input.uid, name: input.body.name, pageType: "generic", goal: "other" });
    if (!created.ok) throw new CheckoutError(created.error, created.status);
    pageId = created.pageId;
  } else if (source === "template") {
    const templateId = typeof input.body.templateId === "string" ? input.body.templateId : "";
    if (!templateId) throw new CheckoutError("Choose a template.", 400, { templateId: "Choose a template." });
    try {
      pageId = (await createPageFromTemplate({ subAccountId: input.subAccountId, uid: input.uid, templateId, name: input.body.name, goal: undefined })).pageId;
    } catch (err) {
      if (err instanceof PageTemplateError) throw new CheckoutError(err.message, err.status === 500 ? 502 : err.status);
      throw err;
    }
  } else if (source === "existing") {
    const sourcePageId = assertId(typeof input.body.pageId === "string" ? input.body.pageId : "", "page");
    if (!(await pageInWorkspace(input.subAccountId, sourcePageId))) throw new CheckoutError("That page isn't in this workspace.", 400, { pageId: "Choose a page from this workspace." });
    const dup = await duplicatePuckPage(input.subAccountId, sourcePageId, input.uid);
    if (!dup.ok) throw new CheckoutError(dup.error, dup.status === 404 ? 400 : dup.status);
    pageId = dup.pageId;
  } else {
    throw new CheckoutError("Choose how to add the page.", 400, { source: "Choose an option." });
  }

  try {
    const page = await pageInWorkspace(input.subAccountId, pageId);
    if (!page) throw new CheckoutError("The new page couldn't be read. Try again.", 500);
    const checkoutBlocks = await countPageCheckoutBlocks(input.subAccountId, pageId);
    const role: FunnelStepType = checkoutBlocks > 0 ? "checkout" : "page";
    // The page sells through ITS OWN step's checkout, never a connection copied from elsewhere.
    if (role === "checkout") await clearPageCheckoutConnections(input.subAccountId, pageId);
    const step = await addStep({ subAccountId: input.subAccountId, funnelId: funnel.id, uid: input.uid, body: { type: role, name: page.name, pageId } });
    const notes: string[] = [];
    if (role === "checkout") notes.push(CHECKOUT_PAGE_NOTE);
    if (checkoutBlocks > 1) notes.push(extraCheckoutsNote(checkoutBlocks));
    return { step, notes };
  } catch (err) {
    await discardCopy(pageId);
    throw err;
  }
}

/** Steps whose role can still be chosen: ordinary pages (incl. legacy Thank You steps). */
const isPlainPageStep = (type: FunnelStepType) => type === "page" || type === "thank_you";

/**
 * Give an ordinary page step its role, explicitly, from the page's own
 * Checkout block or Accept / Decline buttons (Page Builder) or the hub:
 *  - `checkout`: the step gets its own checkout settings, so buyers pay on
 *    this page and "after purchase" continues from THIS page's position. When
 *    the page's Checkout block was showing another Checkout step of this
 *    funnel, those settings (Offer, Order Bumps, coupons, fields, CRM) are
 *    copied so nothing has to be set up again; the other step is left alone
 *    for the creator to remove.
 *  - `offer`: a one-click offer page (stored as an Upsell step, owner decision
 *    D2): its Offer, payment, CRM and Accept / Decline routes are chosen in
 *    Step settings, exactly as before. Nothing is charged by this change, and
 *    post-purchase charging stays switched off by the server's own checks.
 * Refused while the funnel is published (it would change a live buyer path).
 */
export async function setStepRole(subAccountId: string, funnelId: string, stepId: string, rawRole: unknown, uid: string): Promise<{ step: FunnelStep; notes: string[] }> {
  const { funnel, step } = await getStep(subAccountId, funnelId, stepId);
  const role = rawRole === "checkout" || rawRole === "offer" ? rawRole : null;
  if (!role) throw new CheckoutError("Choose what this page does.", 400);
  if ((role === "checkout" && step.type === "checkout") || (role === "offer" && hasRouting(step.type))) return { step, notes: [] };
  if (!isPlainPageStep(step.type)) throw new CheckoutError("This page already has a different role in this funnel.", 409, null, "role_set");
  if (!step.pageId || !(await pageInWorkspace(subAccountId, step.pageId))) throw new CheckoutError("Choose this step's page first.", 400);
  if (funnel.status === "published") {
    throw new CheckoutError("This funnel is live. Unpublish it before changing what this page does, so buyers who are part-way through aren't affected.", 409, null, "funnel_published");
  }
  if (funnel.status === "archived") throw new CheckoutError("This funnel is archived.", 409);
  const notes: string[] = [];

  if (role === "offer") {
    // An offer page belongs to ONE step (its Accept / Decline buttons answer for that step).
    await resolvePageForStep({ subAccountId, uid, stepId, type: "upsell", pageId: step.pageId, copyPage: false });
    const steps = (await listSteps(funnelId)).map((s) => (s.id === stepId ? { ...s, type: "upsell" as FunnelStepType, routing: DEFAULT_ROUTING } : s));
    const problem = routingProblem(steps, stepId, DEFAULT_ROUTING, await checkoutDestinations(steps));
    if (problem) throw new CheckoutError(problem, 400, null, "routing_invalid");
    const patch: Partial<FunnelStep> = { type: "upsell", routing: DEFAULT_ROUTING, updatedAt: Date.now() };
    await stepsCol(funnelId).doc(stepId).update(patch);
    await funnelsCol().doc(funnelId).update({ updatedAt: Date.now() });
    notes.push("Choose the Offer, payment and where buyers go after Accept or Decline in Step settings. Use the page's Accept offer and Decline offer buttons.");
    return { step: { ...step, ...patch }, notes };
  }

  // role === "checkout": which of this funnel's checkouts does the page's block show today?
  const { autoConfigId } = await checkoutContextsForPage(subAccountId, step.pageId);
  const previous = autoConfigId ? await getCheckoutConfigDoc(autoConfigId).catch(() => null) : null;
  const carry = previous && previous.subAccountId === subAccountId && previous.context.type === "funnel_step" && previous.context.funnelId === funnelId ? previous : null;
  const ref = stepsCol(funnelId).doc(stepId);
  const config = await createStepCheckoutConfig({ subAccountId, agencyId: funnel.agencyId, funnelId, stepId });
  try {
    await getAdminDb().runTransaction(async (tx) => {
      const fresh = (await tx.get(ref)).data() as Omit<FunnelStep, "id"> | undefined;
      if (!fresh || !isPlainPageStep(fresh.type) || fresh.pageId !== step.pageId) throw new CheckoutError("This step just changed. Reload to see the latest version.", 409, null, "step_changed");
      tx.update(ref, { type: "checkout", checkoutConfigId: config.id, updatedAt: Date.now() });
    });
  } catch (err) {
    await deleteCheckoutConfig(config.id).catch(() => undefined);
    throw err;
  }
  await clearPageCheckoutConnections(subAccountId, step.pageId);
  if (carry) {
    const fields = copyableCheckoutFields(carry);
    // "After purchase → this very page" would loop: fall back to the next step.
    const pp = carry.postPurchase;
    if (pp.type === "funnel_step" && pp.stepId === stepId) fields.postPurchase = { type: "funnel_next_step" };
    try {
      await saveStepCheckoutConfig({ subAccountId, funnelId, stepId, uid, body: fields });
      const from = (await listSteps(funnelId)).find((s) => s.checkoutConfigId === carry.id);
      notes.push(`Checkout settings were copied from “${from?.name ?? "the other Checkout step"}”. Buyers now pay on this page, so you can remove that step if nothing else uses it.`);
    } catch {
      notes.push("Choose the Offer in Checkout settings (the earlier checkout settings couldn't be copied as they are).");
    }
  } else {
    notes.push(CHECKOUT_PAGE_NOTE);
  }
  await funnelsCol().doc(funnelId).update({ updatedAt: Date.now() });
  return { step: (await getStep(subAccountId, funnelId, stepId)).step, notes };
}

export interface MoveStepPreview {
  sourceFunnelName: string;
  targetFunnelName: string;
  pageName: string;
  /** Reasons the move can't happen (nothing is changed). */
  blockers: string[];
  /** Consequences the creator must confirm. */
  warnings: string[];
}

/**
 * Move a page to another funnel (the page keeps its identity; it is never
 * copied). The source funnel's step is removed (Accept / Decline routes that
 * pointed at it go to the next step, as with Remove step) and the page is
 * added as the destination funnel's last step. Without `confirm: true` this
 * only PREVIEWS: it reports what would change and writes nothing. Pages that
 * take payment or present a one-click offer can't be moved — their checkout,
 * Offer and routing belong to this funnel — so the creator duplicates instead.
 */
export async function moveStepToFunnel(input: { subAccountId: string; funnelId: string; stepId: string; uid: string; body: Record<string, unknown> }): Promise<{ preview: MoveStepPreview } | { moved: true; step: FunnelStep; targetFunnelId: string; reroutedStepIds: string[] }> {
  const { funnel, step } = await getStep(input.subAccountId, input.funnelId, input.stepId);
  const targetId = typeof input.body.targetFunnelId === "string" ? input.body.targetFunnelId : "";
  const target = await getFunnelForWorkspace(input.subAccountId, targetId);
  const page = step.pageId ? await pageInWorkspace(input.subAccountId, step.pageId) : null;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (target.id === funnel.id) blockers.push("This page is already in this funnel.");
  if (target.status === "archived") blockers.push(`“${target.name}” is archived.`);
  if (funnel.status === "archived") blockers.push("This funnel is archived.");
  if (step.type === "checkout") blockers.push("Buyers pay on this page in this funnel, and its checkout settings belong to this funnel. Duplicate it into the other funnel instead, or remove this step first.");
  else if (hasRouting(step.type)) blockers.push("This is a one-click offer page. Its Offer and Accept / Decline routes belong to this funnel. Duplicate it into the other funnel instead.");
  if (!page) blockers.push("This step has no page to move.");
  const targetSteps = target.id === funnel.id ? [] : await listSteps(target.id);
  if (page && targetSteps.some((s) => s.pageId === step.pageId)) blockers.push(`“${target.name}” already uses this page.`);
  if (targetSteps.length >= MAX_STEPS) blockers.push(`“${target.name}” already has ${MAX_STEPS} steps.`);

  if (!blockers.length && page) {
    const steps = await listSteps(funnel.id);
    const pointing = steps.filter((s) => hasRouting(s.type) && s.id !== step.id && Object.values(normalizeRouting(s.routing)).some((r) => r.type === "funnel_step" && r.stepId === step.id));
    if (funnel.status === "published") warnings.push(`“${funnel.name}” is live. Buyers will no longer see this page in it.`);
    if (pointing.length) warnings.push(`${pointing.map((s) => stepLabel(steps, s.id)).join(", ")} ${pointing.length === 1 ? "sends" : "send"} buyers to this page. Those routes will go to the next step instead.`);
    const checkoutRoutes = Object.entries(await checkoutDestinations(steps)).filter(([, d]) => d?.type === "funnel_step" && d.stepId === step.id);
    if (checkoutRoutes.length) warnings.push(`${checkoutRoutes.map(([id]) => stepLabel(steps, id)).join(", ")} ${checkoutRoutes.length === 1 ? "sends" : "send"} buyers here after purchase. Change that in Checkout settings after the move.`);
    if ((await countPageCheckoutBlocks(input.subAccountId, step.pageId!)) > 0) warnings.push(`This page has a Checkout block. In “${target.name}” it uses that funnel's checkout, or shows nothing until that funnel has one.`);
    if (target.status === "published") warnings.push(`“${target.name}” is live. The page is added as its last step.`);
  }
  const preview: MoveStepPreview = { sourceFunnelName: funnel.name, targetFunnelName: target.name, pageName: page?.name ?? step.name, blockers, warnings };
  if (input.body.confirm !== true) return { preview };
  if (blockers.length) throw new CheckoutError(blockers[0], 409, null, "move_blocked");

  // Destination first, then remove the source step; undo the destination if that fails.
  const created = await addStep({ subAccountId: input.subAccountId, funnelId: target.id, uid: input.uid, body: { type: step.type, name: step.name, pageId: step.pageId } });
  try {
    const { reroutedStepIds } = await deleteStep(input.subAccountId, funnel.id, step.id);
    // A route set to "after purchase → this step" can't follow the page to another funnel.
    // The checkout writer saves the WHOLE settings record, so send every current setting with only the destination changed.
    for (const s of await listSteps(funnel.id)) {
      if (s.type !== "checkout" || !s.checkoutConfigId) continue;
      const config = await getCheckoutConfigDoc(s.checkoutConfigId).catch(() => null);
      if (!config || config.postPurchase.type !== "funnel_step" || config.postPurchase.stepId !== step.id) continue;
      await saveStepCheckoutConfig({ subAccountId: input.subAccountId, funnelId: funnel.id, stepId: s.id, uid: input.uid, body: { ...copyableCheckoutFields(config), postPurchase: { type: "funnel_next_step" } } }).catch((err) =>
        console.error(`[funnels] move: couldn't reset after-purchase route funnel=${funnel.id} step=${s.id}`, err),
      );
    }
    return { moved: true, step: created, targetFunnelId: target.id, reroutedStepIds };
  } catch (err) {
    await deleteStep(input.subAccountId, target.id, created.id).catch(() => undefined);
    throw err;
  }
}
