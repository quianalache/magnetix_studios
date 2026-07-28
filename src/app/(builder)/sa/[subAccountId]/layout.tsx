import type { ReactNode } from "react";
import { SubAccountProvider } from "@/context/sub-account-context";
import { BillingGuard } from "@/components/billing/billing-guard";

/**
 * Sibling of `(dashboard)/sa/[subAccountId]/layout.tsx` for full-screen
 * visual builders (theme editors, etc.) that must NOT render inside the
 * dashboard's persistent Sidebar/Header chrome — matching GHL's own
 * distraction-free editor takeover. Route groups don't affect the URL, so
 * pages here live at the exact same paths they would under `(dashboard)`.
 * Duplicates (rather than shares) the SubAccountProvider/BillingGuard
 * wrapping since route groups can't share a layout across trees — kept
 * deliberately thin so there's little to drift out of sync.
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
      <BillingGuard>{children}</BillingGuard>
    </SubAccountProvider>
  );
}
