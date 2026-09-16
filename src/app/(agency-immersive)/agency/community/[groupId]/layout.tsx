import type { ReactNode } from "react";
import { AppAccent } from "@/components/theme/app-accent";
import { AgencyImmersiveChrome } from "./_agency-immersive-chrome";

/**
 * Agency Community's own route group (2026-09-16) — full-page, no
 * `(dashboard)` Sidebar/Header, matching the tenant immersive Community
 * experience's own reasoning (see the sibling `(immersive)` group). A
 * SEPARATE top-level route group rather than nesting under `(dashboard)`
 * so `/agency/community` (the list, still inside the normal dashboard
 * chrome) and `/agency/community/[groupId]` (this, full-page) can coexist
 * at their natural URLs — Next.js resolves by literal path, not by which
 * parenthesized group a route lives in, so there's no conflict.
 */
export default function AgencyCommunityImmersiveLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AgencyImmersiveChrome>
      {children}
      <AppAccent />
    </AgencyImmersiveChrome>
  );
}
