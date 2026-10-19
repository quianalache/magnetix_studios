import { PortalLoginForm } from "./[saId]/login/login-form";
import { PublicAuthShell } from "@/components/public/public-shell";
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
  used: "That sign-in link has already been used. Request a new one below.",
  inactive:
    "Your account is no longer active. Contact us if you think this is a mistake.",
  error: "Something went wrong signing you in. Request a new link below.",
};


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

  // Tenant variant of the shared public sign-in shell (2026-10-16). Every
  // value comes from the existing portal branding — name, logo, accent,
  // welcome message, support email — with the sub-account name as the
  // existing fallback. No "Powered by" (it never had one).
  return (
    <PublicAuthShell
      variant={{ kind: "tenant", brand: { name: displayName, logoUrl: branding.logoUrl, primary: branding.accentColor } }}
      title={`Sign in to ${displayName}`}
      description={branding.welcomeMessage}
      notice={
        errorMessage ? (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-left text-sm text-red-600" role="alert">
            {errorMessage}
          </div>
        ) : null
      }
      footerNote={
        branding.supportEmail ? (
          <>
            Need help?{" "}
            <a href={`mailto:${branding.supportEmail}`} className="tenant-text font-semibold">
              {branding.supportEmail}
            </a>
          </>
        ) : null
      }
    >
      <PortalLoginForm saId={saId} accentColor={branding.accentColor} />
    </PublicAuthShell>
  );
}
