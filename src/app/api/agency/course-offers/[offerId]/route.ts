import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  deleteAgencyCourseOfferServerSide,
  getAgencyCourseOffer,
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

  let patch: AgencyCourseOfferPatch;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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
  await deleteAgencyCourseOfferServerSide({ agencyId: caller.agencyId!, offerId });
  return NextResponse.json({ ok: true });
}
