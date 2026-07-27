import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import {
  applyCourseThemeTemplateServerSide,
  applyCourseThemeTemplateToOfferServerSide,
} from "@/lib/server/course-theme-template-service";

export const dynamic = "force-dynamic";

/**
 * Staff: apply a saved template (deep-copy, not a reference) onto either a
 * course or an offer — templates are fully generic, so either target works
 * off the same collection. Exactly one of `courseId`/`offerId` is expected.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; templateId: string }> },
) {
  const { id: subAccountId, templateId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { courseId?: string; offerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.courseId && !body.offerId) {
    return NextResponse.json(
      { error: "courseId or offerId is required" },
      { status: 400 },
    );
  }

  try {
    if (body.offerId) {
      await applyCourseThemeTemplateToOfferServerSide({
        subAccountId,
        offerId: body.offerId,
        templateId,
      });
    } else {
      await applyCourseThemeTemplateServerSide({
        subAccountId,
        courseId: body.courseId!,
        templateId,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't apply template" },
      { status: 400 },
    );
  }
}
