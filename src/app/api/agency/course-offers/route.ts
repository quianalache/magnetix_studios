import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { createAgencyCourseOfferServerSide, listAgencyCourseOffers } from "@/lib/server/agency-course-offer-service";
import type { OfferType, RecurringInterval } from "@/types/course-offers";

export const dynamic = "force-dynamic";

/** Agency Course Offers — owner-only. */
export async function GET(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const offers = await listAgencyCourseOffers(caller.agencyId!);
  return NextResponse.json({ ok: true, offers });
}

export async function POST(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  let body: {
    title?: string;
    courseIds?: string[];
    type?: OfferType;
    priceCents?: number | null;
    currency?: string | null;
    recurringInterval?: RecurringInterval | null;
    trialDays?: number | null;
    priceTextOverride?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.title?.trim()) return NextResponse.json({ error: "A title is required" }, { status: 400 });
  if (!body.courseIds || body.courseIds.length === 0) {
    return NextResponse.json({ error: "Select at least one course" }, { status: 400 });
  }

  const offer = await createAgencyCourseOfferServerSide({
    agencyId: caller.agencyId!,
    title: body.title,
    courseIds: body.courseIds,
    type: body.type,
    priceCents: body.priceCents,
    currency: body.currency,
    recurringInterval: body.recurringInterval,
    trialDays: body.trialDays,
    priceTextOverride: body.priceTextOverride,
  });
  return NextResponse.json({ ok: true, offer });
}
