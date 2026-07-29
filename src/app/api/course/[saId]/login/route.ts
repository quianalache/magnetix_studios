import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStandaloneCoursesGate } from "@/lib/standalone-courses/gate";
import { signMemberMagicLinkToken } from "@/lib/community/member-auth";
import { emailIsConfigured, sendTenantEmail } from "@/lib/comms/resend";
import type { SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Request a passwordless sign-in link for a standalone-course buyer.
 * Anonymous POST. Mirrors `/api/community/[saId]/login`, but gated on
 * Standalone Courses instead of Community — so a course stays reachable on
 * sub-accounts that have Community disabled (they're independent features).
 * Sign-in-or-up: the member doc is created at verify time.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;

  const gate = await getStandaloneCoursesGate(saId);
  if (!gate || !gate.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { email?: string; course?: string };
  try {
    body = (await request.json()) as { email?: string; course?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }
  const courseId =
    typeof body.course === "string" && body.course.trim()
      ? body.course.trim()
      : undefined;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    if (emailIsConfigured()) {
      const token = signMemberMagicLinkToken(saId, email, undefined, courseId);
      const link = `${appUrl}/api/course/${saId}/login/verify?token=${encodeURIComponent(token)}`;
      const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
      const sub = subSnap.data() as SubAccountDoc | undefined;

      await sendTenantEmail({
        sub,
        to: email,
        subject: "Your sign-in link",
        text: `Hi,

Click the link below to sign in. The link expires in 15 minutes and can
only be used once.

${link}

If you didn't request this, you can safely ignore it.
`,
        html: `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:32px auto;padding:0 16px;color:#202124;line-height:1.6;">
  <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;">Sign in</h1>
  <p style="margin:0 0 24px;color:#3a3a44;">Click the button below to sign in. The link expires in 15 minutes.</p>
  <p style="margin:0 0 24px;">
    <a href="${link}" style="display:inline-block;background:#202124;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:500;">Sign in</a>
  </p>
  <p style="margin:24px 0 0;font-size:12px;color:#909090;">If you didn't request this, you can safely ignore it.</p>
</body></html>`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[course/login] Send failed: ${message}`);
  }

  return NextResponse.json({
    ok: true,
    message: "If that email is valid, we've sent a sign-in link.",
  });
}
