import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { Funnel, FunnelStatus, FunnelStep, FunnelStepType } from "@/types/checkout";
import { CheckoutError, agencyIdFor, assertId } from "./common";
import { createStepCheckoutConfig, deleteCheckoutConfig } from "./config-service";

/**
 * Funnels — Phase 1 minimum. A Funnel is a named, ordered list of steps in
 * one workspace. The order is entirely user-defined. Server-only storage:
 * funnels/{funnelId} + funnels/{funnelId}/steps/{stepId}.
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
    steps.push(await addStep({ subAccountId: input.subAccountId, funnelId: ref.id, body: { type: "checkout", name: "Checkout" } }));
  }
  return { funnel: { id: ref.id, ...funnel }, steps };
}

export async function updateFunnel(subAccountId: string, funnelId: string, body: Record<string, unknown>): Promise<Funnel> {
  const funnel = await getFunnelForWorkspace(subAccountId, funnelId);
  const patch: Partial<Funnel> = { updatedAt: Date.now() };
  if (typeof body.name === "string") patch.name = cleanName(body.name, funnel.name);
  if (body.status === "draft" || body.status === "published" || body.status === "archived") patch.status = body.status as FunnelStatus;
  await funnelsCol().doc(funnelId).update(patch);
  return { ...funnel, ...patch };
}

/** Archive, never hard-delete: orders keep pointing at their funnel. */
export async function archiveFunnel(subAccountId: string, funnelId: string): Promise<void> {
  await getFunnelForWorkspace(subAccountId, funnelId);
  await funnelsCol().doc(funnelId).update({ status: "archived", updatedAt: Date.now() });
}

export async function addStep(input: { subAccountId: string; funnelId: string; body: Record<string, unknown> }): Promise<FunnelStep> {
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
    createdAt: now,
    updatedAt: now,
  };
  if (type === "checkout") {
    const config = await createStepCheckoutConfig({ subAccountId: input.subAccountId, agencyId: funnel.agencyId, funnelId: funnel.id, stepId: ref.id });
    step.checkoutConfigId = config.id;
  }
  await ref.set(step);
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

export async function updateStep(subAccountId: string, funnelId: string, stepId: string, body: Record<string, unknown>): Promise<FunnelStep> {
  const { step } = await getStep(subAccountId, funnelId, stepId);
  const patch: Partial<FunnelStep> = { updatedAt: Date.now() };
  if (typeof body.name === "string") patch.name = cleanName(body.name, step.name);
  if (body.pageId === null) patch.pageId = null;
  else if (typeof body.pageId === "string") {
    const pageId = assertId(body.pageId, "page");
    const page = await getAdminDb().doc(`pages/${pageId}`).get();
    if (!page.exists || page.data()?.subAccountId !== subAccountId) throw new CheckoutError("That page isn't in this workspace.", 400, { pageId: "Choose a page from this workspace." });
    patch.pageId = pageId;
  }
  await stepsCol(funnelId).doc(stepId).update(patch);
  await funnelsCol().doc(funnelId).update({ updatedAt: Date.now() });
  return { ...step, ...patch };
}

export async function deleteStep(subAccountId: string, funnelId: string, stepId: string): Promise<void> {
  const { step } = await getStep(subAccountId, funnelId, stepId);
  await stepsCol(funnelId).doc(stepId).delete();
  if (step.checkoutConfigId) await deleteCheckoutConfig(step.checkoutConfigId);
  // Re-number the remaining steps so order stays dense.
  const rest = await listSteps(funnelId);
  const batch = getAdminDb().batch();
  rest.forEach((s, i) => s.order !== i && batch.update(stepsCol(funnelId).doc(s.id), { order: i }));
  batch.update(funnelsCol().doc(funnelId), { updatedAt: Date.now() });
  await batch.commit();
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
  const batch = getAdminDb().batch();
  ids.forEach((id, i) => batch.update(stepsCol(funnelId).doc(id), { order: i, updatedAt: Date.now() }));
  batch.update(funnelsCol().doc(funnelId), { updatedAt: Date.now() });
  await batch.commit();
  return listSteps(funnelId);
}
