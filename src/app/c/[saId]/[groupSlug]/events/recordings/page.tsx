import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { CommunityShell } from "@/components/community/community-shell";
import { CommunityRecordingsView } from "@/components/community/community-recordings-view";
import type { AuthorView } from "@/types/community";
export default async function CommunityRecordingsPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
}) {
  const { saId, groupSlug } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);
  const viewer: AuthorView = {
    memberId: access.member.id,
    displayName:
      access.member.displayName?.trim() ||
      access.member.email.split("@")[0] ||
      "Member",
    avatarUrl: access.member.avatarUrl,
    level: access.membership.level,
  };
  const pretty = await isCommunityPrettyRequest(saId);
  return (
    <CommunityShell
      saId={saId}
      pretty={pretty}
      group={access.group}
      active="events"
      viewer={viewer}
      viewerIsModerator={access.membership.role === "moderator"}
    >
      <CommunityRecordingsView
        eventsHref={
          pretty
            ? `/communities/${groupSlug}/events`
            : `/c/${saId}/${groupSlug}/events`
        }
      />
    </CommunityShell>
  );
}
