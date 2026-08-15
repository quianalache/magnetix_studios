import { NextResponse } from "next/server";
import {
  sendPersonPasswordEmail,
  PERSON_PASSWORD_RESET_GENERIC_MESSAGE,
} from "@/lib/server/person-password";
import { checkMemberAuthRateLimit } from "@/lib/community/member-rate-limit";

export const dynamic = "force-dynamic";

/**
 * Request a "set" (first time) or "reset" (already has one) MyMagnetix
 * password email. Always returns the same generic message regardless of
 * outcome — account-enumeration-safe, mirrors
 * `/api/member-password/[saId]/request`.
 */
export async function POST(request: Request) {
  let body: { email?: string; next?: string };
  try {
    body = (await request.json()) as { email?: string; next?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const allowed = checkMemberAuthRateLimit({
      key: `mm-password-request:${email}`,
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (allowed) {
      const origin = new URL(request.url).origin;
      await sendPersonPasswordEmail({
        email,
        origin,
        nextPath: typeof body.next === "string" ? body.next : null,
      }).catch((err) => console.error("[my/password/request] failed", err));
    }
  }

  return NextResponse.json({ ok: true, message: PERSON_PASSWORD_RESET_GENERIC_MESSAGE });
}
