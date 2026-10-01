import "server-only";

import { NextResponse } from "next/server";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import {
  getAgencyStandaloneCourse,
  getAgencyStandaloneEnrollment,
  enrollInAgencyStandaloneCourseServerSide,
  agencyCourseHasChartGatedLessons,
  type AgencyEnrollBirthDetails,
} from "@/lib/server/agency-standalone-course-service";
import { startAgencyStandaloneCourseStripeCheckoutServerSide } from "@/lib/server/agency-standalone-course-purchase-service";
import { ensurePersonIdentity } from "@/lib/server/person-identity-service";
import { signPersonSessionToken } from "@/lib/server/person-auth";
import { setPersonSessionCookie } from "@/lib/server/person-session";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Instant signup + enroll/purchase for an Agency Standalone Course —
 * mirrors tenant `/api/course/[saId]/[courseId]/signup` exactly, with the
 * global Person/MyMagnetix identity substituted for a tenant Member: the
 * session minted here (`ensurePersonIdentity` + `signPersonSessionToken` +
 * `setPersonSessionCookie`) is the SAME identity that can also belong to
 * Agency Community, never a second, course-only identity.
 */
export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;

  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const course = await getAgencyStandaloneCourse(agencyId, courseId);
  if (!course || !course.published) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    birthDate?: string;
    birthTime?: string;
    birthPlace?: string;
    lat?: number;
    lng?: number;
    timeZone?: string;
  } | null;
  const name = body?.name?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!name || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Name and email are both required." }, { status: 400 });
  }

  const needsBirthDetails = await agencyCourseHasChartGatedLessons(agencyId, courseId);
  let birthDetails: AgencyEnrollBirthDetails | undefined;
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

  const personId = await ensurePersonIdentity(email);
  const token = signPersonSessionToken(personId, email);
  await setPersonSessionCookie(token);

  const classroomUrl = `/course/agency/${courseId}/classroom`;

  const existingEnrollment = await getAgencyStandaloneEnrollment(agencyId, courseId, personId);
  if (existingEnrollment) {
    return NextResponse.json({ ok: true, mode: "free", redirectTo: classroomUrl });
  }

  if (course.access === "open") {
    await enrollInAgencyStandaloneCourseServerSide({
      agencyId,
      courseId,
      personId,
      email,
      displayName: name,
      birthDetails,
    });
    return NextResponse.json({ ok: true, mode: "free", redirectTo: classroomUrl });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const returnUrl = `${appUrl}/course/agency/${courseId}/purchase-complete?session_id={CHECKOUT_SESSION_ID}`;
    const { clientSecret } = await startAgencyStandaloneCourseStripeCheckoutServerSide({
      agencyId,
      courseId,
      personId,
      personEmail: email,
      returnUrl,
    });
    return NextResponse.json({ ok: true, mode: "paid", clientSecret });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't start checkout" }, { status: 400 });
  }
}
