import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PersonLoginForm } from "@/components/mymagnetix/person-login-form";
import { getCurrentPerson } from "@/lib/server/person-session";
import { MEMBER_SESSION_COOKIE } from "@/lib/community/member-auth";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "That sign-in link was incomplete. Request a new one below.",
  expired: "That sign-in link has expired or was already used. Request a new one below.",
  error: "Something went wrong signing you in. Request a new link below.",
  no_access: "That account doesn't have any MyMagnetix relationships yet.",
  bridge_unavailable: "Your business portal session couldn't be used to sign in here automatically. Sign in below.",
};

export default async function MyMagnetixLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // Already has a MyMagnetix session — skip the form entirely.
  const existingPerson = await getCurrentPerson();
  if (existingPerson) redirect("/my/gateway");

  // Portal Member -> MyMagnetix bridge (2026-08-16): attempt the
  // automatic bridge ONLY when no error is already showing — this is
  // the loop-safety guard. A stale/expired/invalid ls_member_session
  // fails the bridge exactly once (it comes back here WITH
  // `error=bridge_unavailable`), and this check stops it from being
  // retried on every subsequent render of this same page.
  if (!error) {
    const cookieStore = await cookies();
    const hasMemberCookie = !!cookieStore.get(MEMBER_SESSION_COOKIE)?.value;
    if (hasMemberCookie) redirect("/api/my/bridge-from-member?next=%2Fmy%2Fgateway");
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
          Sign in to MyMagnetix
        </h1>
        <p className="mb-5 mt-1.5 text-[12px] leading-relaxed text-[#909090]">
          One account for everything you&rsquo;re part of across Magnetix — courses, communities, and every business you work with.
        </p>
        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-left text-[12px] text-red-600">
            {errorMessage}
          </div>
        )}
        <PersonLoginForm accentColor="#5E2574" />
      </div>
    </div>
  );
}
