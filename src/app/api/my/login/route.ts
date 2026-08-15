import { NextResponse } from "next/server";
import { signPersonMagicLinkToken } from "@/lib/server/person-auth";
import { setPersonSessionCookie } from "@/lib/server/person-session";
import { authenticatePersonWithPassword } from "@/lib/server/person-password";
import { checkMemberAuthRateLimit } from "@/lib/community/member-rate-limit";
import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";

export const dynamic = "force-dynamic";

/**
 * MyMagnetix global sign-in — password mode, or (default) request a
 * passwordless magic link. Deliberate sibling of
 * `/api/portal/[saId]/login`, translated to the global Person layer: no
 * `saId`, no tenant email-domain lookup (uses the shared platform sender).
 *
 * SECURITY: password mode only ever authenticates against
 * `people/{id}.passwordHash` — never a tenant Member's passwordHash. See
 * person-password.ts's header comment for why those are deliberately
 * separate, additive password namespaces.
 */
export async function POST(request: Request) {
  let body: { email?: string; password?: string; mode?: string };
  try {
    body = (await request.json()) as {
      email?: string;
      password?: string;
      mode?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }

  if (body.mode === "password") {
    const allowed = checkMemberAuthRateLimit({
      key: `mm-password-login:${email}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in a few minutes." },
        { status: 429 },
      );
    }
    const result = await authenticatePersonWithPassword({
      email,
      password: typeof body.password === "string" ? body.password : "",
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            "Email or password is incorrect. If you have not set a MyMagnetix password yet, use the email sign-in link.",
        },
        { status: 401 },
      );
    }
    await setPersonSessionCookie(result.sessionToken);
    return NextResponse.json({ ok: true, redirectTo: "/my/gateway" });
  }

  // Magic-link mode — always returns the generic message regardless of
  // whether the email is known, same account-enumeration-safety contract
  // as every other magic-link request endpoint in this codebase.
  try {
    if (emailIsConfigured()) {
      const token = signPersonMagicLinkToken(email);
      const origin = new URL(request.url).origin;
      const link = `${origin}/api/my/login/verify?token=${encodeURIComponent(token)}`;
      await sendEmail({
        to: email,
        subject: "Your MyMagnetix sign-in link",
        text: `Hi,

Click the link below to sign in to MyMagnetix. The link expires in 15 minutes and can only be used once.

${link}

If you didn't request this, you can safely ignore it.
`,
        html: `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:32px auto;padding:0 16px;color:#202124;line-height:1.6;">
  <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;">Sign in to MyMagnetix</h1>
  <p style="margin:0 0 24px;color:#3a3a44;">Click the button below to sign in. The link expires in 15 minutes.</p>
  <p style="margin:0 0 24px;">
    <a href="${link}" style="display:inline-block;background:#202124;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:500;">Sign in</a>
  </p>
  <p style="margin:24px 0 0;font-size:12px;color:#909090;">If you didn't request this, you can safely ignore it.</p>
</body></html>`,
      });
    }
  } catch (err) {
    console.error("[my/login] Send failed", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({
    ok: true,
    message: "If that email is valid, we've sent a sign-in link.",
  });
}
