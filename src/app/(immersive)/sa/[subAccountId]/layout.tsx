import type { ReactNode } from "react";
import { SubAccountProvider } from "@/context/sub-account-context";
import { BillingGuard } from "@/components/billing/billing-guard";
import { CrmScope } from "@/components/theme/crm-scope";

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
 * `<CrmScope>` wraps the group in the fixed Magnetix CRM system (server-
 * rendered, so a direct load or hard refresh renders the right system with
 * no flash) — same as every other CRM layout.
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
        <CrmScope>{children}</CrmScope>
      </BillingGuard>
    </SubAccountProvider>
  );
}
