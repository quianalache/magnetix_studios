import "server-only";

import { NextResponse } from "next/server";
import { requireCourseOffersStaff } from "@/lib/course-offers/staff-guard";
import { updateCourseOfferThemeServerSide } from "@/lib/server/course-offer-service";
import type { CourseTheme } from "@/types/course-theme";

export const dynamic = "force-dynamic";

/** Staff: full-object replace of an offer's theme (the theme editor's Save). */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; offerId: string }> },
) {
  const { id: subAccountId, offerId } = await ctx.params;
  const access = await requireCourseOffersStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => null)) as {
    theme?: CourseTheme;
  } | null;
  if (!body?.theme) {
    return NextResponse.json({ error: "Missing theme" }, { status: 400 });
  }

  await updateCourseOfferThemeServerSide({
    subAccountId,
    offerId,
    theme: body.theme,
  });
  return NextResponse.json({ ok: true });
}
