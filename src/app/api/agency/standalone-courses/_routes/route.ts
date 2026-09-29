import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  createAgencyStandaloneCourseServerSide,
  listAgencyStandaloneCourses,
} from "@/lib/server/agency-standalone-course-service";
import type { StandaloneCourseAccess } from "@/types/standalone-courses";

export const dynamic = "force-dynamic";

/** Agency Standalone Courses — owner-only, the agency-scope sibling of
 *  /api/sub-accounts/[id]/standalone-courses. */
export async function GET(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const courses = await listAgencyStandaloneCourses(caller.agencyId!);
  return NextResponse.json({ ok: true, courses });
}

export async function POST(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  let body: {
    title?: string;
    aboutHtml?: string;
    coverUrl?: string | null;
    category?: string | null;
    access?: StandaloneCourseAccess;
    priceCents?: number | null;
    currency?: string | null;
    billingType?: "oneTime" | "recurring";
    recurringInterval?: "day" | "week" | "month" | "year" | null;
    trialDays?: number | null;
    published?: boolean;
    showMemberCount?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "A course title is required" }, { status: 400 });
  }

  const course = await createAgencyStandaloneCourseServerSide({
    agencyId: caller.agencyId!,
    title: body.title,
    aboutHtml: body.aboutHtml,
    coverUrl: body.coverUrl ?? null,
    category: body.category ?? null,
    access: body.access,
    priceCents: body.priceCents ?? null,
    currency: body.currency ?? null,
    billingType: body.billingType,
    recurringInterval: body.recurringInterval,
    trialDays: body.trialDays,
    published: body.published,
    showMemberCount: body.showMemberCount,
  });
  return NextResponse.json({ ok: true, course });
}
