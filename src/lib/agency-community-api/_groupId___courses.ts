import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { listAgencyCourses } from "@/lib/server/agency-community-classroom-service";

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

export async function POST(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  return NextResponse.json(
    { error: "Create a canonical Course first, then link it to this Community." },
    { status: 410 },
  );
}
