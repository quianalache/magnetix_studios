import { NextResponse } from "next/server";
import { getStandaloneCoursesGate } from "@/lib/standalone-courses/gate";
import {
  signMemberSessionToken,
  verifyMemberMagicLinkToken,
} from "@/lib/community/member-auth";
import { ensureMember } from "@/lib/community/member-account";
import { setMemberSessionCookie } from "@/lib/community/member-session";

export const dynamic = "force-dynamic";

/**
 * Verify a magic-link token and exchange it for a 30-day session cookie,
 * creating (or reusing) the member identity. Mirrors
 * `/api/community/[saId]/login/verify`, minus the auto-join side effect —
 * standalone courses have no group to join; verify just establishes the
 * session and redirects back to the course, where the buyer completes
 * enroll/purchase as an explicit follow-up click (now that they're signed in).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  const url = new URL(request.url);
  const loginUrl = (error: string) =>
    NextResponse.redirect(new URL(`/course/${saId}/login?error=${error}`, url));

  const gate = await getStandaloneCoursesGate(saId);
  if (!gate || !gate.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = url.searchParams.get("token");
  if (!token) return loginUrl("missing_token");

  const verified = verifyMemberMagicLinkToken(token);
  if (!verified || verified.subAccountId !== saId) return loginUrl("expired");

  let memberId: string;
  try {
    const member = await ensureMember({
      subAccountId: saId,
      email: verified.email,
      source: "course",
    });
    if (member.status !== "active") return loginUrl("inactive");
    memberId = member.id;
  } catch (err) {
    console.error("[course/login/verify] ensureMember failed", err);
    return loginUrl("error");
  }

  const sessionToken = signMemberSessionToken(saId, memberId, verified.email);
  await setMemberSessionCookie(sessionToken);

  if (verified.courseId) {
    return NextResponse.redirect(
      new URL(`/course/${saId}/${verified.courseId}`, url),
    );
  }

  return NextResponse.redirect(new URL(`/course/${saId}/login`, url));
}
