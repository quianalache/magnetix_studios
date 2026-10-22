import { Lock, Sparkles } from "lucide-react";
import { platformOrigin } from "@/lib/domains/public-url";
import { PublicAction, PublicStateShell } from "@/components/public/public-shell";

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
    <PublicStateShell
      variant={{ kind: "tenant", brand: { name: businessName, logoUrl: logoUrl ?? null } }}
      icon={Lock}
      tone="brand"
      title={reason === "expired" ? "This Reading link has expired" : "Your Reading is saved privately"}
      description={
        <>
          Open it in MyMagnetix — sign in with the email you used when you got your Reading. First time? We&apos;ll email you a link
          to finish setting up access.
        </>
      }
      action={
        <PublicAction href={`${origin}/my/login?next=${encodeURIComponent(next)}`}>
          <Sparkles className="h-4 w-4" />
          Open your Reading in MyMagnetix
        </PublicAction>
      }
    >
      <span data-reading-access-gate hidden />
    </PublicStateShell>
  );
}
