import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCommunityGate } from "@/lib/community/gate";
import { findMemberByEmail } from "@/lib/community/member-account";
import { signMemberMagicLinkToken } from "@/lib/community/member-auth";
import { checkMemberAuthRateLimit } from "@/lib/community/member-rate-limit";
import { resolveCommunityRequestOrigin } from "@/lib/community/domain";
import { emailIsConfigured, sendTenantEmail } from "@/lib/comms/resend";
import { getGroupById } from "@/lib/server/community-service";
import type { SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> }
) {
  const { saId } = await params;
  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: {
    displayName?: string;
    email?: string;
    join?: string;
    ref?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const displayName = body.displayName?.trim();
  const groupId = body.join?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email." },
      { status: 400 }
    );
  }
  if (!displayName || displayName.length > 120) {
    return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  }
  if (!groupId)
    return NextResponse.json(
      { error: "Community context is required." },
      { status: 400 }
    );

  const group = await getGroupById(saId, groupId);
  if (!group || group.status !== "published") {
    return NextResponse.json(
      { error: "That Community is not available." },
      { status: 404 }
    );
  }
  if (
    !checkMemberAuthRateLimit({
      key: `member-signup:${saId}:${email}`,
      limit: 5,
      windowMs: 10 * 60 * 1000,
    })
  ) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }
  if (await findMemberByEmail(saId, email)) {
    return NextResponse.json(
      { error: "An account already exists for that email. Log in instead." },
      { status: 409 }
    );
  }

  try {
    if (emailIsConfigured()) {
      const { origin } = await resolveCommunityRequestOrigin(
        saId,
        request.headers.get("host")
      );
      const token = signMemberMagicLinkToken(
        saId,
        email,
        group.id,
        undefined,
        typeof body.ref === "string" && body.ref.trim()
          ? body.ref.trim()
          : undefined,
        displayName
      );
      const link = `${origin}/api/community/${saId}/login/verify?token=${encodeURIComponent(token)}`;
      const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
      const sub = subSnap.data() as SubAccountDoc | undefined;
      await sendTenantEmail({
        sub,
        to: email,
        subject: `Finish joining ${group.name}`,
        text: `Hi ${displayName},\n\nClick the link below to finish joining ${group.name}. The link expires in 15 minutes.\n\n${link}\n\nIf you didn't request this, you can safely ignore it.\n`,
        html: `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:32px auto;padding:0 16px;color:#202124;line-height:1.6;"><h1 style="font-size:20px;font-weight:600;margin:0 0 16px;">Finish joining ${group.name}</h1><p style="margin:0 0 24px;color:#3a3a44;">Click the button below to finish creating your Community member account. The link expires in 15 minutes.</p><p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;background:#202124;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:500;">Join Community</a></p></body></html>`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[community/signup] Send failed: ${message}`);
  }

  return NextResponse.json({
    ok: true,
    message: "If that email is valid, we've sent a link to finish joining.",
  });
}
