import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PersonLoginForm } from "@/components/mymagnetix/person-login-form";
import { getCurrentPerson } from "@/lib/server/person-session";
import { MEMBER_SESSION_COOKIE } from "@/lib/community/member-auth";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "That sign-in link was incomplete. Request a new one below.",
  expired:
    "That sign-in link has expired or was already used. Request a new one below.",
  error: "Something went wrong signing you in. Request a new link below.",
  no_access: "That account doesn't have any MyMagnetix relationships yet.",
  bridge_unavailable:
    "Your business portal session couldn't be used to sign in here automatically. Sign in below.",
};

/** Same relative-path-only validation `/api/my/enter` and the bridge routes
 *  already use — this page redirects with `next` in three different places
 *  below, all through this one helper so they can never drift apart. */
function safeNext(next: string | undefined): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export default async function MyMagnetixLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; email?: string }>;
}) {
  const { error, next, email } = await searchParams;
  const destination = safeNext(next);
  // Cross-identity session fix (2026-09-15): /gateway passes this when it
  // already knows which email should sign in here (a CRM staff identity
  // switching MyMagnetix accounts, or one with no Member relationships
  // yet) — a lightweight prefill only, never trusted as proof of anything;
  // the real identity check still happens entirely inside the form's own
  // password/email-link submission.
  const prefillEmail =
    typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? email
      : "";
  // An `email` param means a caller (the mismatch screen's "Switch"
  // action, or GatewayMyMagnetixButton's no-relationships-yet redirect)
  // is asking for a SPECIFIC identity, not "whichever session happens to
  // already be active." Both real callers exist precisely because the
  // active session is wrong/absent for this person — never let anything
  // below silently substitute a different one.
  const hasExplicitIdentityRequest = prefillEmail !== "";

  // Already has a MyMagnetix session — skip the form entirely, straight to
  // the originally requested destination if one survived this far. When an
  // explicit identity was requested, only take this shortcut if the active
  // session is ALREADY that same person (harmless, avoids a redundant
  // login) — otherwise fall through and show the form so they can actually
  // sign in as the identity they asked for.
  const existingPerson = await getCurrentPerson();
  if (existingPerson) {
    const alreadyCorrectIdentity =
      hasExplicitIdentityRequest &&
      existingPerson.primaryEmail.toLowerCase() === prefillEmail.toLowerCase();
    if (!hasExplicitIdentityRequest || alreadyCorrectIdentity) {
      redirect(destination ?? "/gateway");
    }
  }

  // Portal Member -> MyMagnetix bridge (2026-08-16): attempt the
  // automatic bridge ONLY when no error is already showing AND no explicit
  // identity was requested — this bridge silently mints an mm_session for
  // whatever Person an UNRELATED ls_member_session cookie happens to
  // resolve to, which is exactly the silent-cross-identity behavior an
  // explicit identity request (2026-09-16 fix) exists to prevent. Without
  // this guard, switching MyMagnetix accounts while an old, unrelated
  // ls_member_session cookie is also sitting in the browser would
  // immediately re-establish a DIFFERENT mismatched mm_session and bounce
  // straight back to /gateway's mismatch screen — the exact bug this
  // guard closes. The original loop-safety guard (skip when `error` is
  // already showing) is unchanged.
  if (!error && !hasExplicitIdentityRequest) {
    const cookieStore = await cookies();
    const hasMemberCookie = !!cookieStore.get(MEMBER_SESSION_COOKIE)?.value;
    if (hasMemberCookie) {
      redirect(
        `/api/my/bridge-from-member?next=${encodeURIComponent(destination ?? "/gateway")}`
      );
    }
  }

  const errorMessage = error ? (ERROR_MESSAGES[error] ?? null) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F5] px-6 py-16">
      <div className="w-full max-w-[320px] text-center">
        <div
          className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-[13px] text-[18px] font-bold text-white"
          style={{ background: "#5E2574" }}
        >
          MM
        </div>
        <h1 className="font-serif text-[18px] font-semibold text-balance text-[#202124]">
          {destination ? "Welcome to MyMagnetix" : "Sign in to MyMagnetix"}
        </h1>
        <p className="mt-1.5 mb-5 text-[12px] leading-relaxed text-[#909090]">
          {destination
            ? "Confirm your email to continue — we'll take you straight to what you clicked."
            : "One account for everything you’re part of across Magnetix — courses, communities, and every business you work with."}
        </p>
        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-left text-[12px] text-red-600">
            {errorMessage}
          </div>
        )}
        <PersonLoginForm
          accentColor="#5E2574"
          next={destination}
          initialEmail={prefillEmail}
        />
      </div>
    </div>
  );
}
