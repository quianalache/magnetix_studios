import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { listCommunityEventsServerSide } from "@/lib/server/community-event-service";
import {
  CommunityEventsView,
  type CommunityEventViewModel,
} from "@/components/community/community-events-view";
import { CommunityShell } from "@/components/community/community-shell";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

function serialize(
  event: Awaited<ReturnType<typeof listCommunityEventsServerSide>>[number]
): CommunityEventViewModel {
  const ms = (value: unknown) => {
    const v = value as { toMillis?: () => number; seconds?: number } | null;
    return typeof v?.toMillis === "function"
      ? v.toMillis()
      : v?.seconds
        ? v.seconds * 1000
        : null;
  };
  return {
    ...event,
    startAt: ms(event.startAt),
    endAt: ms(event.endAt),
    createdAt: null,
    updatedAt: null,
  } as CommunityEventViewModel;
}

export default async function CommunityEventsPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
}) {
  const { saId, groupSlug } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);
  const { group, member, membership } = access;
  const pretty = await isCommunityPrettyRequest(saId);
  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };
  const events = await listCommunityEventsServerSide(saId, group.id);
  return (
    <CommunityShell
      saId={saId}
      pretty={pretty}
      group={group}
      active="events"
      viewer={viewer}
      viewerIsModerator={membership.role === "moderator"}
    >
      <CommunityEventsView
        saId={saId}
        groupId={group.id}
        groupSlug={group.slug}
        pretty={pretty}
        categories={group.categories}
        initialEvents={events.map(serialize)}
        moderator={membership.role === "moderator"}
      />
    </CommunityShell>
  );
}
