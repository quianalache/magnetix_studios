import { PortalLoginForm } from "./[saId]/login/login-form";

/**
 * Shared login screen — rendered from both the opaque `/portal/{saId}/login`
 * route (shared platform domain) and the pretty `/portal/login` route (a
 * verified custom domain), so a client's whole sign-in flow can stay on
 * their coach's own branded domain instead of bouncing back to the shared
 * platform one partway through. Same visual as before this pass — the
 * design-refresh mockup she reviewed is a separate, not-yet-approved track;
 * this fix is purely about the URL/redirect chain.
 */

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "That sign-in link was incomplete. Request a new one below.",
  expired:
    "That sign-in link has expired or was already used. Request a new one below.",
  inactive:
    "Your account is no longer active. Contact us if you think this is a mistake.",
  error: "Something went wrong signing you in. Request a new link below.",
};

export function PortalLoginView({
  saId,
  subName,
  errorCode,
}: {
  saId: string;
  subName: string;
  errorCode?: string;
}) {
  const errorMessage = errorCode ? (ERROR_MESSAGES[errorCode] ?? null) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F5] px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-[#E4E4E4] bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202124]">
          Sign in to {subName}
        </h1>
        <p className="mt-2 text-sm text-[#909090]">
          Enter your email and we&apos;ll send you a one-tap sign-in link. No
          password needed.
        </p>
        {errorMessage && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
            {errorMessage}
          </div>
        )}
        <PortalLoginForm saId={saId} />
      </div>
    </div>
  );
}
