import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStandaloneCoursesStaff } from "@/lib/standalone-courses/staff-guard";
import {
  createStandaloneCourseServerSide,
  listStandaloneCourses,
} from "@/lib/server/standalone-course-service";
import type { StandaloneCourseAccess } from "@/types/standalone-courses";

export const dynamic = "force-dynamic";

/**
 * Staff: the server-verified fallback for the Standalone Courses list
 * (2026-08-30 launch-hardening) — mirrors the identical Community list GET
 * at /api/sub-accounts/[id]/community. Read access is member-level
 * (`requireSubAccountMember`, not the admin-only `requireStandaloneCoursesStaff`
 * the POST below uses), matching who can already VIEW the list page;
 * `isAdmin` is returned alongside so "New course" can be gated from this
 * same reliable read instead of the client-only computation that shares
 * the exact listener fragility this route exists to route around.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  if (subSnap.data()?.standaloneCoursesEnabledByAgency !== true) {
    return NextResponse.json(
      { error: "Standalone Courses is disabled for this sub-account." },
      { status: 403 },
    );
  }

  const courses = await listStandaloneCourses(subAccountId);
  const isAdmin =
    access.subAccountRole === "admin" || access.subAccountRole === "agencyOwner";
  return NextResponse.json({ ok: true, courses, isAdmin });
}

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
    showMemberCount?: boolean;
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
    showMemberCount: body.showMemberCount,
  });
  return NextResponse.json({ ok: true, course });
}
