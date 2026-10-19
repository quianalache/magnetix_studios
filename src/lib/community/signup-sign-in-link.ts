import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { signMemberMagicLinkToken } from "@/lib/community/member-auth";
import { checkMemberAuthRateLimit } from "@/lib/community/member-rate-limit";
import { emailIsConfigured, sendEmail, sendTenantEmail } from "@/lib/comms/resend";
import { signPersonMagicLinkToken } from "@/lib/server/person-auth";
import type { SubAccountDoc } from "@/types";

/**
 * Sign-up security (2026-10-19). When an instant Offer/course sign-up uses
 * an email that already has an account, the sign-up never signs anyone in.
 * Instead the account owner gets a one-time sign-in link that brings them
 * back to the same page with the enrollment form reopened, so checkout
 * continues after they've proven the inbox is theirs.
 */

const SIGNUP_LINK_LIMIT = 5;
const SIGNUP_LINK_WINDOW_MS = 15 * 60 * 1000;

/** The JSON the four sign-up routes return when a sign-in is required. */
export function signInRequiredResponseBody(email: string) {
  return {
    ok: true as const,
    mode: "verify" as const,
    message: `This email already has an account. We've sent a sign-in link to ${email} — open it to continue right where you left off.`,
  };
}

function emailHtml(title: string, intro: string, link: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:32px auto;padding:0 16px;color:#202124;line-height:1.6;">
  <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;">${title}</h1>
  <p style="margin:0 0 24px;color:#3a3a44;">${intro}</p>
  <p style="margin:0 0 24px;">
    <a href="${link}" style="display:inline-block;background:#202124;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:500;">Sign in and continue</a>
  </p>
  <p style="margin:24px 0 0;font-size:12px;color:#909090;">If you didn't request this, you can safely ignore it — nothing happens until the link is opened.</p>
</body></html>`;
}

const INTRO =
  "Someone started checking out with this email, which already has an account. Sign in to continue. The link expires in 15 minutes.";

/**
 * Business-scoped (Member) link. Verified by the existing course sign-in
 * route, which redirects back to `returnPath` — an `/offer/{saId}/…` or
 * `/course/{saId}/…` page of the same business.
 */
export async function sendMemberSignupSignInLink({
  subAccountId,
  email,
  returnPath,
}: {
  subAccountId: string;
  email: string;
  returnPath: string;
}): Promise<void> {
  const allowed = checkMemberAuthRateLimit({
    key: `signup-sign-in-link:${subAccountId}:${email}`,
    limit: SIGNUP_LINK_LIMIT,
    windowMs: SIGNUP_LINK_WINDOW_MS,
  });
  if (!allowed || !emailIsConfigured()) return;
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const token = signMemberMagicLinkToken(
      subAccountId,
      email,
      undefined,
      undefined,
      undefined,
      undefined,
      returnPath
    );
    const link = `${appUrl}/api/course/${subAccountId}/login/verify?token=${encodeURIComponent(token)}`;
    const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
    await sendTenantEmail({
      sub: subSnap.data() as SubAccountDoc | undefined,
      to: email,
      subject: "Sign in to continue",
      text: `Hi,\n\n${INTRO}\n\n${link}\n\nIf you didn't request this, you can safely ignore it.\n`,
      html: emailHtml("Sign in to continue", INTRO, link),
    });
  } catch (err) {
    console.error(
      "[signup-sign-in-link] member link send failed",
      err instanceof Error ? err.message : err
    );
  }
}

/** MyMagnetix (Person) link for agency Offers/courses. */
export async function sendPersonSignupSignInLink({
  email,
  origin,
  next,
}: {
  email: string;
  origin: string;
  next: string;
}): Promise<void> {
  const allowed = checkMemberAuthRateLimit({
    key: `signup-sign-in-link:person:${email}`,
    limit: SIGNUP_LINK_LIMIT,
    windowMs: SIGNUP_LINK_WINDOW_MS,
  });
  if (!allowed || !emailIsConfigured()) return;
  try {
    const token = signPersonMagicLinkToken(email);
    const link = `${origin}/api/my/login/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
    await sendEmail({
      to: email,
      subject: "Sign in to continue",
      text: `Hi,\n\n${INTRO}\n\n${link}\n\nIf you didn't request this, you can safely ignore it.\n`,
      html: emailHtml("Sign in to continue", INTRO, link),
    });
  } catch (err) {
    console.error(
      "[signup-sign-in-link] person link send failed",
      err instanceof Error ? err.message : err
    );
  }
}
