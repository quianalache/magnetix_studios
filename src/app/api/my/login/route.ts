import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { signPersonMagicLinkToken, signPersonSessionToken } from "@/lib/server/person-auth";
import { setPersonSessionCookie } from "@/lib/server/person-session";
import { authenticatePersonWithPassword } from "@/lib/server/person-password";
import { verifyFirebasePassword } from "@/lib/server/firebase-rest-auth";
import { ensurePersonLinkForStaffUser } from "@/lib/server/person-identity-service";
import { checkMemberAuthRateLimit } from "@/lib/community/member-rate-limit";
import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";

export const dynamic = "force-dynamic";

/**
 * MyMagnetix global sign-in — password mode, or (default) request a
 * passwordless magic link. Deliberate sibling of
 * `/api/portal/[saId]/login`, translated to the global Person layer: no
 * `saId`, no tenant email-domain lookup (uses the shared platform sender).
 *
 * UNIFIED CREDENTIALS (2026-08-17): password mode tries TWO credential
 * authorities, in order, and accepts either:
 *   1. `people/{id}.passwordHash` — the MyMagnetix-only password, for a
 *      Person with no Business Center/Firebase account.
 *   2. An existing Business Center Firebase email/password, verified
 *      through Firebase's OWN REST auth endpoint (never a copied/read
 *      password hash — see firebase-rest-auth.ts). A dual-role human
 *      should not have to maintain a second password for the same
 *      Magnetix account just to reach MyMagnetix.
 * Either path only ever resolves an IDENTITY (a personId) and mints
 * mm_session — never Firebase custom claims, never a `__session` cookie,
 * never tenant/staff authorization. That boundary is unchanged; only the
 * set of credentials MyMagnetix will accept as proof of identity grew.
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
    const password = typeof body.password === "string" ? body.password : "";

    // Authority 1: MyMagnetix-only password (member-only Person path,
    // unaffected — checked first since it's the common case and needs no
    // external call).
    const personResult = await authenticatePersonWithPassword({ email, password });
    if (personResult.ok) {
      await setPersonSessionCookie(personResult.sessionToken);
      return NextResponse.json({ ok: true, redirectTo: "/my/gateway" });
    }

    // Authority 2: existing Business Center Firebase credential. Only
    // attempted when Authority 1 fails, so a member-only Person never
    // pays for the extra network round-trip. Firebase's own REST endpoint
    // fails closed to null for wrong password / no such account / disabled
    // account — none of those are distinguished here (or below), so no
    // enumeration signal escapes either path.
    const firebaseResult = await verifyFirebasePassword(email, password);
    if (firebaseResult) {
      const userSnap = await getAdminDb().doc(`users/${firebaseResult.uid}`).get();
      const user = userSnap.data();
      if (userSnap.exists && user?.status === "active") {
        const personId = await ensurePersonLinkForStaffUser({
          uid: firebaseResult.uid,
          email,
          personId: (user.personId as string | null | undefined) ?? null,
        });
        if (personId) {
          const sessionToken = signPersonSessionToken(personId, email);
          await setPersonSessionCookie(sessionToken);
          return NextResponse.json({ ok: true, redirectTo: "/my/gateway" });
        }
      }
    }

    return NextResponse.json(
      {
        error:
          "Email or password is incorrect. If you have not set a MyMagnetix password yet, use the email sign-in link.",
      },
      { status: 401 },
    );
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
