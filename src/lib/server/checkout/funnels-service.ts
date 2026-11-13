import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { CheckoutConfig, Funnel, FunnelStatus, FunnelStep, FunnelStepType, PostPurchaseDestination, StepRouting } from "@/types/checkout";
import { CheckoutError, agencyIdFor, assertId } from "./common";
import { createStepCheckoutConfig, deleteCheckoutConfig, getCheckoutConfigDoc, saveStepCheckoutConfig } from "./config-service";
import { listWorkspacePages } from "./pages";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import { duplicatePuckPage } from "@/lib/server/pages-funnels-puck-service";
import { loadPagesLibrary } from "@/lib/server/pages-funnels/library-service";
import { normalizeStepOffer, sanitizeStepOfferInput, savedOfferAttention } from "@/lib/checkout/funnel-offer";
import { offerFacts, validateStepOffer } from "./funnel-offer-service";
import { COMMERCE_CAPABILITIES } from "@/lib/checkout/capabilities";
import {
  DEFAULT_ROUTING,
  analyzeFunnel,
  hasRouting,
  newLoopSteps,
  normalizeRoute,
  normalizeRouting,
  routingProblem,
  stepLabel,
  type FunnelIssue,
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
  pages: Array<{ id: string; name: string; status: string }>;
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
  await Promise.all(
    steps
      .filter((s) => s.type === "checkout")
      .map(async (s) => {
        const config = s.checkoutConfigId ? await getCheckoutConfigDoc(s.checkoutConfigId).catch(() => null) : null;
        const offer = config?.primaryOfferId ? await getCourseOffer(subAccountId, config.primaryOfferId).catch(() => null) : null;
        checkout[s.id] = { postPurchase: dest[s.id] ?? null, offerTitle: offer && offer.subAccountId === subAccountId ? offer.title : null };
      }),
  );
  const pageUses = Object.fromEntries(Object.entries(library.usage).map(([id, uses]) => [id, uses.length]));
  const pageExclusiveUses = Object.fromEntries(Object.entries(library.usage).map(([id, uses]) => [id, uses.filter((u) => u.stepType === "upsell" || u.stepType === "downsell").length]));
  const pageMap = Object.fromEntries(pages.map((p) => [p.id, { name: p.name, status: p.status }]));
  const issues = analyzeFunnel({ steps, checkoutDestinations: dest, pages: pageMap, pageUses });
  // Upsell / Downsell Offer settings. While post-purchase charging is off
  // they're warnings; once it's on, a step that can't sell blocks publishing
  // (the runtime refuses such a step anyway).
  const offerLevel = COMMERCE_CAPABILITIES.funnelPostPurchaseCharging ? "error" : "warning";
  for (const [i, s] of steps.entries()) {
    if (!hasRouting(s.type)) continue;
    const label = `Step ${i + 1} · ${s.name}`;
    const o = normalizeStepOffer(s.offer);
    if (!o.offerId) {
      issues.push({ level: offerLevel, code: "offer_missing", stepId: s.id, message: `${label}: no Offer chosen yet. Choose one in Step settings.` });
    } else {
      const offer = await getCourseOffer(subAccountId, o.offerId).catch(() => null);
      const attention = savedOfferAttention(offer && offer.subAccountId === subAccountId ? offerFacts(offer) : null, subAccountId);
      if (attention) issues.push({ level: offerLevel, code: "offer_unavailable", stepId: s.id, message: `${label}: ${attention}` });
      else if (offer?.type === "recurring" && !o.payment.recurringDisclosureAcknowledged) issues.push({ level: offerLevel, code: "offer_unavailable", stepId: s.id, message: `${label}: confirm the subscription disclosure in Step settings.` });
    }
    const invalid = [...(o.onAccept.invalidTags ?? []), ...(o.onDecline.invalidTags ?? [])];
    if (invalid.length) issues.push({ level: "warning", code: "crm_needs_attention", stepId: s.id, message: `${label}: “${invalid[0].tag}” was deleted from your Tags library. Review its CRM actions in Step settings.` });
  }
  return { funnel, steps, pages, checkout, pageUses, pageExclusiveUses, issues };
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
    if (errors.length) throw new CheckoutError(`Fix this before publishing: ${errors.map((e) => e.message).join(" ")}`, 409, null, "funnel_invalid");
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
        try {
          await saveStepCheckoutConfig({ subAccountId: input.subAccountId, funnelId: funnel.id, stepId: created.id, uid: input.uid, body: fields as Record<string, unknown> });
        } catch {
          // e.g. the Offer was archived since: keep a blank checkout rather than an invalid copy.
          notes.push("The checkout settings couldn't be copied as they are (an Offer or Workflow may no longer be available), so the copy starts with blank checkout settings.");
        }
      }
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
