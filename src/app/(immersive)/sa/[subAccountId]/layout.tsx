import type { ReactNode } from "react";
import { SubAccountProvider } from "@/context/sub-account-context";
import { BillingGuard } from "@/components/billing/billing-guard";
import { AppAccent } from "@/components/theme/app-accent";

/**
 * Sibling of `(dashboard)/sa/[subAccountId]/layout.tsx` (and
 * `(builder)/sa/[subAccountId]/layout.tsx`, the same pattern for visual
 * builders) for full-page CRM experiences that must NOT render inside the
 * dashboard's persistent Sidebar/Header/BottomTabBar chrome — first used
 * for CRM Community (2026-09-02), matching the immersive, full-viewport
 * presentation the member-facing `/c/[saId]/[groupSlug]` route already
 * has. Route groups don't affect the URL, so pages here live at the exact
 * same `/sa/[subAccountId]/...` paths they would under `(dashboard)`.
 * Duplicates (rather than shares) the SubAccountProvider/BillingGuard
 * wrapping since route groups can't share a layout across trees — kept
 * deliberately thin so there's little to drift out of sync.
 *
 * `<AppAccent/>` is included for the exact reason `(builder)`'s copy of
 * this file already documents: it only toggles a class on `<html>` and
 * only needs `useAuth()` — no dependency on anything `(dashboard)`-
 * specific — so it's safe to mount here too. Without it, a *direct* load
 * of a route in this group (not arrived at via in-app navigation from
 * `(dashboard)`, e.g. a hard refresh or a typed/bookmarked URL) renders
 * with the wrong theme, since `<html>`'s class only persists across
 * CLIENT-SIDE navigations, not a fresh document load.
 */
export default async function ImmersiveSubAccountLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ subAccountId: string }>;
}) {
  const { subAccountId } = await params;
  return (
    <SubAccountProvider subAccountId={subAccountId}>
      <BillingGuard>
        {children}
        <AppAccent />
      </BillingGuard>
    </SubAccountProvider>
  );
}
