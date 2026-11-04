import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { pageSubAccountId } from "@/lib/server/page-form-resolver";
import { resolveBookingsForSubAccount } from "@/lib/server/page-booking-resolver";
import { isBookingSlug } from "@/lib/pages-funnels/booking-block";

/**
 * Booking-block resolver for the builder canvas and Preview (client
 * components; Booking Page docs are member-only). Same tenant model as
 * `resolve-form`: the caller names the PAGE (`pageId`) and the slugs; the
 * workspace is that page's own `subAccountId`, read server-side, and the
 * caller must be able to open it. A slug only ever resolves inside that
 * workspace — a foreign, missing or malformed one comes back `null`, and an
 * unknown page / no access is a bare 404, so nothing about another
 * workspace's Booking Pages is revealed.
 *
 * Drafts are included (flagged) so the owner can see why visitors won't get
 * the block; published pages resolve server-side and never include them.
 */
const notFound = () => NextResponse.json(null, { status: 404 });

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const pageId = params.get("pageId");
  const slugs = (params.get("slugs") ?? "").split(",").filter(isBookingSlug).slice(0, 20);
  if (!pageId || slugs.length === 0) return notFound();

  const subAccountId = await pageSubAccountId(pageId);
  if (!subAccountId) return notFound();
  const access = await requireSubAccountMember(req, subAccountId);
  if (access instanceof NextResponse) return notFound();

  const bookings = await resolveBookingsForSubAccount(subAccountId, slugs, { includeDrafts: true });
  return NextResponse.json({ bookings });
}
