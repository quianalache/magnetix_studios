import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import { applyLearningExperienceToAllCoursesServerSide } from "@/lib/server/standalone-course-service";
import type { StandaloneCourseLearningExperience } from "@/types/standalone-courses";

export const dynamic = "force-dynamic";

/** Staff: "Apply to all courses" — copies one course's learning-experience
 *  toggles onto every course in the sub-account. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => null)) as {
    learningExperience?: StandaloneCourseLearningExperience;
  } | null;
  if (!body?.learningExperience) {
    return NextResponse.json(
      { error: "Missing learningExperience" },
      { status: 400 },
    );
  }

  await applyLearningExperienceToAllCoursesServerSide({
    subAccountId,
    learningExperience: body.learningExperience,
  });
  return NextResponse.json({ ok: true });
}
