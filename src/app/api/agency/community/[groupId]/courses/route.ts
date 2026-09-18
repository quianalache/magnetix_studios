import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { createAgencyCourseServerSide, listAgencyCourses } from "@/lib/server/agency-community-classroom-service";
import type { CourseAccess } from "@/types/community";

export const dynamic = "force-dynamic";

/** Agency Community Classroom builder — owner-only. GET lists every
 *  course (published or not) for the builder's own list view (a client-
 *  fetch equivalent of the tenant builder's realtime Firestore
 *  subscription — see agency-community-classroom-service.ts's module
 *  comment for why agency owner pages use client-fetch instead). */
export async function GET(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId } = await ctx.params;
  const courses = await listAgencyCourses(caller.agencyId!, groupId);
  return NextResponse.json({ courses });
}

export async function POST(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId } = await ctx.params;

  let body: {
    title?: string;
    description?: string;
    thumbnailUrl?: string | null;
    access?: CourseAccess;
    requiredLevel?: number | null;
    priceCents?: number | null;
    published?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "A course title is required" }, { status: 400 });
  }

  const course = await createAgencyCourseServerSide({
    agencyId: caller.agencyId!,
    groupId,
    title: body.title,
    description: body.description,
    thumbnailUrl: body.thumbnailUrl ?? null,
    access: body.access,
    requiredLevel: body.requiredLevel ?? null,
    priceCents: body.priceCents ?? null,
    published: body.published,
  });
  return NextResponse.json({ ok: true, course });
}
