import "server-only";

import { NextResponse } from "next/server";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  chargeOneClickUpsellForAgencyServerSide,
  getPaidAgencyOfferPurchaseId,
} from "@/lib/server/agency-course-offer-purchase-service";

export const dynamic = "force-dynamic";

/** Signed-in Person: accept the One-Click Upsell interstitial shown right
 *  after purchasing `[offerId]` — mirrors
 *  /api/offer/[saId]/[offerId]/upsell/accept/route.ts. */
export async function POST(request: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { targetOfferId?: string } | null;
  if (!body?.targetOfferId) return NextResponse.json({ error: "Missing targetOfferId" }, { status: 400 });

  const triggerPurchaseId = await getPaidAgencyOfferPurchaseId(agencyId, offerId, person.id);
  if (!triggerPurchaseId) return NextResponse.json({ error: "No purchase found for this offer" }, { status: 400 });

  const result = await chargeOneClickUpsellForAgencyServerSide({
    agencyId,
    triggerOfferId: offerId,
    triggerPurchaseId,
    targetOfferId: body.targetOfferId,
    personId: person.id,
  });
  return NextResponse.json(result);
}
