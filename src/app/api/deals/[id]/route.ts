import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  deleteDealServerSide,
  updateDealServerSide,
  type UpdateDealPatch,
} from "@/lib/server/deals-service";
import { maybeSendReviewRequest } from "@/lib/reviews/request";
import { loadCustomFieldDefs } from "@/lib/custom-fields/load-defs";
import { validateCustomFieldValues } from "@/lib/custom-fields/validation";
import { DEAL_PRIORITIES } from "@/types/deals";
import type { DealPriority, PipelineStageId } from "@/types/deals";
import { territoryGate } from "@/lib/auth/territory-filter";
import { PipelineError } from "@/lib/server/pipelines-service";

/**
 * Dashboard-facing single-deal routes:
 *   PATCH  /api/deals/:id   — edit fields and/or move stage (emits
 *                             deal.updated + deal.stage.changed/won/lost)
 *   DELETE /api/deals/:id   — delete (emits deal.deleted)
 *
 * Replaces the browser's direct Firestore writes (the edit dialog +
 * Kanban drag) so the matching webhooks fire from the shared service.
 */

const VALID_PRIORITIES = new Set(DEAL_PRIORITIES.map((p) => p.id));

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const db = getAdminDb();
  const snap = await db.doc(`deals/${id}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }
  const data = snap.data()!;

  const access = await requireSubAccountMember(request, data.subAccountId);
  if (access instanceof NextResponse) return access;
  // Same territory scoping the Firestore rules apply to the deal doc.
  const gate = await territoryGate(access, (data.territoryId as string) ?? null);
  if (gate) return gate;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: UpdateDealPatch = {};
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 200);
  if (typeof body.value === "number" && Number.isFinite(body.value) && body.value >= 0) {
    patch.value = body.value;
  }
  if (typeof body.currency === "string" && body.currency.length === 3) {
    patch.currency = body.currency.toUpperCase();
  }
  if (VALID_PRIORITIES.has(body.priority as DealPriority)) {
    patch.priority = body.priority as DealPriority;
  }
  if (typeof body.contactId === "string" && body.contactId.trim()) {
    patch.contactId = body.contactId.trim();
  }
  if (body.territoryId === null || typeof body.territoryId === "string") {
    patch.territoryId =
      typeof body.territoryId === "string" ? body.territoryId : null;
  }
  if (body.stageId !== undefined) {
    // Validated against the (destination) pipeline by the deal service.
    if (typeof body.stageId !== "string" || !body.stageId) {
      return NextResponse.json({ error: "Invalid stageId" }, { status: 400 });
    }
    patch.stageId = body.stageId as PipelineStageId;
  }
  if (body.pipelineId !== undefined) {
    if (typeof body.pipelineId !== "string" || !body.pipelineId) {
      return NextResponse.json({ error: "Invalid pipelineId" }, { status: 400 });
    }
    patch.pipelineId = body.pipelineId;
  }
  if (body.description === null || typeof body.description === "string") {
    patch.description = body.description as string | null;
  }
  if (body.expectedCloseDate === null || typeof body.expectedCloseDate === "string") {
    patch.expectedCloseDate = body.expectedCloseDate as string | null;
  }
  if (body.lostReason === null || typeof body.lostReason === "string") {
    patch.lostReason =
      typeof body.lostReason === "string" ? body.lostReason : null;
  }
  if (typeof body.completed === "boolean") patch.completed = body.completed;
  if (body.customFields !== undefined) {
    const defs = await loadCustomFieldDefs(data.subAccountId as string, "deal");
    const cf = validateCustomFieldValues(body.customFields, defs);
    if (!cf.ok) {
      return NextResponse.json({ error: cf.error }, { status: 400 });
    }
    patch.customFields = cf.value;
  }

  // Re-homing a deal to another contact changes its territory; a scoped
  // collaborator may only move it within their own territories.
  if (patch.territoryId !== undefined) {
    const toGate = await territoryGate(access, patch.territoryId);
    if (toGate) return toGate;
  }

  let result: Awaited<ReturnType<typeof updateDealServerSide>>;
  try {
    result = await updateDealServerSide({
      dealId: id,
      patch,
      userId: access.uid,
      mode: (data.mode as "live" | "test") ?? "live",
      expectedSubAccountId: data.subAccountId as string,
    });
  } catch (err) {
    if (err instanceof PipelineError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    throw err;
  }
  if (!result) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // Auto Google review request when a Won deal is FIRST marked completed.
  // Fire-and-forget; the dispatcher re-checks the sub-account's review config
  // (enabled + triggerOnDealCompleted + cooldown) before sending anything.
  const becameCompleted = patch.completed === true && data.completed !== true;
  const effectiveStage = patch.stageId ?? (data.stageId as PipelineStageId);
  if (becameCompleted && effectiveStage === "won") {
    void maybeSendReviewRequest({
      subAccountId: data.subAccountId as string,
      agencyId: data.agencyId as string,
      contactId: (result.deal.contact_id ?? data.contactId) as string,
      trigger: "deal_completed",
    });
  }

  return NextResponse.json({ deal: result.deal });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const db = getAdminDb();
  const snap = await db.doc(`deals/${id}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }
  const data = snap.data()!;

  const access = await requireSubAccountMember(request, data.subAccountId);
  if (access instanceof NextResponse) return access;
  const gate = await territoryGate(access, (data.territoryId as string) ?? null);
  if (gate) return gate;

  await deleteDealServerSide({
    dealId: id,
    mode: (data.mode as "live" | "test") ?? "live",
  });
  return NextResponse.json({ id, object: "deal", deleted: true });
}
