import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  archiveAgencyCourseOfferServerSide,
  getAgencyCourseOffer,
  restoreAgencyCourseOfferServerSide,
  updateAgencyCourseOfferServerSide,
  type AgencyCourseOfferPatch,
} from "@/lib/server/agency-course-offer-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ offerId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { offerId } = await ctx.params;
  const offer = await getAgencyCourseOffer(caller.agencyId!, offerId);
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  return NextResponse.json({ ok: true, offer });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ offerId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { offerId } = await ctx.params;

  let patch: AgencyCourseOfferPatch & { action?: unknown };
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Archive / restore (pre-Funnel safety): explicit actions, never a plain edit.
  if (patch.action === "archive") {
    const r = await archiveAgencyCourseOfferServerSide({ agencyId: caller.agencyId!, offerId, uid: caller.uid });
    return r === "not_found" ? NextResponse.json({ error: "Offer not found" }, { status: 404 }) : NextResponse.json({ ok: true, visibility: "archived" });
  }
  if (patch.action === "restore") {
    const r = await restoreAgencyCourseOfferServerSide({ agencyId: caller.agencyId!, offerId });
    if (r === "not_found") return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    if (r === "not_archived") return NextResponse.json({ error: "This offer isn't archived." }, { status: 409 });
    return NextResponse.json({ ok: true, visibility: "draft" });
  }
  if (patch.action !== undefined) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (patch.visibility !== undefined && patch.visibility !== "draft" && patch.visibility !== "published") {
    return NextResponse.json({ error: "Use Archive to archive an offer." }, { status: 400 });
  }
  if (patch.visibility !== undefined) {
    const current = await getAgencyCourseOffer(caller.agencyId!, offerId);
    if (current?.visibility === "archived") {
      return NextResponse.json({ error: "This offer is archived. Restore it before publishing." }, { status: 409 });
    }
  }
  try {
    await updateAgencyCourseOfferServerSide({ agencyId: caller.agencyId!, offerId, patch });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ offerId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { offerId } = await ctx.params;
  // DELETE archives (pre-Funnel safety) — offers are never hard-deleted.
  const r = await archiveAgencyCourseOfferServerSide({ agencyId: caller.agencyId!, offerId, uid: caller.uid });
  if (r === "not_found") return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  return NextResponse.json({ ok: true, archived: true });
}
