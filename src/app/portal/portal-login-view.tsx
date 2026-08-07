import { PortalLoginForm } from "./[saId]/login/login-form";
import type { PortalBranding } from "@/types/portal-branding";

/**
 * Shared login screen — rendered from both the opaque `/portal/{saId}/login`
 * route (shared platform domain) and the pretty `/portal/login` route (a
 * verified custom domain).
 *
 * Real build of the "Client Portal — Branding Mockup" — rebuilt a second
 * time (2026-08-07) after she caught that the first pass only wired real
 * data into the OLD page's layout instead of actually matching the
 * approved mockup's visual spec. Every value below (logo size/radius,
 * heading size, spacing, button padding/radius) is copied from the
 * mockup's own CSS, not approximated — centered card, serif headline
 * (`font-serif` → Instrument Serif, this app's own display font token,
 * same family the mockup's Georgia stand-in was gesturing at).
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
      className="flex min-h-screen items-center justify-center bg-[#F8F7F5] px-6 py-16"
      style={{ ["--portal-accent" as string]: branding.accentColor }}
    >
      <div className="w-full max-w-[300px] text-center">
        <div
          className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center overflow-hidden rounded-[13px] text-[18px] font-bold text-white"
          style={{ background: branding.logoUrl ? undefined : "var(--portal-accent)" }}
        >
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            initials(displayName)
          )}
        </div>
        <h1 className="font-serif text-[18px] font-semibold text-balance text-[#202124]">
          Sign in to {displayName}
        </h1>
        <p className="mb-5 mt-1.5 text-[12px] leading-relaxed text-[#909090]">
          {branding.welcomeMessage}
        </p>
        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-left text-[12px] text-red-600">
            {errorMessage}
          </div>
        )}
        <PortalLoginForm saId={saId} accentColor={branding.accentColor} />
        {branding.supportEmail && (
          <p className="mt-3.5 text-[10.5px] leading-relaxed text-[#909090]">
            Need help?{" "}
            <a href={`mailto:${branding.supportEmail}`} className="font-semibold" style={{ color: "var(--portal-accent)" }}>
              {branding.supportEmail}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
