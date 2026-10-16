import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { PublicAuthShell } from "@/components/public/public-shell";
import { CUSTOM_BRAND } from "@/config/landing";
import { getCurrentStaffUser } from "@/lib/auth/current-staff";

export const dynamic = "force-dynamic";

/** Relative-path-only, same guard /my/login's safeNext() already uses —
 *  a `redirect` query param must never be treated as an absolute/external
 *  URL for a server-side redirect(). */
function safeRedirectTarget(value: string | undefined): string | null {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : null;
}

export const metadata: Metadata = { title: `Sign in · ${CUSTOM_BRAND.name}` };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  // 2026-09-02 double-login fix: a visit to /login with an already-valid
  // Business Center __session (e.g. /gateway's own "Business Center" link,
  // which always carries ?redirect=/dashboard, or a stale bookmark/back-
  // navigation) previously re-rendered the credential form regardless —
  // middleware's handleValidToken just passes valid-session requests
  // through untouched, and this page never checked. Mirrors the exact
  // pattern /my/login already uses for the MyMagnetix identity
  // (getCurrentPerson() -> redirect if present) — same architecture,
  // applied to the Business Center identity this neutral page was
  // missing it for. Deliberately scoped to staffUser only (not also
  // getCurrentPerson()): a person-only session hitting this page for a
  // Business-Center-protected destination has no __session, so redirecting
  // it onward would just bounce straight back here via middleware's own
  // handleInvalidToken — an infinite loop. Showing the form in that case
  // is correct, unchanged behavior.
  const { redirect: redirectParam } = await searchParams;
  const staffUser = await getCurrentStaffUser();
  if (staffUser) {
    redirect(safeRedirectTarget(redirectParam) ?? "/gateway");
  }

  // Magnetix-owned sign-in on the shared public shell (2026-10-16). The
  // LoginForm draws its own card, so the shell provides the frame only.
  return (
    <PublicAuthShell variant={{ kind: "magnetix" }} title="Welcome back" description="Sign in to your workspace." card={false}>
      {/* Suspense required because LoginForm reads ?email= via
          useSearchParams to pre-fill from "you already have an account"
          redirects out of the signup page. */}
      <Suspense fallback={<div className="bg-card h-[420px] rounded-xl border" />}>
        <LoginForm />
      </Suspense>
    </PublicAuthShell>
  );
}
