import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { CommunityShell } from "@/components/community/community-shell";
import { AboutEditPage } from "@/components/community/about-edit-page";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Community "Edit About" — member-facing. Same moderator-only re-check
 * pattern as Community Settings → General (`/c/[saId]/[groupSlug]/
 * settings/page.tsx`): the "Edit About" link on the real About page is
 * already hidden from non-moderators, but a direct hit on this URL is
 * independently re-verified here too, never trusted from the UI alone.
 */
export default async function CommunityAboutEditPage({
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

  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  return (
    <CommunityShell saId={saId} pretty={pretty} group={group} active="about" viewer={viewer} viewerIsModerator>
      <AboutEditPage
        saId={saId}
        pretty={pretty}
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
