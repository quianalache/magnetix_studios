import type { ReactNode } from "react";
import { CommunityImmersiveChrome } from "./_immersive-chrome";

export default async function CommunityImmersiveLayout({
  children,
  modal,
  params,
}: {
  children: ReactNode;
  // Post-detail intercepting route (2026-09-03) — see
  // @modal/(.)post/[postId]/page.tsx. Empty (default.tsx) on every URL
  // except a post opened via client-side navigation from within this
  // community; renders alongside `children`, never replacing it.
  modal: ReactNode;
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { subAccountId } = await params;
  return (
    <CommunityImmersiveChrome subAccountId={subAccountId}>
      {children}
      {modal}
    </CommunityImmersiveChrome>
  );
}
