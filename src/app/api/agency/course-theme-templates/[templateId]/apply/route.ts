import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  applyAgencyCourseThemeTemplateServerSide,
  applyAgencyCourseThemeTemplateToOfferServerSide,
} from "@/lib/server/agency-course-theme-template-service";

export const dynamic = "force-dynamic";

/** Owner-only: apply a saved template onto either a course or an offer. */
export async function POST(request: Request, ctx: { params: Promise<{ templateId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { templateId } = await ctx.params;

  let body: { courseId?: string; offerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.courseId && !body.offerId) {
    return NextResponse.json({ error: "courseId or offerId is required" }, { status: 400 });
  }

  try {
    if (body.offerId) {
      await applyAgencyCourseThemeTemplateToOfferServerSide({ agencyId: caller.agencyId!, offerId: body.offerId, templateId });
    } else {
      await applyAgencyCourseThemeTemplateServerSide({ agencyId: caller.agencyId!, courseId: body.courseId!, templateId });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't apply template" }, { status: 400 });
  }
}
