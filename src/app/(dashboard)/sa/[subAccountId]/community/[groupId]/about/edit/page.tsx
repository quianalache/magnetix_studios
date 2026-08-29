import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import { CommunityShell } from "@/components/community/community-shell";
import { AboutEditPage } from "@/components/community/about-edit-page";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Staff Community-in-CRM — Edit About. Mirrors the member-facing
 * `/c/[saId]/[groupSlug]/about/edit/page.tsx` (same `AboutEditPage`
 * component, same save route), same moderator re-check as every other
 * gated Community sub-page (Settings → General's own precedent) rather
 * than trusting the About page's UI-level hide of the "Edit About" link.
 */
export default async function StaffAboutEditPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { subAccountId: saId, groupId } = await params;
  const access = await requireStaffGroupPageAccess(
    saId,
    groupId,
    `/sa/${saId}/community/${groupId}/about/edit`,
  );
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership } = access;
  if (membership.role !== "moderator") notFound();

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
      viewerIsModerator
      staffGroupId={groupId}
    >
      <AboutEditPage
        saId={saId}
        pretty={false}
        staffGroupId={groupId}
        groupId={group.id}
        groupSlug={group.slug}
        initial={{
          tagline: group.tagline,
          aboutHtml: group.aboutHtml,
          about: group.about,
          aboutMedia: group.aboutMedia,
          cardImageUrl: group.cardImageUrl,
          aboutBenefits: group.aboutBenefits,
          showAboutBenefits: group.showAboutBenefits,
        }}
      />
    </CommunityShell>
  );
}
