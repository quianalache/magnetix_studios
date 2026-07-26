import "server-only";

import { NextResponse } from "next/server";
import { getStandaloneCoursesGate } from "@/lib/standalone-courses/gate";
import {
  getStandaloneCourse,
  getStandaloneEnrollment,
  enrollInStandaloneCourseServerSide,
} from "@/lib/server/standalone-course-service";
import { startStandaloneCourseStripeCheckoutServerSide } from "@/lib/server/standalone-course-purchase-service";
import { ensureMember } from "@/lib/community/member-account";
import { signMemberSessionToken } from "@/lib/community/member-auth";
import { setMemberSessionCookie } from "@/lib/community/member-session";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Instant signup + enroll/purchase — the core of the redesigned enroll flow.
 * Replaces the old magic-link-first path: a visitor submits name/email/phone
 * directly from the sales-page popup, the member session is minted right
 * here (no email round trip), and the request branches straight into
 * enrollment (free) or a Stripe embedded Checkout session (paid). Every
 * submission reconciles a CRM contact via `ensureMember`.
 *
 * Can't reuse `requireCourseApiAccess` — it requires an EXISTING session,
 * and this route is what creates one.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; courseId: string }> },
) {
  const { saId, courseId } = await params;

  const gate = await getStandaloneCoursesGate(saId);
  if (!gate || !gate.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const course = await getStandaloneCourse(saId, courseId);
  if (!course || !course.published) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    phone?: string;
  } | null;
  const name = body?.name?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const phone = body?.phone?.trim() ?? "";
  if (!name || !EMAIL_RE.test(email) || !phone) {
    return NextResponse.json(
      { error: "Name, email, and phone are all required." },
      { status: 400 },
    );
  }

  const member = await ensureMember({
    subAccountId: saId,
    email,
    displayName: name,
    phone,
    source: "course",
  });

  const token = signMemberSessionToken(saId, member.id, member.email);
  await setMemberSessionCookie(token);

  const classroomUrl = `/course/${saId}/${courseId}/classroom`;

  // Already enrolled (repeat free-join, or a returning paid buyer re-entering
  // the popup instead of using the magic-link login) — skip straight in,
  // never double-charge.
  const existingEnrollment = await getStandaloneEnrollment(saId, courseId, member.id);
  if (existingEnrollment) {
    return NextResponse.json({ ok: true, mode: "free", redirectTo: classroomUrl });
  }

  if (course.access === "open") {
    await enrollInStandaloneCourseServerSide({
      subAccountId: saId,
      agencyId: gate.agencyId,
      courseId,
      memberId: member.id,
    });
    return NextResponse.json({ ok: true, mode: "free", redirectTo: classroomUrl });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const returnUrl = `${appUrl}/course/${saId}/${courseId}/purchase-complete?session_id={CHECKOUT_SESSION_ID}`;
    const { clientSecret } = await startStandaloneCourseStripeCheckoutServerSide({
      subAccountId: saId,
      courseId,
      memberId: member.id,
      memberEmail: member.email,
      returnUrl,
    });
    return NextResponse.json({ ok: true, mode: "paid", clientSecret });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't start checkout" },
      { status: 400 },
    );
  }
}
