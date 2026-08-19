import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { BrandingWorkspace } from "@/components/community/settings/branding-workspace";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Community Settings → Branding. Same admin-only re-verification as
 * General (`settings/page.tsx`) — a moderator-role check independent of
 * whatever the Settings nav happens to show/hide client-side.
 */
export default async function CommunityBrandingSettingsPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
}) {
  const { saId, groupSlug } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership, gate } = access;
  void gate;
  if (membership.role !== "moderator") notFound();

  const pretty = await isCommunityPrettyRequest(saId);
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  return (
    <CommunityShell
      saId={saId}
      pretty={pretty}
      group={group}
      active="settings"
      viewer={viewer}
      viewerIsModerator
    >
      <BrandingWorkspace
        saId={saId}
        pretty={pretty}
        groupId={group.id}
        groupSlug={group.slug}
        // Same Timestamp-class-instance fix `settings/page.tsx` already
        // needed — BrandingWorkspace is also "use client" and never reads
        // either field.
        theme={group.theme}
        brand={brand}
      />
    </CommunityShell>
  );
}
