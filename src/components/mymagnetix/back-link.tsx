import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Standard "go back" control for MyMagnetix list/detail pages reached off
 * the desktop sidebar — which is `hidden lg:flex` (see
 * src/app/my/(app)/layout.tsx), so on mobile/installed-PWA these pages
 * have no persistent nav chrome of their own beyond the header's hamburger
 * drawer. Real user QA (2026-09-02) found My Communities left mobile
 * visitors with no obvious way back at all. Mirrors the existing
 * "Back to MyMagnetix" link already used on the Client Portal
 * (portal-home-view.tsx's BackToMyMagnetixLink) — same visual language,
 * different destination: that one bridges a Person out of a business-
 * scoped Portal session back to the global MyMagnetix home via an API
 * route; this one is a plain in-app Link between two pages already in the
 * same MyMagnetix session, so no bridge/prefetch caveat applies.
 */
export function MyMagnetixBackLink({
  href = "/my",
  label = "Back to MyMagnetix",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#6B7280] transition-colors hover:text-[#111827]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
