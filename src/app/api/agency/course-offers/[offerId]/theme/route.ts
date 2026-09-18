import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { updateAgencyCourseOfferThemeServerSide } from "@/lib/server/agency-course-offer-service";
import type { CourseTheme } from "@/types/course-theme";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: Promise<{ offerId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { offerId } = await ctx.params;

  let theme: CourseTheme;
  try {
    const body = (await request.json()) as { theme?: CourseTheme };
    if (!body.theme) throw new Error("Missing theme");
    theme = body.theme;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await updateAgencyCourseOfferThemeServerSide({ agencyId: caller.agencyId!, offerId, theme });
  return NextResponse.json({ ok: true });
}
