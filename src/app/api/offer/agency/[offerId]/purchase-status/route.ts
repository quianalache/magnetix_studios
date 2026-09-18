import "server-only";

import { NextResponse } from "next/server";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { getCurrentPerson } from "@/lib/server/person-session";
import { hasPaidAgencyCourseOffer } from "@/lib/server/agency-course-offer-purchase-service";

export const dynamic = "force-dynamic";

/** Polled by the offer's purchase-complete page while it waits for the
 *  Stripe webhook to grant access. No One-Click Upsell for agency (not
 *  ported this pass). */
export async function GET(_request: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const paid = await hasPaidAgencyCourseOffer(agencyId, offerId, person.id);
  return NextResponse.json({ paid, oneClickUpsell: null });
}
