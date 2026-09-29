import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  AgencyComplimentaryError,
  grantAgencyCourseComplimentaryAccess,
  listAgencyCourseComplimentaryGrants,
  revokeAgencyCourseComplimentaryAccess,
} from "@/lib/server/agency-course-complimentary-service";

export const dynamic = "force-dynamic";

/**
 * Agency Standalone Course → complimentary access (owner-approved
 * 2026-09-25). Agency owner only; the agency is always the caller's own
 * (from verified claims), never a request parameter. See
 * agency-course-complimentary-service.ts — no purchase or payment is ever
 * created, and revoking never removes independently paid access.
 *
 *   GET                         → active grants
 *   POST   { email, displayName? } → grant
 *   DELETE { personId }            → revoke that person's grant
 */
type Ctx = { params: Promise<{ courseId: string }> };

function fail(err: unknown) {
  if (err instanceof AgencyComplimentaryError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  throw err;
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(request: Request, ctx: Ctx) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId } = await ctx.params;
  const grants = await listAgencyCourseComplimentaryGrants(caller.agencyId!, courseId);
  return NextResponse.json({ grants });
}

export async function POST(request: Request, ctx: Ctx) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId } = await ctx.params;
  const b = await body(request);
  if (!b) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  try {
    const result = await grantAgencyCourseComplimentaryAccess({
      agencyId: caller.agencyId!,
      courseId,
      email: typeof b.email === "string" ? b.email : "",
      displayName: typeof b.displayName === "string" ? b.displayName : null,
      staffUid: caller.uid,
    });
    return NextResponse.json(result);
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { courseId } = await ctx.params;
  const b = await body(request);
  if (!b) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  try {
    const result = await revokeAgencyCourseComplimentaryAccess({
      agencyId: caller.agencyId!,
      courseId,
      personId: typeof b.personId === "string" ? b.personId : "",
      staffUid: caller.uid,
    });
    return NextResponse.json(result);
  } catch (err) {
    return fail(err);
  }
}
