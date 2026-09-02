import type { ReactNode } from "react";
import { CommunityImmersiveChrome } from "./_immersive-chrome";

export default async function CommunityImmersiveLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { subAccountId } = await params;
  return (
    <CommunityImmersiveChrome subAccountId={subAccountId}>
      {children}
    </CommunityImmersiveChrome>
  );
}
