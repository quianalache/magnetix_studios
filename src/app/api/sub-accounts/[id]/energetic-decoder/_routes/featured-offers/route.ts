import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listCourseOffers } from "@/lib/server/course-offer-service";
import { resolveFeaturedOffer } from "@/lib/server/featured-offer-service";

/**
 * GET — this business's Offers for a Featured Offer picker (Reading Result
 * Page builder + the Standard Result's next step). `?offerId=` returns that
 * one Offer exactly as the block will show it (price, terms, what it grants
 * — straight from the Offer). Staff only.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const offerId = new URL(request.url).searchParams.get("offerId");
  if (offerId) {
    const offer = await resolveFeaturedOffer(subAccountId, offerId);
    if (!offer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, offer });
  }
  const offers = await listCourseOffers(subAccountId).catch(() => []);
  return NextResponse.json({
    ok: true,
    offers: offers.map((o) => ({ id: o.id, title: o.title, published: o.visibility === "published" })),
  });
}
