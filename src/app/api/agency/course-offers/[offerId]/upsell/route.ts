import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  createAgencyOneClickUpsellServerSide,
  updateAgencyOneClickUpsellServerSide,
  deleteAgencyOneClickUpsellServerSide,
  getAgencyOneClickUpsell,
} from "@/lib/server/agency-course-offer-upsell-service";
import type { OfferVisibility } from "@/types/course-offers";

export const dynamic = "force-dynamic";

/** Owner-only: the (at most one) One-Click Upsell on an Agency Course
 *  Offer. One endpoint covers the whole lifecycle since only one can ever
 *  exist per offer — simpler than tenant's generic multi-upsell CRUD,
 *  which also has to support several "inApp" upsells (not ported this
 *  pass — see agency-course-offer-upsell-service.ts). */
export async function GET(request: Request, ctx: { params: Promise<{ offerId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { offerId } = await ctx.params;
  const upsell = await getAgencyOneClickUpsell(caller.agencyId!, offerId);
  return NextResponse.json({ ok: true, upsell });
}

export async function POST(request: Request, ctx: { params: Promise<{ offerId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { offerId } = await ctx.params;

  let body: { targetOfferId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.targetOfferId) return NextResponse.json({ error: "targetOfferId is required" }, { status: 400 });

  try {
    const upsell = await createAgencyOneClickUpsellServerSide({ agencyId: caller.agencyId!, offerId, targetOfferId: body.targetOfferId });
    return NextResponse.json({ ok: true, upsell });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't create upsell" }, { status: 400 });
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ offerId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { offerId } = await ctx.params;
  const existing = await getAgencyOneClickUpsell(caller.agencyId!, offerId);
  if (!existing) return NextResponse.json({ error: "No upsell to update" }, { status: 404 });

  let body: { visibility?: OfferVisibility; targetOfferId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  await updateAgencyOneClickUpsellServerSide({ agencyId: caller.agencyId!, offerId, upsellId: existing.id, patch: body });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ offerId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { offerId } = await ctx.params;
  const existing = await getAgencyOneClickUpsell(caller.agencyId!, offerId);
  if (!existing) return NextResponse.json({ ok: true });
  await deleteAgencyOneClickUpsellServerSide({ agencyId: caller.agencyId!, offerId, upsellId: existing.id });
  return NextResponse.json({ ok: true });
}
