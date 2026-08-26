import type { ReactNode } from "react";
import { SubAccountProvider } from "@/context/sub-account-context";
import { BillingGuard } from "@/components/billing/billing-guard";
import { AppAccent } from "@/components/theme/app-accent";

/**
 * Sibling of `(dashboard)/sa/[subAccountId]/layout.tsx` for full-screen
 * visual builders (theme editors, etc.) that must NOT render inside the
 * dashboard's persistent Sidebar/Header chrome — matching GHL's own
 * distraction-free editor takeover. Route groups don't affect the URL, so
 * pages here live at the exact same paths they would under `(dashboard)`.
 * Duplicates (rather than shares) the SubAccountProvider/BillingGuard
 * wrapping since route groups can't share a layout across trees — kept
 * deliberately thin so there's little to drift out of sync.
 *
 * `<AppAccent/>` (found missing here during the Phase 2A Puck editor task,
 * fixed for every route in this group, not just the new one): it only
 * toggles a class on `<html>` and only needs `useAuth()` — no dependency on
 * anything `(dashboard)`-specific — so it's safe to mount here too. Without
 * it, a *direct* load of a builder route (not arrived at via in-app
 * navigation from `(dashboard)`, e.g. a hard refresh or a typed/bookmarked
 * URL) renders with the wrong theme, since `<html>`'s class only persists
 * across CLIENT-SIDE navigations, not a fresh document load. This applies
 * equally to the pre-existing V1 page editor and the new Puck editor below.
 */
export default async function BuilderSubAccountLayout({
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
