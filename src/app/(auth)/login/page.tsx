import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { LogoMark } from "@/components/brand/logo-mark";
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

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <LogoMark size={24} idSuffix="-login" />
            <h1 className="text-2xl font-bold">{CUSTOM_BRAND.name}</h1>
          </Link>
          <p className="text-muted-foreground mt-2 text-sm">
            Welcome back. Sign in to your workspace.
          </p>
        </div>

        {/* Suspense required because LoginForm reads ?email= via
            useSearchParams to pre-fill from "you already have an account"
            redirects out of the signup page. */}
        <Suspense
          fallback={<div className="bg-card h-[420px] rounded-xl border" />}
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
