import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { createAgencySectionServerSide } from "@/lib/server/agency-community-classroom-service";

export const dynamic = "force-dynamic";

/** Owner-only: add a section to a course. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; courseId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, courseId } = await ctx.params;

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const section = await createAgencySectionServerSide({
    agencyId: caller.agencyId!,
    groupId,
    courseId,
    title: body.title ?? "New section",
  });
  return NextResponse.json({ ok: true, section });
}
