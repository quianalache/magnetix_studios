import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { createAgencyStandaloneSectionServerSide } from "@/lib/server/agency-standalone-course-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId } = await ctx.params;

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const section = await createAgencyStandaloneSectionServerSide({ agencyId: caller.agencyId!, courseId, title: body.title ?? "New section" });
  return NextResponse.json({ ok: true, section });
}
