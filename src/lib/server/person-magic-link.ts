import "server-only";

import { signPersonMagicLinkToken } from "@/lib/server/person-auth";
import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";

/**
 * The MyMagnetix sign-in email — one implementation for MyMagnetix's own
 * login (/api/my/login) and the "Open your Reading in MyMagnetix" button on
 * a Reading result (2026-10-21). The link is the same hardened one-time,
 * 15-minute magic link either way; opening it only shows a continue page,
 * and only that page's POST signs the person in (magic-link-once.ts).
 *
 * `next` must already be a validated relative path. Returns false when email
 * isn't configured; throws when the provider refuses the send.
 */
export async function sendPersonMagicLinkEmail(opts: { email: string; next: string; origin: string; reason?: "signIn" | "reading" }): Promise<boolean> {
  if (!emailIsConfigured()) return false;
  const token = signPersonMagicLinkToken(opts.email);
  const link = `${opts.origin}/api/my/login/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(opts.next)}`;
  const reading = opts.reason === "reading";
  const heading = reading ? "Open your Reading in MyMagnetix" : "Sign in to MyMagnetix";
  const intro = reading
    ? "Your Reading is saved in MyMagnetix. Click the button below to open it — this also finishes setting up your access. The link expires in 15 minutes and can only be used once."
    : "Click the button below to sign in. The link expires in 15 minutes.";
  await sendEmail({
    to: opts.email,
    subject: reading ? "Open your Reading in MyMagnetix" : "Your MyMagnetix sign-in link",
    text: `Hi,

${reading ? "Your Reading is saved in MyMagnetix. Open it with the link below — this also finishes setting up your access." : "Click the link below to sign in to MyMagnetix."} The link expires in 15 minutes and can only be used once.

${link}

If you didn't request this, you can safely ignore it.
`,
    html: `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:32px auto;padding:0 16px;color:#202124;line-height:1.6;">
  <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;">${heading}</h1>
  <p style="margin:0 0 24px;color:#3a3a44;">${intro}</p>
  <p style="margin:0 0 24px;">
    <a href="${link}" style="display:inline-block;background:#202124;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:500;">${reading ? "Open my Reading" : "Sign in"}</a>
  </p>
  <p style="margin:24px 0 0;font-size:12px;color:#909090;">If you didn't request this, you can safely ignore it.</p>
</body></html>`,
  });
  return true;
}
