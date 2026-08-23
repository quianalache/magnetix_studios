import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import {
  listCommunityReviews,
  listCommunityTiers,
} from "@/lib/server/community-service";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { CommunityAboutView } from "@/components/community/community-about-view";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Staff Community-in-CRM — About. Close mirror of /c/[saId]/[groupSlug]/page.tsx,
 * limited to the "joined" branch: `requireStaffGroupPageAccess` only resolves
 * with `kind: "ok"` once staff already has an active GroupMembership (moderator,
 * via the staff→member bridge / ensure-session route), so the guest/pending
 * public-prospect branch that the member-facing page also renders never applies
 * here. See the Staff Community Integration report.
 */
export default async function StaffAboutPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { subAccountId: saId, groupId } = await params;
  const access = await requireStaffGroupPageAccess(saId, groupId, `/sa/${saId}/community/${groupId}/about`);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership } = access;
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;

  const [tiers, reviews] = await Promise.all([
    listCommunityTiers({ subAccountId: saId, groupId: group.id, activeOnly: true }),
    listCommunityReviews({ subAccountId: saId, groupId: group.id, limit: 24 }),
  ]);

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
      group={group}
      active="about"
      viewer={viewer}
      viewerIsModerator={membership.role === "moderator"}
      staffGroupId={groupId}
    >
      <CommunityAboutView
        saId={saId}
        pretty={false}
        staffGroupId={groupId}
        group={group}
        brand={brand}
        state="joined"
        member={member}
        membership={membership}
        tiers={tiers}
        reviews={reviews}
      />
    </CommunityShell>
  );
}
