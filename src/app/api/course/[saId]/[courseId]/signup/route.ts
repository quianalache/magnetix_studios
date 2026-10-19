import "server-only";

import { NextResponse } from "next/server";
import { signupRateLimitError } from "@/lib/community/signup-sign-in-link";
import { getStandaloneCoursesGate } from "@/lib/standalone-courses/gate";
import {
  getStandaloneCourse,
  getStandaloneEnrollment,
  enrollInStandaloneCourseServerSide,
  courseHasChartGatedLessons,
  type EnrollBirthDetails,
} from "@/lib/server/standalone-course-service";
import { startStandaloneCourseStripeCheckoutServerSide } from "@/lib/server/standalone-course-purchase-service";
import { resolveSignupMember } from "@/lib/community/signup-member";

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
  const rateLimited = signupRateLimitError(request);
  if (rateLimited) {
    return NextResponse.json({ error: rateLimited }, { status: 429 });
  }

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
    birthDate?: string;
    birthTime?: string;
    birthPlace?: string;
    lat?: number;
    lng?: number;
    timeZone?: string;
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

  // Chart-gated courses (2026-08-09) need birth details to know which
  // lessons this student unlocks — required only when the course actually
  // has at least one gated lesson, checked server-side rather than trusted
  // from the client, same as every other gate in this route.
  const needsBirthDetails = await courseHasChartGatedLessons(saId, courseId);
  let birthDetails: EnrollBirthDetails | undefined;
  if (needsBirthDetails) {
    const birthDate = body?.birthDate?.trim() ?? "";
    const birthTime = body?.birthTime?.trim() ?? "";
    const birthPlace = body?.birthPlace?.trim() ?? "";
    if (!birthDate || !birthTime || !birthPlace) {
      return NextResponse.json(
        { error: "This course personalizes lessons to your chart — birth date, time, and place are all required." },
        { status: 400 },
      );
    }
    birthDetails = { name, birthDate, birthTime, birthPlace, lat: body?.lat, lng: body?.lng, timeZone: body?.timeZone };
  }

  // Sign-up security (2026-10-19): knowing an existing member's email never
  // signs anyone in — see resolveSignupMember.
  const resolved = await resolveSignupMember({
    subAccountId: saId,
    email,
    displayName: name,
    phone,
    returnPath: `/course/${saId}/${courseId}?enroll=1`,
  });
  if (resolved.kind === "sign-in-required") {
    return NextResponse.json(resolved.body);
  }
  const member = resolved.member;

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
      birthDetails,
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
