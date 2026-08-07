import { PortalLoginForm } from "./[saId]/login/login-form";
import type { PortalBranding } from "@/types/portal-branding";

/**
 * Shared login screen — rendered from both the opaque `/portal/{saId}/login`
 * route (shared platform domain) and the pretty `/portal/login` route (a
 * verified custom domain), so a client's whole sign-in flow can stay on
 * their coach's own branded domain instead of bouncing back to the shared
 * platform one partway through.
 *
 * Real build of the "Client Portal — Branding Mockup" she reviewed
 * 2026-08-06/07 — portal name, welcome message, logo/initials, and accent
 * colour all come from `PortalBranding` (see portal-branding settings page)
 * instead of the sub-account's own internal `name` field.
 */

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "That sign-in link was incomplete. Request a new one below.",
  expired:
    "That sign-in link has expired or was already used. Request a new one below.",
  inactive:
    "Your account is no longer active. Contact us if you think this is a mistake.",
  error: "Something went wrong signing you in. Request a new link below.",
};

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("") || "?"
  ).toUpperCase();
}

export function PortalLoginView({
  saId,
  branding,
  fallbackName,
  errorCode,
}: {
  saId: string;
  branding: PortalBranding;
  fallbackName: string;
  errorCode?: string;
}) {
  const errorMessage = errorCode ? (ERROR_MESSAGES[errorCode] ?? null) : null;
  const displayName = branding.portalName || fallbackName;

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[#F8F7F5] px-4 py-16"
      style={{ ["--portal-accent" as string]: branding.accentColor }}
    >
      <div className="w-full max-w-md rounded-xl border border-[#E4E4E4] bg-white p-8 shadow-sm">
        <div
          className="mb-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-[15px] font-bold text-white"
          style={{ background: branding.logoUrl ? undefined : "var(--portal-accent)" }}
        >
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            initials(displayName)
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#202124]">
          Sign in to {displayName}
        </h1>
        <p className="mt-2 text-sm text-[#909090]">{branding.welcomeMessage}</p>
        {errorMessage && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
            {errorMessage}
          </div>
        )}
        <PortalLoginForm saId={saId} accentColor={branding.accentColor} />
        {branding.supportEmail && (
          <p className="mt-6 border-t border-[#E4E4E4] pt-4 text-xs text-[#909090]">
            Need help?{" "}
            <a href={`mailto:${branding.supportEmail}`} className="font-medium" style={{ color: "var(--portal-accent)" }}>
              {branding.supportEmail}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
