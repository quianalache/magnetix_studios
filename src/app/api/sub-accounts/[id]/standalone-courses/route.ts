import "server-only";

import { NextResponse } from "next/server";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import { createStandaloneCourseServerSide } from "@/lib/server/standalone-course-service";
import type { StandaloneCourseAccess } from "@/types/standalone-courses";

export const dynamic = "force-dynamic";

/** Staff: create a standalone course. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireStandaloneCoursesStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: {
    title?: string;
    aboutHtml?: string;
    coverUrl?: string | null;
    category?: string | null;
    access?: StandaloneCourseAccess;
    priceCents?: number | null;
    currency?: string | null;
    published?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json(
      { error: "A course title is required" },
      { status: 400 },
    );
  }

  const course = await createStandaloneCourseServerSide({
    subAccountId,
    agencyId: access.resolvedAgencyId,
    title: body.title,
    aboutHtml: body.aboutHtml,
    coverUrl: body.coverUrl ?? null,
    category: body.category ?? null,
    access: body.access,
    priceCents: body.priceCents ?? null,
    currency: body.currency ?? null,
    published: body.published,
  });
  return NextResponse.json({ ok: true, course });
}
