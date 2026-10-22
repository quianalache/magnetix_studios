import { Lock, Sparkles } from "lucide-react";
import { platformOrigin } from "@/lib/domains/public-url";

/**
 * Shown instead of a Reading to anyone without access (2026-10-21) — a
 * Reading link on its own no longer opens the Reading. The person it
 * belongs to signs into MyMagnetix with their email and lands straight on
 * it. Reveals nothing about the Reading or whose it is.
 */
export function ReadingAccessGate({
  businessName,
  logoUrl,
  readingId,
  reason = "private",
}: {
  businessName: string;
  logoUrl?: string | null;
  readingId: string;
  /** "expired" — a result link from more than 24 hours ago. */
  reason?: "private" | "expired";
}) {
  const next = `/my/readings/${readingId}`;
  // MyMagnetix lives on the platform domain (its session cookie does too),
  // even when this gate is served on a business's own domain.
  const origin = platformOrigin();
  return (
    <div className="tenant-surface public-plain min-h-screen px-4 py-10 sm:px-6" data-reading-access-gate>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={businessName} className="h-6 w-auto" />
          ) : null}
          <span className="font-medium text-foreground">{businessName}</span>
        </div>
        <div className="rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
          <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">
            {reason === "expired" ? "This Reading link has expired" : "Your Reading is saved privately"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Open it in MyMagnetix — sign in with the email you used when you got your Reading. First time? We&apos;ll email you a link to
            finish setting up access.
          </p>
          <a
            href={`${origin}/my/login?next=${encodeURIComponent(next)}`}
            className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" />
            Open your Reading in MyMagnetix
          </a>
        </div>
      </div>
    </div>
  );
}
