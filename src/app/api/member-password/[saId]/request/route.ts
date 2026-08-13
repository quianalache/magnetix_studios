import { NextResponse } from "next/server";
import {
  MEMBER_PASSWORD_RESET_GENERIC_MESSAGE,
  sendMemberPasswordEmail,
} from "@/lib/community/member-password";
import { checkMemberAuthRateLimit } from "@/lib/community/member-rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> }
) {
  const { saId } = await params;
  let body: { email?: string; next?: string };
  try {
    body = (await request.json()) as { email?: string; next?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }
  const allowed = checkMemberAuthRateLimit({
    key: `member-password-request:${saId}:${email}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!allowed) {
    return NextResponse.json({
      ok: true,
      message: MEMBER_PASSWORD_RESET_GENERIC_MESSAGE,
    });
  }

  const origin = new URL(request.url).origin;
  const nextPath =
    typeof body.next === "string" && body.next.startsWith("/")
      ? body.next
      : null;
  try {
    await sendMemberPasswordEmail({
      subAccountId: saId,
      email,
      origin,
      nextPath,
    });
  } catch (err) {
    console.error("[member-password/request] send failed", err);
  }

  return NextResponse.json({
    ok: true,
    message: MEMBER_PASSWORD_RESET_GENERIC_MESSAGE,
  });
}
